import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import { SessionGuard } from '../auth/session.guard.js';
import { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { IsString } from 'class-validator';
import { ProjectStats } from '@email-automation/shared';

class UpdateKnowledgeBaseDto {
  @IsString()
  knowledgeBase!: string;
}

@Controller('v1/projects/:projectId')
export class ProjectSettingsController {
  constructor(private readonly prisma: PrismaService) {}

  private buildBrandingJson(existing: unknown, knowledgeBase: string) {
    const normalized =
      existing && typeof existing === 'object' && !Array.isArray(existing)
        ? (existing as Record<string, unknown>)
        : {};
    return {
      ...normalized,
      knowledgeBase
    };
  }

  @Get('knowledge-base')
  @UseGuards(SessionGuard)
  async getKnowledgeBase(
    @Param('projectId') projectId: string,
    @Req() request: AuthenticatedRequest
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        organizationId: true,
        brandingJson: true
      }
    });

    if (!project || project.organizationId !== request.auth!.user.organizationId) {
      return { knowledgeBase: '' };
    }

    let knowledgeBase = '';
    if (project.brandingJson && typeof project.brandingJson === 'object') {
      const data = project.brandingJson as Record<string, unknown>;
      knowledgeBase = typeof data.knowledgeBase === 'string' ? data.knowledgeBase : '';
    }

    return { knowledgeBase };
  }

  @Put('knowledge-base')
  @UseGuards(SessionGuard)
  async updateKnowledgeBase(
    @Param('projectId') projectId: string,
    @Body() body: UpdateKnowledgeBaseDto,
    @Req() request: AuthenticatedRequest
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        organizationId: true,
        brandingJson: true
      }
    });

    if (!project || project.organizationId !== request.auth!.user.organizationId) {
      return { success: false };
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        brandingJson: this.buildBrandingJson(project.brandingJson, body.knowledgeBase)
      }
    });

    return { success: true };
  }

  @Get('stats')
  @UseGuards(SessionGuard)
  async getProjectStats(
    @Param('projectId') projectId: string,
    @Req() request: AuthenticatedRequest
  ): Promise<ProjectStats> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        organizationId: true
      }
    });

    if (!project || project.organizationId !== request.auth!.user.organizationId) {
      return {
        leadCount: 0,
        sentCount: 0,
        draftsReady: 0,
        templateCount: 0,
        gmailConnectionCount: 0
      };
    }

    const [leadCount, sentCount, templateCount, gmailConnectionCount] = await this.prisma.$transaction(
      [
        this.prisma.lead.count({ where: { projectId } }),
        this.prisma.auditLog.count({
          where: {
            scope: 'template_send',
            metaJson: {
              path: ['projectId'],
              equals: projectId
            }
          }
        }),
        this.prisma.template.count({ where: { projectId } }),
        this.prisma.gmailConnection.count({ where: { projectId } })
      ]
    );

    return {
      leadCount,
      sentCount,
      draftsReady: Math.max(leadCount - sentCount, 0),
      templateCount,
      gmailConnectionCount
    };
  }
}
