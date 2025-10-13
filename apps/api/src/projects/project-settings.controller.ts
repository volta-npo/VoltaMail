import { BadRequestException, Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import { SessionGuard } from '../auth/session.guard.js';
import { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { IsIn, IsString, IsUrl, validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ProjectStats } from '@email-automation/shared';

class UpdateKnowledgeBaseDto {
  @IsString()
  knowledgeBase!: string;
}

class CollectKnowledgeSourceDto {
  @IsIn(['website', 'googleDoc'])
  type!: 'website' | 'googleDoc';

  @IsString()
  @IsUrl({ protocols: ['https'] })
  url!: string;
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

  @Post('knowledge-base/source')
  @UseGuards(SessionGuard)
  async collectKnowledgeBaseSource(
    @Param('projectId') projectId: string,
    @Body() body: CollectKnowledgeSourceDto,
    @Req() request: AuthenticatedRequest
  ) {
    const dto = plainToInstance(CollectKnowledgeSourceDto, body);
    const validation = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
    if (validation.length > 0) {
      throw new BadRequestException('Invalid knowledge base source payload.');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        organizationId: true
      }
    });

    if (!project || project.organizationId !== request.auth!.user.organizationId) {
      throw new BadRequestException('Project not found or access denied.');
    }

    let fragment: string;
    if (dto.type === 'website') {
      fragment = await this.fetchWebsiteContent(dto.url);
    } else {
      fragment = await this.fetchGoogleDocContent(dto.url);
    }

    const normalized = this.normalizeFragment(fragment);
    if (!normalized) {
      throw new BadRequestException('Unable to extract meaningful content from the provided source.');
    }

    return {
      fragment: normalized
    };
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

  private async fetchWebsiteContent(url: string): Promise<string> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'VoltaMailBot/1.0 (+https://volta-mail.vercel.app)'
        }
      });
      if (!response.ok) {
        throw new BadRequestException('Unable to fetch website content. Ensure the URL is reachable.');
      }
      const html = await response.text();
      return this.extractReadableText(html);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to scrape website content.');
    }
  }

  private async fetchGoogleDocContent(rawUrl: string): Promise<string> {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new BadRequestException('Invalid Google Doc URL.');
    }

    if (!parsed.hostname.endsWith('docs.google.com')) {
      throw new BadRequestException('Google Doc URL must come from docs.google.com.');
    }

    const segments = parsed.pathname.split('/').filter(Boolean);
    const dIndex = segments.indexOf('d');
    if (dIndex === -1 || dIndex + 1 >= segments.length) {
      throw new BadRequestException('Unable to determine Google Doc ID from the provided URL.');
    }
    const docId = segments[dIndex + 1];
    const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;

    try {
      const response = await fetch(exportUrl);
      if (!response.ok) {
        throw new BadRequestException('Unable to export Google Doc. Check sharing permissions.');
      }
      return await response.text();
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to download Google Doc content.');
    }
  }

  private extractReadableText(html: string): string {
    const withoutScripts = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ');
    const withBreaks = withoutScripts.replace(/<\/(p|div|br|li|h[1-6])>/gi, '$&\n');
    const stripped = withBreaks.replace(/<[^>]+>/g, ' ');
    const unescaped = stripped
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'");

    return unescaped
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n');
  }

  private normalizeFragment(fragment: string): string {
    const cleaned = fragment.replace(/\s+/g, ' ').trim();
    if (cleaned.length === 0) {
      return '';
    }
    const limit = 12000;
    return cleaned.length > limit ? `${cleaned.slice(0, limit)}…` : cleaned;
  }

}
