import { Injectable } from '@nestjs/common';
import { Session } from '@email-automation/database';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma.service.js';

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(userId: string): Promise<Session> {
    const token = randomUUID();
    const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 days

    return this.prisma.session.create({
      data: {
        sessionToken: token,
        userId,
        expires
      }
    });
  }

  async invalidateSession(sessionToken: string): Promise<void> {
    await this.prisma.session.delete({
      where: {
        sessionToken
      }
    });
  }

  async getSessionWithUser(sessionToken: string) {
    const session = await this.prisma.session.findUnique({
      where: { sessionToken },
      include: {
        user: {
          include: {
            organization: true,
            projectMemberships: {
              include: {
                project: true
              }
            }
          }
        }
      }
    });

    if (!session) {
      return null;
    }

    if (session.expires < new Date()) {
      await this.invalidateSession(sessionToken);
      return null;
    }

    return session;
  }
}
