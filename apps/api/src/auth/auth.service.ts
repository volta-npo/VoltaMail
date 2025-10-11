import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Organization,
  OrganizationRole,
  Project,
  ProjectMember,
  ProjectRole,
  Session,
  User
} from '@email-automation/database';
import { PrismaService } from '../prisma.service.js';
import { SessionService } from './session.service.js';
import { SignUpDto } from './dto/signup.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { GoogleAuthDto } from './dto/google.dto.js';
import { SessionResponse } from './dto/session-response.dto.js';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';

interface SessionContext {
  user: User;
  organization: Organization;
  projectMemberships: (ProjectMember & { project: Project })[];
  session: Session;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
    private readonly configService: ConfigService
  ) {}

  async signUp(dto: SignUpDto): Promise<SessionResponse> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() }
    });

    if (existing) {
      throw new BadRequestException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const projectName = dto.projectName ?? 'Default Project';

    const transactionalResult = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: dto.organizationName,
          plan: 'free'
        }
      });

      const user = await tx.user.create({
        data: {
          email: dto.email.toLowerCase(),
          passwordHash,
          displayName: dto.displayName ?? null,
          organizationId: organization.id,
          role: OrganizationRole.OWNER
        }
      });

      const project = await tx.project.create({
        data: {
          organizationId: organization.id,
          name: projectName,
          timezone: 'UTC'
        }
      });

      await tx.projectMember.create({
        data: {
          projectId: project.id,
          userId: user.id,
          role: ProjectRole.OWNER
        }
      });

      const membership = await tx.projectMember.findMany({
        where: { userId: user.id },
        include: {
          project: true
        }
      });

      return {
        user,
        organization,
        projectMemberships: membership
      };
    });

    const session = await this.sessionService.createSession(transactionalResult.user.id);

    return this.toSessionResponse({
      ...transactionalResult,
      session
    });
  }

  async login(dto: LoginDto): Promise<SessionResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: {
        organization: true,
        projectMemberships: {
          include: {
            project: true
          }
        }
      }
    });

    if (!user?.passwordHash) {
      throw new BadRequestException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new BadRequestException('Invalid credentials');
    }

    const session = await this.sessionService.createSession(user.id);

    return this.toSessionResponse({
      user,
      organization: user.organization,
      projectMemberships: user.projectMemberships,
      session
    });
  }

  async googleAuth(dto: GoogleAuthDto): Promise<SessionResponse> {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) {
      throw new BadRequestException('Google OAuth provider not configured.');
    }

    const oauthClient = new OAuth2Client({
      clientId,
      clientSecret: this.configService.get<string>('GOOGLE_CLIENT_SECRET') ?? undefined
    });

    let payload;
    try {
      const ticket = await oauthClient.verifyIdToken({
        idToken: dto.idToken,
        audience: clientId
      });
      payload = ticket.getPayload();
    } catch {
      throw new BadRequestException('Invalid Google credentials.');
    }

    if (!payload?.email) {
      throw new BadRequestException('Google account does not expose an email address.');
    }

    const email = payload.email.toLowerCase();
    const googleAccountId = payload.sub ?? email;
    const displayName = payload.name ?? email.split('@')[0] ?? 'New User';
    const defaultProjectName = 'Primary Project';

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    let userId = existingUser?.id ?? null;

    if (!existingUser) {
      await this.prisma.$transaction(async (tx) => {
        const organization = await tx.organization.create({
          data: {
            name: payload.hd ? `${payload.hd} Workspace` : `${displayName}'s Organization`,
            plan: 'free'
          }
        });

        const project = await tx.project.create({
          data: {
            organizationId: organization.id,
            name: defaultProjectName,
            timezone: 'UTC'
          }
        });

        const user = await tx.user.create({
          data: {
            email,
            passwordHash: null,
            displayName,
            organizationId: organization.id,
            role: OrganizationRole.OWNER
          }
        });

        await tx.projectMember.create({
          data: {
            projectId: project.id,
            userId: user.id,
            role: ProjectRole.OWNER
          }
        });

        await tx.account.create({
          data: {
            userId: user.id,
            provider: 'google',
            providerAccountId: googleAccountId,
            type: 'oauth',
            id_token: dto.idToken,
            token_type: 'Bearer'
          }
        });

        userId = user.id;
      });
    } else {
      await this.prisma.account.upsert({
        where: {
          provider_providerAccountId: {
            provider: 'google',
            providerAccountId: googleAccountId
          }
        },
        update: {
          id_token: dto.idToken,
          token_type: 'Bearer'
        },
        create: {
          userId: existingUser.id,
          provider: 'google',
          providerAccountId: googleAccountId,
          type: 'oauth',
          id_token: dto.idToken,
          token_type: 'Bearer'
        }
      });

      if (displayName && displayName !== existingUser.displayName) {
        await this.prisma.user.update({
          where: { id: existingUser.id },
          data: { displayName }
        });
      }

      userId = existingUser.id;
    }

    if (!userId) {
      throw new BadRequestException('Failed to establish Google user.');
    }

    const hydratedUser = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        organization: true,
        projectMemberships: {
          include: {
            project: true
          }
        }
      }
    });

    if (!hydratedUser) {
      throw new BadRequestException('Unable to load user after Google authentication.');
    }

    const session = await this.sessionService.createSession(hydratedUser.id);

    return this.toSessionResponse({
      user: hydratedUser,
      organization: hydratedUser.organization,
      projectMemberships: hydratedUser.projectMemberships,
      session
    });
  }

  private toSessionResponse(context: SessionContext): SessionResponse {
    return {
      sessionToken: context.session.sessionToken,
      sessionExpiresAt: context.session.expires.toISOString(),
      user: {
        id: context.user.id,
        email: context.user.email,
        displayName: context.user.displayName,
        organizationRole: context.user.role
      },
      organization: {
        id: context.organization.id,
        name: context.organization.name,
        plan: context.organization.plan
      },
      projects: context.projectMemberships.map((membership) => ({
        id: membership.project.id,
        name: membership.project.name,
        timezone: membership.project.timezone,
        role: membership.role
      }))
    };
  }
}
