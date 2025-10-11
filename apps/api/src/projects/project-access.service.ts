import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import { AuthenticatedUser } from '../auth/authenticated-request.js';

@Injectable()
export class ProjectAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureProjectAccess(projectId: string, user: AuthenticatedUser) {
    const hasMembership = user.projectMemberships.some(
      (membership) => membership.projectId === projectId
    );

    if (hasMembership) {
      return;
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { organizationId: true }
    });

    if (!project || project.organizationId !== user.organizationId) {
      throw new ForbiddenException('You do not have access to this project.');
    }
  }
}
