import { describe, expect, it, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { PrismaService } from '../prisma.service';
import { ConfigService } from '@nestjs/config';
import { OrganizationRole, ProjectRole } from '@email-automation/database';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';

// Mock modules
vi.mock('bcryptjs');
vi.mock('google-auth-library');

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let sessionService: SessionService;
  let configService: ConfigService;

  const mockDate = new Date('2024-01-01T00:00:00Z');

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
    displayName: 'Test User',
    organizationId: 'org-123',
    role: OrganizationRole.OWNER,
    createdAt: mockDate,
    updatedAt: mockDate,
  };

  const mockOrganization = {
    id: 'org-123',
    name: 'Test Organization',
    plan: 'free',
    createdAt: mockDate,
    updatedAt: mockDate,
  };

  const mockProject = {
    id: 'project-123',
    organizationId: 'org-123',
    name: 'Test Project',
    timezone: 'UTC',
    brandingJson: null,
    createdAt: mockDate,
    updatedAt: mockDate,
  };

  const mockProjectMember = {
    id: 'member-123',
    projectId: 'project-123',
    userId: 'user-123',
    role: ProjectRole.OWNER,
    createdAt: mockDate,
    updatedAt: mockDate,
    project: mockProject,
  };

  const mockSession = {
    id: 'session-123',
    sessionToken: 'session-token-123',
    userId: 'user-123',
    expires: new Date('2024-01-08T00:00:00Z'),
    createdAt: mockDate,
    updatedAt: mockDate,
  };

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();

    prisma = {
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      organization: {
        create: vi.fn(),
      },
      project: {
        create: vi.fn(),
        findUnique: vi.fn(),
      },
      projectMember: {
        create: vi.fn(),
        findMany: vi.fn(),
      },
      account: {
        create: vi.fn(),
        upsert: vi.fn(),
      },
      $transaction: vi.fn(),
    } as any;

    sessionService = {
      createSession: vi.fn(),
      invalidateSession: vi.fn(),
      getSessionWithUser: vi.fn(),
    } as any;

    configService = {
      get: vi.fn(),
    } as any;

    service = new AuthService(prisma, sessionService, configService);
  });

  describe('signUp', () => {
    const signUpDto = {
      email: 'newuser@example.com',
      password: 'SecurePass123!',
      organizationName: 'New Organization',
      displayName: 'New User',
      projectName: 'My Project',
    };

    it('should successfully register a new user with all fields', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);
      vi.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password' as never);
      vi.spyOn(sessionService, 'createSession').mockResolvedValue(mockSession);

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
        return await callback(prisma);
      });

      vi.spyOn(prisma.organization, 'create').mockResolvedValue(mockOrganization);
      vi.spyOn(prisma.user, 'create').mockResolvedValue(mockUser);
      vi.spyOn(prisma.project, 'create').mockResolvedValue(mockProject);
      vi.spyOn(prisma.projectMember, 'create').mockResolvedValue(mockProjectMember);
      vi.spyOn(prisma.projectMember, 'findMany').mockResolvedValue([mockProjectMember]);

      const result = await service.signUp(signUpDto);

      expect(result).toEqual({
        sessionToken: mockSession.sessionToken,
        sessionExpiresAt: mockSession.expires.toISOString(),
        user: {
          id: mockUser.id,
          email: mockUser.email,
          displayName: mockUser.displayName,
          organizationRole: mockUser.role,
        },
        organization: {
          id: mockOrganization.id,
          name: mockOrganization.name,
          plan: mockOrganization.plan,
        },
        projects: [
          {
            id: mockProject.id,
            name: mockProject.name,
            timezone: mockProject.timezone,
            role: ProjectRole.OWNER,
          },
        ],
      });

      expect(bcrypt.hash).toHaveBeenCalledWith(signUpDto.password, 12);
      expect(sessionService.createSession).toHaveBeenCalledWith(mockUser.id);
    });

    it('should use default project name when not provided', async () => {
      const dtoWithoutProjectName = {
        ...signUpDto,
        projectName: undefined,
      };

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);
      vi.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password' as never);
      vi.spyOn(sessionService, 'createSession').mockResolvedValue(mockSession);

      let capturedProjectData: any;

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
        return await callback(prisma);
      });

      vi.spyOn(prisma.organization, 'create').mockResolvedValue(mockOrganization);
      vi.spyOn(prisma.user, 'create').mockResolvedValue(mockUser);
      vi.spyOn(prisma.project, 'create').mockImplementation(async (args) => {
        capturedProjectData = args.data;
        return mockProject;
      });
      vi.spyOn(prisma.projectMember, 'create').mockResolvedValue(mockProjectMember);
      vi.spyOn(prisma.projectMember, 'findMany').mockResolvedValue([mockProjectMember]);

      await service.signUp(dtoWithoutProjectName);

      expect(capturedProjectData.name).toBe('Default Project');
    });

    it('should throw error if email already exists', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockUser);

      await expect(service.signUp(signUpDto)).rejects.toThrow(
        new BadRequestException('Email already registered'),
      );

      expect(bcrypt.hash).not.toHaveBeenCalled();
      expect(sessionService.createSession).not.toHaveBeenCalled();
    });

    it('should normalize email to lowercase', async () => {
      const uppercaseEmailDto = {
        ...signUpDto,
        email: 'NewUser@EXAMPLE.COM',
      };

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);
      vi.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password' as never);
      vi.spyOn(sessionService, 'createSession').mockResolvedValue(mockSession);

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
        return await callback(prisma);
      });

      vi.spyOn(prisma.organization, 'create').mockResolvedValue(mockOrganization);
      vi.spyOn(prisma.user, 'create').mockResolvedValue(mockUser);
      vi.spyOn(prisma.project, 'create').mockResolvedValue(mockProject);
      vi.spyOn(prisma.projectMember, 'create').mockResolvedValue(mockProjectMember);
      vi.spyOn(prisma.projectMember, 'findMany').mockResolvedValue([mockProjectMember]);

      await service.signUp(uppercaseEmailDto);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'newuser@example.com' },
      });
    });

    it('should assign OWNER role to organization and project', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);
      vi.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password' as never);
      vi.spyOn(sessionService, 'createSession').mockResolvedValue(mockSession);

      let capturedUserData: any;
      let capturedMemberData: any;

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
        return await callback(prisma);
      });

      vi.spyOn(prisma.organization, 'create').mockResolvedValue(mockOrganization);
      vi.spyOn(prisma.user, 'create').mockImplementation(async (args) => {
        capturedUserData = args.data;
        return mockUser;
      });
      vi.spyOn(prisma.project, 'create').mockResolvedValue(mockProject);
      vi.spyOn(prisma.projectMember, 'create').mockImplementation(async (args) => {
        capturedMemberData = args.data;
        return mockProjectMember;
      });
      vi.spyOn(prisma.projectMember, 'findMany').mockResolvedValue([mockProjectMember]);

      await service.signUp(signUpDto);

      expect(capturedUserData.role).toBe(OrganizationRole.OWNER);
      expect(capturedMemberData.role).toBe(ProjectRole.OWNER);
    });

    it('should handle database transaction failure', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);
      vi.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password' as never);

      vi.spyOn(prisma, '$transaction').mockRejectedValue(new Error('Database transaction failed'));

      await expect(service.signUp(signUpDto)).rejects.toThrow('Database transaction failed');

      expect(sessionService.createSession).not.toHaveBeenCalled();
    });

    it('should handle null displayName', async () => {
      const dtoWithoutDisplayName = {
        ...signUpDto,
        displayName: undefined,
      };

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);
      vi.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password' as never);
      vi.spyOn(sessionService, 'createSession').mockResolvedValue(mockSession);

      let capturedUserData: any;

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
        return await callback(prisma);
      });

      vi.spyOn(prisma.organization, 'create').mockResolvedValue(mockOrganization);
      vi.spyOn(prisma.user, 'create').mockImplementation(async (args) => {
        capturedUserData = args.data;
        return { ...mockUser, displayName: null };
      });
      vi.spyOn(prisma.project, 'create').mockResolvedValue(mockProject);
      vi.spyOn(prisma.projectMember, 'create').mockResolvedValue(mockProjectMember);
      vi.spyOn(prisma.projectMember, 'findMany').mockResolvedValue([mockProjectMember]);

      await service.signUp(dtoWithoutDisplayName);

      expect(capturedUserData.displayName).toBe(null);
    });
  });

  describe('login', () => {
    const loginDto = {
      email: 'test@example.com',
      password: 'SecurePass123!',
    };

    const userWithRelations = {
      ...mockUser,
      organization: mockOrganization,
      projectMemberships: [mockProjectMember],
    };

    it('should successfully login with valid credentials', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(userWithRelations as any);
      vi.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      vi.spyOn(sessionService, 'createSession').mockResolvedValue(mockSession);

      const result = await service.login(loginDto);

      expect(result).toEqual({
        sessionToken: mockSession.sessionToken,
        sessionExpiresAt: mockSession.expires.toISOString(),
        user: {
          id: mockUser.id,
          email: mockUser.email,
          displayName: mockUser.displayName,
          organizationRole: mockUser.role,
        },
        organization: {
          id: mockOrganization.id,
          name: mockOrganization.name,
          plan: mockOrganization.plan,
        },
        projects: [
          {
            id: mockProject.id,
            name: mockProject.name,
            timezone: mockProject.timezone,
            role: ProjectRole.OWNER,
          },
        ],
      });

      expect(bcrypt.compare).toHaveBeenCalledWith(loginDto.password, mockUser.passwordHash);
      expect(sessionService.createSession).toHaveBeenCalledWith(mockUser.id);
    });

    it('should throw error if user does not exist', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        new BadRequestException('Invalid credentials'),
      );

      expect(bcrypt.compare).not.toHaveBeenCalled();
      expect(sessionService.createSession).not.toHaveBeenCalled();
    });

    it('should throw error if user has no password hash (OAuth user)', async () => {
      const oauthUser = {
        ...userWithRelations,
        passwordHash: null,
      };

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(oauthUser as any);

      await expect(service.login(loginDto)).rejects.toThrow(
        new BadRequestException('Invalid credentials'),
      );

      expect(bcrypt.compare).not.toHaveBeenCalled();
      expect(sessionService.createSession).not.toHaveBeenCalled();
    });

    it('should throw error if password is incorrect', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(userWithRelations as any);
      vi.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      await expect(service.login(loginDto)).rejects.toThrow(
        new BadRequestException('Invalid credentials'),
      );

      expect(sessionService.createSession).not.toHaveBeenCalled();
    });

    it('should normalize email to lowercase', async () => {
      const uppercaseLoginDto = {
        email: 'TEST@EXAMPLE.COM',
        password: 'SecurePass123!',
      };

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(userWithRelations as any);
      vi.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      vi.spyOn(sessionService, 'createSession').mockResolvedValue(mockSession);

      await service.login(uppercaseLoginDto);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
        include: {
          organization: true,
          projectMemberships: {
            include: {
              project: true,
            },
          },
        },
      });
    });

    it('should include organization and project memberships in query', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(userWithRelations as any);
      vi.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      vi.spyOn(sessionService, 'createSession').mockResolvedValue(mockSession);

      await service.login(loginDto);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: loginDto.email.toLowerCase() },
        include: {
          organization: true,
          projectMemberships: {
            include: {
              project: true,
            },
          },
        },
      });
    });

    it('should handle bcrypt compare error', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(userWithRelations as any);
      vi.spyOn(bcrypt, 'compare').mockRejectedValue(new Error('bcrypt error'));

      await expect(service.login(loginDto)).rejects.toThrow('bcrypt error');

      expect(sessionService.createSession).not.toHaveBeenCalled();
    });

    it('should handle multiple project memberships', async () => {
      const secondProject = {
        id: 'project-456',
        organizationId: 'org-123',
        name: 'Second Project',
        timezone: 'America/New_York',
        brandingJson: null,
        createdAt: mockDate,
        updatedAt: mockDate,
      };

      const secondMembership = {
        id: 'member-456',
        projectId: 'project-456',
        userId: 'user-123',
        role: ProjectRole.MEMBER,
        createdAt: mockDate,
        updatedAt: mockDate,
        project: secondProject,
      };

      const userWithMultipleProjects = {
        ...userWithRelations,
        projectMemberships: [mockProjectMember, secondMembership],
      };

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(userWithMultipleProjects as any);
      vi.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      vi.spyOn(sessionService, 'createSession').mockResolvedValue(mockSession);

      const result = await service.login(loginDto);

      expect(result.projects).toHaveLength(2);
      expect(result.projects[1]).toEqual({
        id: secondProject.id,
        name: secondProject.name,
        timezone: secondProject.timezone,
        role: ProjectRole.MEMBER,
      });
    });
  });

  describe('googleAuth', () => {
    const googleAuthDto = {
      idToken: 'valid-google-token',
    };

    const googlePayload = {
      sub: 'google-account-123',
      email: 'googleuser@example.com',
      name: 'Google User',
      hd: 'example.com',
    };

    const mockOAuthClient = {
      verifyIdToken: vi.fn(),
    };

    const mockTicket = {
      getPayload: vi.fn(),
    };

    beforeEach(() => {
      vi.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'GOOGLE_CLIENT_ID') return 'test-client-id';
        if (key === 'GOOGLE_CLIENT_SECRET') return 'test-client-secret';
        return undefined;
      });

      (OAuth2Client as any).mockImplementation(() => mockOAuthClient);
    });

    it('should throw error if Google OAuth is not configured', async () => {
      vi.spyOn(configService, 'get').mockReturnValue(undefined);

      await expect(service.googleAuth(googleAuthDto)).rejects.toThrow(
        new BadRequestException('Google OAuth provider not configured.'),
      );
    });

    it('should throw error if Google token verification fails', async () => {
      mockOAuthClient.verifyIdToken.mockRejectedValue(new Error('Invalid token'));

      await expect(service.googleAuth(googleAuthDto)).rejects.toThrow(
        new BadRequestException('Invalid Google credentials.'),
      );
    });

    it('should throw error if Google payload has no email', async () => {
      mockOAuthClient.verifyIdToken.mockResolvedValue(mockTicket);
      mockTicket.getPayload.mockReturnValue({ sub: 'google-123' });

      await expect(service.googleAuth(googleAuthDto)).rejects.toThrow(
        new BadRequestException('Google account does not expose an email address.'),
      );
    });

    it('should create new user and organization for first-time Google login', async () => {
      mockOAuthClient.verifyIdToken.mockResolvedValue(mockTicket);
      mockTicket.getPayload.mockReturnValue(googlePayload);

      vi.spyOn(prisma.user, 'findUnique')
        .mockResolvedValueOnce(null) // First check - user doesn't exist
        .mockResolvedValueOnce({
          // After transaction - hydrated user
          ...mockUser,
          email: googlePayload.email.toLowerCase(),
          displayName: googlePayload.name,
          passwordHash: null,
          organization: mockOrganization,
          projectMemberships: [mockProjectMember],
        } as any);

      vi.spyOn(sessionService, 'createSession').mockResolvedValue(mockSession);

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
        return await callback(prisma);
      });

      vi.spyOn(prisma.organization, 'create').mockResolvedValue(mockOrganization);
      vi.spyOn(prisma.project, 'create').mockResolvedValue(mockProject);
      vi.spyOn(prisma.user, 'create').mockResolvedValue({
        ...mockUser,
        email: googlePayload.email.toLowerCase(),
        displayName: googlePayload.name,
        passwordHash: null,
      });
      vi.spyOn(prisma.projectMember, 'create').mockResolvedValue(mockProjectMember);
      vi.spyOn(prisma.account, 'create').mockResolvedValue({} as any);

      const result = await service.googleAuth(googleAuthDto);

      expect(result.sessionToken).toBe(mockSession.sessionToken);
      expect(prisma.account.create).toHaveBeenCalledWith({
        data: {
          userId: mockUser.id,
          provider: 'google',
          providerAccountId: googlePayload.sub,
          type: 'oauth',
          id_token: googleAuthDto.idToken,
          token_type: 'Bearer',
        },
      });
    });

    it('should use existing user for returning Google login', async () => {
      mockOAuthClient.verifyIdToken.mockResolvedValue(mockTicket);
      mockTicket.getPayload.mockReturnValue(googlePayload);

      const existingGoogleUser = {
        ...mockUser,
        email: googlePayload.email.toLowerCase(),
        passwordHash: null,
      };

      vi.spyOn(prisma.user, 'findUnique')
        .mockResolvedValueOnce(existingGoogleUser) // First check - user exists
        .mockResolvedValueOnce({
          // Hydrated user
          ...existingGoogleUser,
          organization: mockOrganization,
          projectMemberships: [mockProjectMember],
        } as any);

      vi.spyOn(prisma.account, 'upsert').mockResolvedValue({} as any);
      vi.spyOn(prisma.user, 'update').mockResolvedValue(existingGoogleUser);
      vi.spyOn(sessionService, 'createSession').mockResolvedValue(mockSession);

      const result = await service.googleAuth(googleAuthDto);

      expect(result.sessionToken).toBe(mockSession.sessionToken);
      expect(prisma.account.upsert).toHaveBeenCalledWith({
        where: {
          provider_providerAccountId: {
            provider: 'google',
            providerAccountId: googlePayload.sub,
          },
        },
        update: {
          id_token: googleAuthDto.idToken,
          token_type: 'Bearer',
        },
        create: {
          userId: existingGoogleUser.id,
          provider: 'google',
          providerAccountId: googlePayload.sub,
          type: 'oauth',
          id_token: googleAuthDto.idToken,
          token_type: 'Bearer',
        },
      });
    });

    it('should update displayName if changed', async () => {
      mockOAuthClient.verifyIdToken.mockResolvedValue(mockTicket);
      mockTicket.getPayload.mockReturnValue(googlePayload);

      const existingUser = {
        ...mockUser,
        email: googlePayload.email.toLowerCase(),
        displayName: 'Old Name',
        passwordHash: null,
      };

      vi.spyOn(prisma.user, 'findUnique')
        .mockResolvedValueOnce(existingUser)
        .mockResolvedValueOnce({
          ...existingUser,
          displayName: googlePayload.name,
          organization: mockOrganization,
          projectMemberships: [mockProjectMember],
        } as any);

      vi.spyOn(prisma.account, 'upsert').mockResolvedValue({} as any);
      vi.spyOn(prisma.user, 'update').mockResolvedValue({
        ...existingUser,
        displayName: googlePayload.name,
      });
      vi.spyOn(sessionService, 'createSession').mockResolvedValue(mockSession);

      await service.googleAuth(googleAuthDto);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: existingUser.id },
        data: { displayName: googlePayload.name },
      });
    });

    it('should not update displayName if unchanged', async () => {
      mockOAuthClient.verifyIdToken.mockResolvedValue(mockTicket);
      mockTicket.getPayload.mockReturnValue(googlePayload);

      const existingUser = {
        ...mockUser,
        email: googlePayload.email.toLowerCase(),
        displayName: googlePayload.name,
        passwordHash: null,
      };

      vi.spyOn(prisma.user, 'findUnique')
        .mockResolvedValueOnce(existingUser)
        .mockResolvedValueOnce({
          ...existingUser,
          organization: mockOrganization,
          projectMemberships: [mockProjectMember],
        } as any);

      vi.spyOn(prisma.account, 'upsert').mockResolvedValue({} as any);
      vi.spyOn(prisma.user, 'update').mockResolvedValue(existingUser);
      vi.spyOn(sessionService, 'createSession').mockResolvedValue(mockSession);

      await service.googleAuth(googleAuthDto);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('should use email prefix as default displayName if name not provided', async () => {
      const payloadWithoutName = {
        ...googlePayload,
        name: undefined,
      };

      mockOAuthClient.verifyIdToken.mockResolvedValue(mockTicket);
      mockTicket.getPayload.mockReturnValue(payloadWithoutName);

      vi.spyOn(prisma.user, 'findUnique')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          ...mockUser,
          displayName: 'googleuser',
          organization: mockOrganization,
          projectMemberships: [mockProjectMember],
        } as any);

      vi.spyOn(sessionService, 'createSession').mockResolvedValue(mockSession);

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
        return await callback(prisma);
      });

      vi.spyOn(prisma.organization, 'create').mockResolvedValue(mockOrganization);
      vi.spyOn(prisma.project, 'create').mockResolvedValue(mockProject);
      vi.spyOn(prisma.user, 'create').mockImplementation(async (args: any) => {
        expect(args.data.displayName).toBe('googleuser');
        return mockUser;
      });
      vi.spyOn(prisma.projectMember, 'create').mockResolvedValue(mockProjectMember);
      vi.spyOn(prisma.account, 'create').mockResolvedValue({} as any);

      await service.googleAuth(googleAuthDto);
    });

    it('should use workspace domain for organization name if hd present', async () => {
      mockOAuthClient.verifyIdToken.mockResolvedValue(mockTicket);
      mockTicket.getPayload.mockReturnValue(googlePayload);

      vi.spyOn(prisma.user, 'findUnique')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          ...mockUser,
          organization: mockOrganization,
          projectMemberships: [mockProjectMember],
        } as any);

      vi.spyOn(sessionService, 'createSession').mockResolvedValue(mockSession);

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
        return await callback(prisma);
      });

      vi.spyOn(prisma.organization, 'create').mockImplementation(async (args: any) => {
        expect(args.data.name).toBe('example.com Workspace');
        return mockOrganization;
      });
      vi.spyOn(prisma.project, 'create').mockResolvedValue(mockProject);
      vi.spyOn(prisma.user, 'create').mockResolvedValue(mockUser);
      vi.spyOn(prisma.projectMember, 'create').mockResolvedValue(mockProjectMember);
      vi.spyOn(prisma.account, 'create').mockResolvedValue({} as any);

      await service.googleAuth(googleAuthDto);
    });

    it('should use displayName for organization if no hd present', async () => {
      const payloadWithoutHd = {
        sub: 'google-123',
        email: 'personal@gmail.com',
        name: 'Personal User',
      };

      mockOAuthClient.verifyIdToken.mockResolvedValue(mockTicket);
      mockTicket.getPayload.mockReturnValue(payloadWithoutHd);

      vi.spyOn(prisma.user, 'findUnique')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          ...mockUser,
          organization: mockOrganization,
          projectMemberships: [mockProjectMember],
        } as any);

      vi.spyOn(sessionService, 'createSession').mockResolvedValue(mockSession);

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
        return await callback(prisma);
      });

      vi.spyOn(prisma.organization, 'create').mockImplementation(async (args: any) => {
        expect(args.data.name).toBe("Personal User's Organization");
        return mockOrganization;
      });
      vi.spyOn(prisma.project, 'create').mockResolvedValue(mockProject);
      vi.spyOn(prisma.user, 'create').mockResolvedValue(mockUser);
      vi.spyOn(prisma.projectMember, 'create').mockResolvedValue(mockProjectMember);
      vi.spyOn(prisma.account, 'create').mockResolvedValue({} as any);

      await service.googleAuth(googleAuthDto);
    });

    it('should normalize email to lowercase', async () => {
      const payloadWithUppercaseEmail = {
        ...googlePayload,
        email: 'GoogleUser@EXAMPLE.COM',
      };

      mockOAuthClient.verifyIdToken.mockResolvedValue(mockTicket);
      mockTicket.getPayload.mockReturnValue(payloadWithUppercaseEmail);

      vi.spyOn(prisma.user, 'findUnique')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          ...mockUser,
          email: 'googleuser@example.com',
          organization: mockOrganization,
          projectMemberships: [mockProjectMember],
        } as any);

      vi.spyOn(sessionService, 'createSession').mockResolvedValue(mockSession);

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
        return await callback(prisma);
      });

      vi.spyOn(prisma.organization, 'create').mockResolvedValue(mockOrganization);
      vi.spyOn(prisma.project, 'create').mockResolvedValue(mockProject);
      vi.spyOn(prisma.user, 'create').mockImplementation(async (args: any) => {
        expect(args.data.email).toBe('googleuser@example.com');
        return mockUser;
      });
      vi.spyOn(prisma.projectMember, 'create').mockResolvedValue(mockProjectMember);
      vi.spyOn(prisma.account, 'create').mockResolvedValue({} as any);

      await service.googleAuth(googleAuthDto);
    });

    it('should throw error if user cannot be loaded after creation', async () => {
      mockOAuthClient.verifyIdToken.mockResolvedValue(mockTicket);
      mockTicket.getPayload.mockReturnValue(googlePayload);

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(null).mockResolvedValueOnce(null); // Failed to load user

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
        return await callback(prisma);
      });

      vi.spyOn(prisma.organization, 'create').mockResolvedValue(mockOrganization);
      vi.spyOn(prisma.project, 'create').mockResolvedValue(mockProject);
      vi.spyOn(prisma.user, 'create').mockResolvedValue(mockUser);
      vi.spyOn(prisma.projectMember, 'create').mockResolvedValue(mockProjectMember);
      vi.spyOn(prisma.account, 'create').mockResolvedValue({} as any);

      await expect(service.googleAuth(googleAuthDto)).rejects.toThrow(
        new BadRequestException('Unable to load user after Google authentication.'),
      );
    });

    it('should use googleAccountId as fallback when sub is missing', async () => {
      const payloadWithoutSub = {
        email: 'user@example.com',
        name: 'Test User',
      };

      mockOAuthClient.verifyIdToken.mockResolvedValue(mockTicket);
      mockTicket.getPayload.mockReturnValue(payloadWithoutSub);

      vi.spyOn(prisma.user, 'findUnique')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          ...mockUser,
          organization: mockOrganization,
          projectMemberships: [mockProjectMember],
        } as any);

      vi.spyOn(sessionService, 'createSession').mockResolvedValue(mockSession);

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
        return await callback(prisma);
      });

      vi.spyOn(prisma.organization, 'create').mockResolvedValue(mockOrganization);
      vi.spyOn(prisma.project, 'create').mockResolvedValue(mockProject);
      vi.spyOn(prisma.user, 'create').mockResolvedValue(mockUser);
      vi.spyOn(prisma.projectMember, 'create').mockResolvedValue(mockProjectMember);
      vi.spyOn(prisma.account, 'create').mockImplementation(async (args: any) => {
        expect(args.data.providerAccountId).toBe('user@example.com');
        return {} as any;
      });

      await service.googleAuth(googleAuthDto);
    });
  });

  describe('toSessionResponse', () => {
    it('should correctly format session response', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'SecurePass123!',
      };

      const userWithRelations = {
        ...mockUser,
        organization: mockOrganization,
        projectMemberships: [mockProjectMember],
      };

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(userWithRelations as any);
      vi.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      vi.spyOn(sessionService, 'createSession').mockResolvedValue(mockSession);

      const result = await service.login(loginDto);

      expect(result).toHaveProperty('sessionToken');
      expect(result).toHaveProperty('sessionExpiresAt');
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('organization');
      expect(result).toHaveProperty('projects');

      expect(result.user).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        displayName: mockUser.displayName,
        organizationRole: mockUser.role,
      });

      expect(result.organization).toEqual({
        id: mockOrganization.id,
        name: mockOrganization.name,
        plan: mockOrganization.plan,
      });

      expect(result.projects).toHaveLength(1);
      expect(result.projects[0]).toEqual({
        id: mockProject.id,
        name: mockProject.name,
        timezone: mockProject.timezone,
        role: ProjectRole.OWNER,
      });
    });
  });
});
