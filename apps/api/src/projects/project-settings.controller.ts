import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards
} from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import { SessionGuard } from '../auth/session.guard.js';
import { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { IsIn, IsOptional, IsString, IsUrl, validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ProjectStats, KnowledgeSource as SharedKnowledgeSource } from '@email-automation/shared';
import { AiConfigService } from '../ai/ai-config.service.js';
import { AiClientService } from '../ai/ai-client.service.js';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@email-automation/database';

class UpdateKnowledgeBaseDto {
  @IsString()
  knowledgeBase!: string;
}

class CollectKnowledgeSourceDto {
  @IsIn(['website', 'googleDoc', 'upload'])
  type!: 'website' | 'googleDoc' | 'upload';

  @IsOptional()
  @IsUrl({ protocols: ['https'] })
  url?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;
}

class DeleteKnowledgeBaseDto {
  @IsString()
  confirmation!: string;
}

type KnowledgeSource = SharedKnowledgeSource;

@Controller('v1/projects/:projectId')
export class ProjectSettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiConfig: AiConfigService,
    private readonly aiClient: AiClientService
  ) {}

  private readBranding(branding: unknown): { knowledgeBase: string; sources: KnowledgeSource[] } {
    if (!branding || typeof branding !== 'object' || Array.isArray(branding)) {
      return { knowledgeBase: '', sources: [] };
    }
    const record = branding as Record<string, unknown>;
    const knowledgeBase = typeof record.knowledgeBase === 'string' ? record.knowledgeBase : '';
    const sourcesRaw = Array.isArray(record.knowledgeSources) ? record.knowledgeSources : [];
    const sources: KnowledgeSource[] = [];
    for (const item of sourcesRaw) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const obj = item as Record<string, unknown>;
      const id = typeof obj.id === 'string' ? obj.id : randomUUID();
      const type: KnowledgeSource['type'] =
        obj.type === 'website' || obj.type === 'googleDoc' || obj.type === 'upload'
          ? obj.type
          : 'upload';
      const summary = typeof obj.summary === 'string' ? obj.summary : '';
      const snippet = typeof obj.snippet === 'string' ? obj.snippet : '';
      const createdAt = typeof obj.createdAt === 'string' ? obj.createdAt : new Date().toISOString();
      const url = typeof obj.url === 'string' ? obj.url : undefined;
      const title = typeof obj.title === 'string' ? obj.title : undefined;
      sources.push({
        id,
        type,
        url: url ?? undefined,
        title: title ?? undefined,
        summary,
        snippet,
        createdAt
      });
    }
    return { knowledgeBase, sources };
  }

  private buildBrandingJson(
    existing: unknown,
    knowledgeBase: string,
    sources: KnowledgeSource[]
  ) {
    const normalized =
      existing && typeof existing === 'object' && !Array.isArray(existing)
        ? (existing as Record<string, unknown>)
        : {};
    const serializedSources: Prisma.InputJsonValue = sources.map((source) => ({
      id: source.id,
      type: source.type,
      url: source.url ?? null,
      title: source.title ?? null,
      summary: source.summary,
      snippet: source.snippet,
      createdAt: source.createdAt
    }));
    return {
      ...normalized,
      knowledgeBase,
      knowledgeSources: serializedSources
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
      return { knowledgeBase: '', sources: [] as KnowledgeSource[] };
    }

    const branding = this.readBranding(project.brandingJson);
    return branding;
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

    const existing = this.readBranding(project.brandingJson);
    const updatedBranding = this.buildBrandingJson(project.brandingJson, body.knowledgeBase, existing.sources);

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        brandingJson: updatedBranding
      }
    });

    return {
      success: true,
      knowledgeBase: body.knowledgeBase,
      sources: existing.sources
    };
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
        organizationId: true,
        brandingJson: true
      }
    });

    if (!project || project.organizationId !== request.auth!.user.organizationId) {
      throw new BadRequestException('Project not found or access denied.');
    }

    const branding = this.readBranding(project.brandingJson);

    const { fragment, title, sourceUrl } = await this.resolveSourceContent(dto);

    const normalized = this.normalizeFragment(fragment);
    if (!normalized) {
      throw new BadRequestException('Unable to extract meaningful content from the provided source.');
    }

    const snippet = this.createSnippet(fragment);

    let summary = '';
    let updatedKnowledgeBase = branding.knowledgeBase;

    try {
      const generationConfig = await this.aiConfig.resolveGenerationConfig(project.organizationId);
      const systemPrompt =
        'You are a marketing enablement assistant. Summarize the key insights from the new content and blend them into the existing brand brief. Keep it concise, bullet-oriented, and focused on differentiation, proof, tone, and offers.';
      const userPrompt = `Existing brand knowledge:\n${branding.knowledgeBase || 'None yet'}\n\nNew source (${title}):\n${normalized.slice(
        0,
        6000
      )}\n\nOutput Requirements:\n- Return a refreshed brand knowledge section no longer than 600 words.\n- Use short paragraphs or bullet points.\n- Incorporate only signal, discard filler and navigational copy.\n- If existing knowledge is empty, author a fresh summary.`;
      const response = await this.aiClient.generate({
        provider: generationConfig.provider,
        model: generationConfig.model,
        apiKey: generationConfig.apiKey,
        systemPrompt,
        userPrompt
      });
      summary = response.trim();
      updatedKnowledgeBase = summary;
    } catch {
      summary = this.createSnippet(normalized, 800);
      const combined = branding.knowledgeBase
        ? `${branding.knowledgeBase}\n\n${summary}`
        : summary;
      updatedKnowledgeBase = combined.length > 6000 ? combined.slice(0, 6000) : combined;
    }

    const source: KnowledgeSource = {
      id: randomUUID(),
      type: dto.type,
      url: sourceUrl ?? undefined,
      title: title ?? undefined,
      snippet,
      summary,
      createdAt: new Date().toISOString()
    };

    const nextSources = [...branding.sources, source];
    const updatedBranding = this.buildBrandingJson(project.brandingJson, updatedKnowledgeBase, nextSources);

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        brandingJson: updatedBranding
      }
    });

    return {
      knowledgeBase: updatedKnowledgeBase,
      source
    };
  }

  @Delete('knowledge-base')
  @UseGuards(SessionGuard)
  async deleteKnowledgeBase(
    @Param('projectId') projectId: string,
    @Body() body: DeleteKnowledgeBaseDto,
    @Req() request: AuthenticatedRequest
  ) {
    const dto = plainToInstance(DeleteKnowledgeBaseDto, body);
    const validation = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
    if (validation.length > 0) {
      throw new BadRequestException('Invalid confirmation payload.');
    }

    const requiredPhrase = 'I am sure I want to delete my knowledge base';
    if (dto.confirmation.trim() !== requiredPhrase) {
      throw new BadRequestException('Confirmation phrase does not match.');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        organizationId: true,
        brandingJson: true
      }
    });

    if (!project || project.organizationId !== request.auth!.user.organizationId) {
      throw new BadRequestException('Project not found or access denied.');
    }

    const updatedBranding = this.buildBrandingJson(project.brandingJson, '', []);

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        brandingJson: updatedBranding
      }
    });

    return {
      success: true,
      knowledgeBase: '',
      sources: [] as KnowledgeSource[]
    };
  }

  private async resolveSourceContent(dto: CollectKnowledgeSourceDto): Promise<{
    fragment: string;
    title: string;
    sourceUrl?: string | null;
  }> {
    if (dto.type === 'upload') {
      if (!dto.content || dto.content.trim().length === 0) {
        throw new BadRequestException('Uploaded document is empty.');
      }
      const title = dto.title?.trim() || 'Uploaded document';
      const content = dto.content.length > 20000 ? dto.content.slice(0, 20000) : dto.content;
      return {
        fragment: content,
        title,
        sourceUrl: null
      };
    }

    if (!dto.url) {
      throw new BadRequestException('A URL is required for website and Google Doc sources.');
    }

    if (dto.type === 'website') {
      const html = await this.fetchWebsiteContent(dto.url);
      const fragment = html.length > 20000 ? html.slice(0, 20000) : html;
      return {
        fragment,
        title: dto.title?.trim() || dto.url,
        sourceUrl: dto.url
      };
    }

    const doc = await this.fetchGoogleDocContent(dto.url);
    const trimmed = doc.length > 20000 ? doc.slice(0, 20000) : doc;
    return {
      fragment: trimmed,
      title: dto.title?.trim() || dto.url,
      sourceUrl: dto.url
    };
  }

  private createSnippet(fragment: string, maxLength = 400): string {
    const snippet = fragment.replace(/\s+/g, ' ').trim();
    if (snippet.length <= maxLength) {
      return snippet;
    }
    return `${snippet.slice(0, maxLength)}…`;
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
