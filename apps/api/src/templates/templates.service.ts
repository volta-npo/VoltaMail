import { BadRequestException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import { ProjectAccessService } from '../projects/project-access.service.js';
import { AuthenticatedUser } from '../auth/authenticated-request.js';
import { CreateTemplateDto } from './dto/create-template.dto.js';
import { UpdateTemplateDto } from './dto/update-template.dto.js';
import { RenderTemplateDto } from './dto/render-template.dto.js';
import { GenerateTemplateDto } from './dto/generate-template.dto.js';
import { SendDraftDto } from './dto/send-draft.dto.js';
import { SuggestTemplateDto } from './dto/suggest-template.dto.js';
import { SendBulkDraftsDto } from './dto/send-bulk.dto.js';
import { SuggestHtmlTemplateDto } from './dto/suggest-html-template.dto.js';
import { CreateTemplateVersionDto } from './dto/create-template-version.dto.js';
import { UpdateTemplateVersionDto } from './dto/update-template-version.dto.js';
import { IterateDraftsDto } from './dto/iterate-drafts.dto.js';
import {
  AiDraftResult,
  RenderedLeadPreview,
  TemplateSummary,
  SendDraftResponse,
  AiTemplateSuggestion,
  BulkSendResponse,
  BulkSendResult,
  TemplateVersionSummary,
  TemplateVersionType,
  TemplateVersionSource,
  KnowledgeSource,
  AiChatMessage,
  AiChatResponse
} from '@email-automation/shared';
import { renderTemplate } from './template-renderer.js';
import { AiClientService } from '../ai/ai-client.service.js';
import { GmailService } from '../gmail/gmail.service.js';
import { AiConfigService } from '../ai/ai-config.service.js';
import { randomUUID } from 'node:crypto';

@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService,
    private readonly aiClient: AiClientService,
    private readonly gmailService: GmailService,
    private readonly aiConfig: AiConfigService
  ) {}

  private calculateTimeout(leadsCount: number, provider?: string): number {
    const baseTimeout = 15000; // 15 seconds
    const isFreeModel = provider === 'openrouter' || !provider;
    const timeoutPerLead = isFreeModel ? 8000 : 5000; // 8s for free, 5s for paid
    const maxTimeout = 120000; // 2 minutes max

    const calculated = baseTimeout + (leadsCount * timeoutPerLead);
    return Math.min(calculated, maxTimeout);
  }

  private async runWithTimeout<T>(promise: Promise<T>, message: string, timeoutMs: number): Promise<T> {
    let timeoutId: NodeJS.Timeout | undefined;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new BadRequestException(message));
        }, timeoutMs);
      });

      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  private getWorkerCount(provider?: string, leadsCount?: number): number {
    const configuredConcurrency = Number.parseInt(process.env.AI_DRAFT_CONCURRENCY ?? '', 10);
    let defaultConcurrency = 4;

    // Adjust based on provider
    if (provider === 'openrouter') {
      defaultConcurrency = 2; // Rate limiting for free models
    } else if (provider === 'gemini') {
      defaultConcurrency = 3;
    } else {
      defaultConcurrency = 6; // Paid models can handle more
    }

    const maxConcurrency = Number.isFinite(configuredConcurrency) && configuredConcurrency > 0
      ? configuredConcurrency
      : defaultConcurrency;

    return leadsCount ? Math.min(Math.max(1, maxConcurrency), leadsCount) : maxConcurrency;
  }

  async listTemplates(projectId: string, user: AuthenticatedUser): Promise<TemplateSummary[]> {
    await this.projectAccess.ensureProjectAccess(projectId, user);

    const templates = await this.prisma.template.findMany({
      where: { projectId },
      orderBy: { updatedAt: 'desc' },
      include: {
        activeVersion: true,
        versions: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    return templates.map(toTemplateSummary);
  }

  async createTemplate(
    projectId: string,
    dto: CreateTemplateDto,
    user: AuthenticatedUser
  ): Promise<TemplateSummary> {
    await this.projectAccess.ensureProjectAccess(projectId, user);

    const template = await this.prisma.template.create({
      data: {
        projectId,
        name: dto.name,
        subject: dto.subject,
        body: dto.body
      }
    });

    const version = await this.prisma.templateVersion.create({
      data: {
        templateId: template.id,
        type: 'TEXT',
        source: 'USER',
        title: dto.name,
        textContent: dto.body,
        htmlContent: null,
        isActive: true
      }
    });

    const updatedTemplate = await this.prisma.template.update({
      where: { id: template.id },
      data: {
        activeVersionId: version.id
      },
      include: {
        activeVersion: true,
        versions: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    return toTemplateSummary(updatedTemplate);
  }

  async updateTemplate(
    templateId: string,
    dto: UpdateTemplateDto,
    user: AuthenticatedUser
  ): Promise<TemplateSummary> {
    const template = await this.prisma.template.findUnique({ where: { id: templateId } });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    await this.projectAccess.ensureProjectAccess(template.projectId, user);

    const updated = await this.prisma.template.update({
      where: { id: templateId },
      data: {
        name: dto.name ?? template.name,
        subject: dto.subject ?? template.subject,
        body: dto.body ?? template.body
      },
      include: {
        activeVersion: true,
        versions: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if ((dto.subject || dto.body) && updated.activeVersionId) {
      await this.prisma.templateVersion.update({
        where: { id: updated.activeVersionId },
        data: {
          textContent: dto.body ?? updated.body,
          title: dto.name ?? updated.name
        }
      });
    }

    return toTemplateSummary(updated);
  }

  async deleteTemplate(templateId: string, user: AuthenticatedUser): Promise<void> {
    const template = await this.prisma.template.findUnique({ where: { id: templateId } });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    await this.projectAccess.ensureProjectAccess(template.projectId, user);

    await this.prisma.$transaction([
      this.prisma.templateVersion.deleteMany({ where: { templateId } }),
      this.prisma.template.delete({ where: { id: templateId } })
    ]);

    this.logger.log(`Template ${templateId} deleted by user ${user.id}`);
  }

  async renderTemplate(
    templateId: string,
    dto: RenderTemplateDto,
    user: AuthenticatedUser
  ): Promise<RenderedLeadPreview[]> {
    const template = await this.prisma.template.findUnique({ where: { id: templateId } });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    await this.projectAccess.ensureProjectAccess(template.projectId, user);

    const sampleSize = dto.sampleSize ?? 5;
    const leads = await this.prisma.lead.findMany({
      where: { projectId: template.projectId },
      orderBy: { createdAt: 'desc' },
      take: sampleSize
    });

    if (leads.length === 0) {
      throw new BadRequestException('No leads available for this project.');
    }

    return leads.map((lead) => ({
      leadId: lead.id,
      email: lead.email,
      subject: renderTemplate(template.subject, lead),
      body: renderTemplate(template.body, lead)
    }));
  }

  async generateAiDrafts(
    templateId: string,
    dto: GenerateTemplateDto,
    user: AuthenticatedUser
  ): Promise<AiDraftResult[]> {
    const template = await this.prisma.template.findUnique({
      where: { id: templateId },
      include: {
        project: true,
        activeVersion: true
      }
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    await this.projectAccess.ensureProjectAccess(template.projectId, user);

    let leads = [];
    if (dto.leadIds && dto.leadIds.length > 0) {
      leads = await this.prisma.lead.findMany({
        where: {
          projectId: template.projectId,
          id: { in: dto.leadIds }
        }
      });
    } else {
      const sampleSize = dto.sampleSize ?? 3;
      leads = await this.prisma.lead.findMany({
        where: { projectId: template.projectId },
        orderBy: { createdAt: 'desc' },
        take: sampleSize
      });
    }

    if (leads.length === 0) {
      throw new BadRequestException('No leads available to generate drafts.');
    }

    const knowledgeBase = buildKnowledgeBase(template.project.brandingJson);
    const knowledgeSources = extractKnowledgeSources(template.project.brandingJson);
    const activeVersion = template.activeVersion;
    const baseTextTemplate = activeVersion?.textContent ?? template.body;
    const baseHtmlTemplate = activeVersion?.htmlContent ?? null;

    const generationConfig = await this.aiConfig.resolveGenerationConfig(
      user.organizationId,
      dto.provider,
      dto.model
    );

    const systemPrompt =
      'You are a helpful outreach email specialist and HTML email designer. Use the provided knowledge base to create a personalized email. Respond with valid JSON containing "subject", "body" (plain text) and "html" (well-formed HTML that uses inline styles).';

    const generateForLead = async (lead: (typeof leads)[number]): Promise<AiDraftResult> => {
      const userPrompt = buildUserPrompt({
        knowledgeBase,
        knowledgeSources,
        templateSubject: template.subject,
        textTemplate: baseTextTemplate,
        htmlTemplate: baseHtmlTemplate ?? undefined,
        lead,
        personalization: {
          enhanced: Boolean(dto.enhancedPersonalization),
          allowToolUse: Boolean(dto.allowToolUse)
        }
      });

      const timeoutMs = this.calculateTimeout(1, generationConfig.provider);
      const timeoutSeconds = Math.round(timeoutMs / 1000);

      const raw = await this.runWithTimeout(
        this.aiClient.generate({
          provider: generationConfig.provider,
          systemPrompt,
          userPrompt,
          model: generationConfig.model,
          apiKey: generationConfig.apiKey
        }),
        `AI generation timed out after ${timeoutSeconds}s. Try: (1) Reduce lead count (currently: ${leads.length}), (2) Simplify knowledge base, or (3) Switch to a faster model.`,
        timeoutMs
      );

      const { subject, body, html } = parseAiResponse(raw);

      const notes = dto.enhancedPersonalization
        ? dto.allowToolUse
          ? 'Enhanced personalization with research assistance applied.'
          : 'Enhanced personalization applied.'
        : undefined;

      return {
        leadId: lead.id,
        email: lead.email,
        subject,
        body,
        html,
        templateVersionId: activeVersion?.id ?? undefined,
        provider: generationConfig.provider,
        notes
      };
    };

    const workerCount = this.getWorkerCount(generationConfig.provider, leads.length);
    const results: AiDraftResult[] = new Array(leads.length);
    let nextIndex = 0;

    const runWorker = async () => {
      while (true) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        if (currentIndex >= leads.length) {
          break;
        }
        const lead = leads[currentIndex];
        try {
          results[currentIndex] = await generateForLead(lead);
        } catch (error) {
          this.logger.warn(`Failed to generate draft for lead ${lead.id}: ${error instanceof Error ? error.message : String(error)}`);
          throw error;
        }
      }
    };

    await Promise.all(Array.from({ length: workerCount }, runWorker));

    return results;
  }

  async chatWithTemplate(
    templateId: string,
    dto: { message: string; history?: AiChatMessage[] },
    user: AuthenticatedUser
  ): Promise<AiChatResponse> {
    const template = await this.prisma.template.findUnique({
      where: { id: templateId },
      include: {
        project: true,
        activeVersion: true
      }
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    await this.projectAccess.ensureProjectAccess(template.projectId, user);

    const knowledgeBase = buildKnowledgeBase(template.project.brandingJson);
    const knowledgeSources = extractKnowledgeSources(template.project.brandingJson);
    const activeVersion = template.activeVersion;

    const conversationHistory = (dto.history ?? [])
      .map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.content}`)
      .join('\n');

    const sourceHighlights = knowledgeSources.slice(0, 3).map((source, index) => {
      const title = source.title ?? source.url ?? `Source ${index + 1}`;
      return `- ${title}: ${source.summary || source.snippet}`;
    });

    const systemPrompt = [
      'You are Volta, an outreach copywriting assistant helping refine cold email templates.',
      'You have access to the organization\'s knowledge base and recent AI drafts.',
      'Provide concise, actionable suggestions, and show revised snippets when appropriate.',
      'Always respond with valid JSON: {"message": string, "updates": {"subject"?: string, "body"?: string, "html"?: string|null}}.',
      'Include the original message text in "message". Only include keys in "updates" when you have concrete replacements.'
    ].join(' ');

    const templateSummary = `Current template name: ${template.name}\nSubject: ${template.subject}\nBody:\n${template.body}`;
    const htmlSection = activeVersion?.htmlContent
      ? `\nCurrent HTML version:\n${activeVersion.htmlContent}`
      : '';

    const researchSection = sourceHighlights.length
      ? `\nResearch highlights:\n${sourceHighlights.join('\n')}`
      : '';

    const chatPrompt = `${conversationHistory ? `${conversationHistory}\n` : ''}User: ${dto.message}`;

    const userPrompt = `Knowledge Base:\n${knowledgeBase}${researchSection}\n\nTemplate Context:\n${templateSummary}${htmlSection}\n\nConversation:\n${chatPrompt}\n\nInstructions:\n- Respond as a helpful AI teammate.\n- Offer concrete edits or suggestions.\n- If you rewrite copy, supply the revised subject/body/html in the JSON "updates" object.\n- Keep responses under 180 words unless user requests otherwise.\n- Return only JSON.`;

    const generationConfig = await this.aiConfig.resolveGenerationConfig(user.organizationId);

    const timeoutMs = this.calculateTimeout(1, generationConfig.provider);
    const timeoutSeconds = Math.round(timeoutMs / 1000);

    const raw = await this.runWithTimeout(
      this.aiClient.generate({
        provider: generationConfig.provider,
        systemPrompt,
        userPrompt,
        model: generationConfig.model,
        apiKey: generationConfig.apiKey
      }),
      `AI generation timed out after ${timeoutSeconds}s. Try: (1) Reduce lead count, (2) Simplify knowledge base, or (3) Switch to a faster model.`,
      timeoutMs
    );

    return parseChatResponse(raw);
  }

  async sendDraft(
    templateId: string,
    dto: SendDraftDto,
    user: AuthenticatedUser
  ): Promise<SendDraftResponse> {
    const template = await this.prisma.template.findUnique({
      where: { id: templateId }
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    await this.projectAccess.ensureProjectAccess(template.projectId, user);

    const lead = await this.prisma.lead.findUnique({
      where: { id: dto.leadId }
    });

    if (!lead || lead.projectId !== template.projectId) {
      throw new BadRequestException('Lead not found for this template');
    }

    const sendResult = await this.gmailService.sendEmail({
      projectId: template.projectId,
      gmailConnectionId: dto.gmailConnectionId,
      to: lead.email,
      subject: dto.subject,
      body: dto.body,
      html: dto.html ?? undefined
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.id,
        scope: 'template_send',
        action: 'send',
        targetType: 'lead',
        targetId: lead.id,
        metaJson: {
          templateId,
          projectId: template.projectId,
          messageId: sendResult.messageId,
          email: lead.email,
          gmailConnectionId: sendResult.gmailConnectionId,
          templateVersionId: dto.templateVersionId ?? null
        }
      }
    });

    return sendResult;
  }

  async suggestTemplate(
    projectId: string,
    dto: SuggestTemplateDto,
    user: AuthenticatedUser
  ): Promise<AiTemplateSuggestion> {
    await this.projectAccess.ensureProjectAccess(projectId, user);

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        brandingJson: true
      }
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const sampleSize = Math.min(dto.leadSampleSize ?? 10, 25);

    const leads = await this.prisma.lead.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: sampleSize
    });

    if (leads.length === 0) {
      throw new BadRequestException('Import leads before asking AI to draft a template.');
    }

    const knowledgeBase = dto.knowledgeBase && dto.knowledgeBase.trim().length > 0
      ? dto.knowledgeBase
      : buildKnowledgeBase(project.brandingJson);

    const leadSummary = leads.map((lead) => ({
      email: lead.email,
      first_name: lead.firstName,
      last_name: lead.lastName,
      company: lead.company,
      role: lead.role,
      timezone: lead.timezone,
      notes:
        lead.customJson && typeof lead.customJson === 'object' && !Array.isArray(lead.customJson)
          ? lead.customJson
          : undefined
    }));

    const systemPrompt =
      'You are a seasoned outbound copywriter. Craft high-converting cold outreach email templates that stay human and consultative.';

    const userPrompt = `Knowledge Base:\n${knowledgeBase}\n\nLead Sample (JSON):\n${JSON.stringify(
      leadSummary,
      null,
      2
    )}\n\nInstructions:\n- Draft a single reusable outreach template with a compelling subject line and body.\n- Use handlebars-style placeholders like {{first_name}}, {{company}}, {{role}}, {{pain_point}} when referencing lead attributes.\n- Keep body under 180 words, conversational but professional, and end with one clear CTA.\n- Return valid JSON with keys "subject" and "body".`;

    const generationConfig = await this.aiConfig.resolveGenerationConfig(
      user.organizationId,
      dto.provider,
      dto.model
    );

    const timeoutMs = this.calculateTimeout(leads.length, generationConfig.provider);
    const timeoutSeconds = Math.round(timeoutMs / 1000);

    let raw: string;
    try {
      raw = await this.aiClient.generate({
        provider: generationConfig.provider,
        systemPrompt,
        userPrompt,
        model: generationConfig.model,
        apiKey: generationConfig.apiKey,
        timeoutMs
      });
    } catch (error) {
      // Re-throw with more context if it's already a BadRequestException with timeout info
      if (error instanceof BadRequestException) {
        throw error;
      }
      // Catch any other errors and wrap with context
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(
        `AI generation failed: ${message} Try reducing the number of leads (currently: ${leads.length}).`
      );
    }

    const suggestion = parseAiResponse(raw);

    return {
      subject: suggestion.subject,
      body: suggestion.body
    };
  }

  async sendBulkDrafts(
    templateId: string,
    dto: SendBulkDraftsDto,
    user: AuthenticatedUser
  ): Promise<BulkSendResponse> {
    if (!dto.drafts || dto.drafts.length === 0) {
      throw new BadRequestException('No drafts provided to send.');
    }

    const template = await this.prisma.template.findUnique({
      where: { id: templateId }
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    await this.projectAccess.ensureProjectAccess(template.projectId, user);

    const leadIds = dto.drafts.map((draft) => draft.leadId);
    const leads = await this.prisma.lead.findMany({
      where: {
        projectId: template.projectId,
        id: { in: leadIds }
      }
    });

    const leadMap = new Map(leads.map((lead) => [lead.id, lead]));
    const provider = dto.provider ?? 'openrouter';

    const results: BulkSendResult[] = [];

    for (const draft of dto.drafts) {
      const lead = leadMap.get(draft.leadId);
      if (!lead) {
        results.push({
          leadId: draft.leadId,
          status: 'failed',
          error: 'Lead not found for this template'
        });
        continue;
      }

      try {
        const sendResult = await this.gmailService.sendEmail({
          projectId: template.projectId,
          gmailConnectionId: dto.gmailConnectionId,
          to: lead.email,
          subject: draft.subject,
          body: draft.body,
          html: draft.html ?? undefined
        });

        await this.prisma.auditLog.create({
          data: {
            organizationId: user.organizationId,
            actorUserId: user.id,
            scope: 'template_send',
            action: 'send',
            targetType: 'lead',
            targetId: lead.id,
            metaJson: {
              templateId,
              projectId: template.projectId,
              messageId: sendResult.messageId,
              email: lead.email,
              gmailConnectionId: sendResult.gmailConnectionId,
              provider,
              templateVersionId: draft.templateVersionId ?? null
            }
          }
        });

        results.push({
          leadId: draft.leadId,
          status: 'sent',
          messageId: sendResult.messageId,
          sentAt: sendResult.sentAt,
          gmailConnectionEmail: sendResult.gmailConnectionEmail
        });
      } catch (error) {
        results.push({
          leadId: draft.leadId,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Failed to send email'
        });
      }
    }

    return { results };
  }

  async listTemplateVersions(templateId: string, user: AuthenticatedUser): Promise<TemplateVersionSummary[]> {
    const template = await this.prisma.template.findUnique({
      where: { id: templateId },
      include: {
        versions: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    await this.projectAccess.ensureProjectAccess(template.projectId, user);

    return template.versions.map(toTemplateVersionSummary);
  }

  async createTemplateVersion(
    templateId: string,
    dto: CreateTemplateVersionDto,
    user: AuthenticatedUser
  ): Promise<TemplateVersionSummary> {
    const template = await this.prisma.template.findUnique({ where: { id: templateId } });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    await this.projectAccess.ensureProjectAccess(template.projectId, user);

    const type = dto.type ?? (dto.htmlContent ? 'HTML' : 'TEXT');
    const source = dto.source ?? 'USER';

    const version = await this.prisma.templateVersion.create({
      data: {
        templateId,
        parentVersionId: dto.parentVersionId ?? null,
        type,
        source,
        title: dto.title,
        description: dto.description ?? null,
        htmlContent: dto.htmlContent ?? null,
        textContent: dto.textContent ?? null,
        isActive: dto.activate ?? false,
        createdByAiProvider: dto.createdByAiProvider ?? null
      }
    });

    if (dto.activate) {
      await this.prisma.$transaction([
        this.prisma.templateVersion.updateMany({
          where: {
            templateId,
            id: { not: version.id }
          },
          data: {
            isActive: false
          }
        }),
        this.prisma.template.update({
          where: { id: templateId },
          data: {
            activeVersionId: version.id
          }
        })
      ]);
    }

    return toTemplateVersionSummary({
      ...version,
      metadataJson: version.metadataJson,
      type,
      source
    });
  }

  async updateTemplateVersion(
    templateId: string,
    versionId: string,
    dto: UpdateTemplateVersionDto,
    user: AuthenticatedUser
  ): Promise<TemplateVersionSummary> {
    const version = await this.prisma.templateVersion.findUnique({
      where: { id: versionId }
    });

    if (!version || version.templateId !== templateId) {
      throw new NotFoundException('Template version not found');
    }

    const template = await this.prisma.template.findUnique({ where: { id: templateId } });
    if (!template) {
      throw new NotFoundException('Template not found');
    }

    await this.projectAccess.ensureProjectAccess(template.projectId, user);

    const updated = await this.prisma.templateVersion.update({
      where: { id: versionId },
      data: {
        type: dto.type ?? version.type,
        title: dto.title ?? version.title,
        description: dto.description ?? version.description,
        htmlContent: dto.htmlContent ?? version.htmlContent,
        textContent: dto.textContent ?? version.textContent
      }
    });

    if (template.activeVersionId === versionId && dto.textContent) {
      await this.prisma.template.update({
        where: { id: templateId },
        data: { body: dto.textContent }
      });
    }

    return toTemplateVersionSummary({
      ...updated,
      metadataJson: updated.metadataJson
    });
  }

  async activateTemplateVersion(
    templateId: string,
    versionId: string,
    user: AuthenticatedUser
  ): Promise<TemplateSummary> {
    const template = await this.prisma.template.findUnique({
      where: { id: templateId },
      include: {
        versions: true
      }
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    await this.projectAccess.ensureProjectAccess(template.projectId, user);

    const version = template.versions.find((item) => item.id === versionId);
    if (!version) {
      throw new NotFoundException('Template version not found');
    }

    await this.prisma.$transaction([
      this.prisma.templateVersion.updateMany({
        where: {
          templateId,
          id: { not: versionId }
        },
        data: {
          isActive: false
        }
      }),
      this.prisma.templateVersion.update({
        where: { id: versionId },
        data: {
          isActive: true
        }
      }),
      this.prisma.template.update({
        where: { id: templateId },
        data: {
          activeVersionId: versionId,
          subject: template.subject,
          body: version.textContent ?? template.body
        }
      })
    ]);

    const freshTemplate = await this.prisma.template.findUnique({
      where: { id: templateId },
      include: {
        activeVersion: true,
        versions: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!freshTemplate) {
      throw new NotFoundException('Template not found');
    }

    return toTemplateSummary(freshTemplate);
  }

  async suggestHtmlTemplates(
    projectId: string,
    dto: SuggestHtmlTemplateDto,
    user: AuthenticatedUser
  ): Promise<TemplateVersionSummary[]> {
    await this.projectAccess.ensureProjectAccess(projectId, user);
    throw new BadRequestException('Template studio is coming soon. HTML suggestions are temporarily disabled.');
  }

  async iterateDrafts(
    templateId: string,
    dto: IterateDraftsDto,
    user: AuthenticatedUser
  ): Promise<AiDraftResult[]> {
    const template = await this.prisma.template.findUnique({
      where: { id: templateId },
      include: {
        project: true,
        activeVersion: true
      }
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    await this.projectAccess.ensureProjectAccess(template.projectId, user);

    if (dto.targets.length === 0) {
      throw new BadRequestException('No drafts provided for iteration.');
    }

    const leadIds = dto.targets.map((target) => target.leadId);
    const leads = await this.prisma.lead.findMany({
      where: {
        projectId: template.projectId,
        id: { in: leadIds }
      }
    });

    const leadMap = new Map(leads.map((lead) => [lead.id, lead]));
    const knowledgeBase = buildKnowledgeBase(template.project.brandingJson);

    let templateVersionId = dto.templateVersionId ?? template.activeVersion?.id ?? null;
    let templateVersion = templateVersionId
      ? await this.prisma.templateVersion.findUnique({ where: { id: templateVersionId } })
      : null;

    if (!templateVersion && template.activeVersion) {
      templateVersion = template.activeVersion;
      templateVersionId = template.activeVersion.id;
    }

    if (dto.templateVersionId && !templateVersion) {
      throw new NotFoundException('Template version not found');
    }

    const baseTextTemplate = templateVersion?.textContent ?? template.body;
    const baseHtmlTemplate = templateVersion?.htmlContent ?? null;

    const generationConfig = await this.aiConfig.resolveGenerationConfig(
      user.organizationId,
      dto.provider,
      dto.model
    );

    const results: AiDraftResult[] = [];

    for (const target of dto.targets) {
      const lead = leadMap.get(target.leadId);
      if (!lead) {
        results.push({
          leadId: target.leadId,
          email: 'unknown',
          subject: 'Iteration failed',
          body: 'Lead not found for this project.',
          html: null,
          templateVersionId: templateVersionId ?? undefined,
          provider: generationConfig.provider
        });
        continue;
      }

      const systemPrompt =
        'You are refining an outreach email to improve clarity and engagement while keeping style aligned with the provided template.';
      const userPrompt = buildDraftIterationPrompt({
        knowledgeBase,
        templateSubject: template.subject,
        textTemplate: baseTextTemplate,
        htmlTemplate: baseHtmlTemplate ?? undefined,
        lead,
        previousText: target.lastDraftText,
        previousHtml: target.lastDraftHtml,
        instructions: dto.instructions
      });

      const timeoutMs = this.calculateTimeout(1, generationConfig.provider);
      const timeoutSeconds = Math.round(timeoutMs / 1000);

      const raw = await this.runWithTimeout(
        this.aiClient.generate({
          provider: generationConfig.provider,
          systemPrompt,
          userPrompt,
          model: generationConfig.model,
          apiKey: generationConfig.apiKey
        }),
        `AI generation timed out after ${timeoutSeconds}s. Try: (1) Reduce lead count (currently: ${dto.targets.length}), (2) Simplify knowledge base, or (3) Switch to a faster model.`,
        timeoutMs
      );

      const { subject, body, html } = parseAiResponse(raw);

      results.push({
        leadId: lead.id,
        email: lead.email,
        subject,
        body,
        html,
        templateVersionId: templateVersionId ?? undefined,
        provider: generationConfig.provider
      });
    }

    return results;
  }
}

function toTemplateSummary(template: {
  id: string;
  projectId: string;
  name: string;
  subject: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  activeVersion?: TemplateVersionWithRelations | null;
  versions?: TemplateVersionWithRelations[];
}): TemplateSummary {
  return {
    id: template.id,
    projectId: template.projectId,
    name: template.name,
    subject: template.subject,
    body: template.body,
     activeVersion: template.activeVersion ? toTemplateVersionSummary(template.activeVersion) : null,
     versions: template.versions ? template.versions.map(toTemplateVersionSummary) : undefined,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString()
  };
}

type TemplateVersionWithRelations = {
  id: string;
  templateId: string;
  parentVersionId: string | null;
  type: TemplateVersionType;
  source: TemplateVersionSource;
  title: string;
  description: string | null;
  htmlContent: string | null;
  textContent: string | null;
  metadataJson: unknown | null;
  isActive: boolean;
  createdByAiProvider: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toTemplateVersionSummary(version: TemplateVersionWithRelations): TemplateVersionSummary {
  return {
    id: version.id,
    templateId: version.templateId,
    parentVersionId: version.parentVersionId,
    type: version.type,
    source: version.source,
    title: version.title,
    description: version.description,
    htmlContent: version.htmlContent,
    textContent: version.textContent,
    metadata: version.metadataJson && typeof version.metadataJson === 'object' ? (version.metadataJson as Record<string, unknown>) : null,
    isActive: version.isActive,
    createdByAiProvider: version.createdByAiProvider,
    createdAt: version.createdAt.toISOString(),
    updatedAt: version.updatedAt.toISOString()
  };
}

function buildKnowledgeBase(brandingJson: unknown): string {
  if (!brandingJson) {
    return 'No brand guidelines provided. Keep tone professional, concise, and helpful.';
  }

  if (typeof brandingJson === 'string') {
    return brandingJson;
  }

  if (typeof brandingJson === 'object') {
    const data = brandingJson as Record<string, unknown>;
    const knowledgeBase = data.knowledgeBase;
    if (typeof knowledgeBase === 'string' && knowledgeBase.trim().length > 0) {
      return knowledgeBase;
    }
    return JSON.stringify(brandingJson, null, 2);
  }

  return 'No brand guidelines provided. Keep tone professional, concise, and helpful.';
}

function extractKnowledgeSources(brandingJson: unknown): KnowledgeSource[] {
  if (!brandingJson || typeof brandingJson !== 'object') {
    return [];
  }

  const record = brandingJson as Record<string, unknown>;
  const raw = Array.isArray(record.knowledgeSources) ? record.knowledgeSources : [];

  const sources: KnowledgeSource[] = [];
  for (const item of raw) {
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
    const createdAt =
      typeof obj.createdAt === 'string' ? obj.createdAt : new Date().toISOString();
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

  return sources;
}

function buildUserPrompt(args: {
  knowledgeBase: string;
  knowledgeSources: KnowledgeSource[];
  templateSubject: string;
  textTemplate: string;
  htmlTemplate?: string;
  lead: {
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    company?: string | null;
    role?: string | null;
    timezone?: string | null;
    phone?: string | null;
    address?: string | null;
    customJson?: unknown;
  };
  personalization?: {
    enhanced: boolean;
    allowToolUse: boolean;
  };
}): string {
  const {
    knowledgeBase,
    knowledgeSources,
    templateSubject,
    textTemplate,
    htmlTemplate,
    lead,
    personalization
  } = args;
  const leadData = {
    email: lead.email,
    first_name: lead.firstName,
    last_name: lead.lastName,
    company: lead.company,
    role: lead.role,
    timezone: lead.timezone,
    phone: lead.phone,
    address: lead.address,
    custom:
      lead.customJson && typeof lead.customJson === 'object' && !Array.isArray(lead.customJson)
        ? (lead.customJson as Record<string, unknown>)
        : {}
  };

  const htmlSection = htmlTemplate
    ? `\nHTML Template:\n${htmlTemplate}\n`
    : '';

  const sourceHighlights = knowledgeSources.slice(0, 3).map((source, index) => {
    const title = source.title ?? source.url ?? `Source ${index + 1}`;
    const summary = source.summary || source.snippet;
    return `- ${title}: ${summary}`.trim();
  });

  const personalizationInstructions: string[] = [];
  if (personalization?.enhanced) {
    personalizationInstructions.push(
      'Open with a tailored hook that references the lead\'s role and company priorities.'
    );
    personalizationInstructions.push(
      'Highlight one specific insight or compliment that shows genuine research.'
    );
    personalizationInstructions.push('Keep the message under 160 words even with personal touches.');
  }

  if (personalization?.allowToolUse) {
    if (sourceHighlights.length > 0) {
      personalizationInstructions.push('Blend in relevant ideas from the research highlights below.');
    }
    personalizationInstructions.push(
      'If you infer details beyond the provided data, flag them as observations rather than confirmed facts.'
    );
  } else {
    personalizationInstructions.push('Do not fabricate facts beyond the supplied context.');
  }

  const researchSection =
    sourceHighlights.length > 0
      ? `\nResearch Highlights (for personalization):\n${sourceHighlights.join('\n')}`
      : '';

  const extraInstructions = personalizationInstructions.length
    ? `\n- ${personalizationInstructions.join('\n- ')}`
    : '';

  return `Knowledge Base:\n${knowledgeBase}\n\nBase Template:\nSubject: ${templateSubject}\nText Body:\n${textTemplate}${htmlSection}\nLead Data (JSON):\n${JSON.stringify(
    leadData,
    null,
    2
  )}${researchSection}\n\nInstructions:\n- Maintain a friendly, human tone.\n- Keep body under 150 words.\n- Include a single clear call-to-action.\n- If an HTML template is provided, reuse its layout/styles while personalizing copy.\n- Return your answer as JSON with keys 'subject', 'body' (plain text) and 'html' (HTML email).${extraInstructions}`;
}

function parseAiResponse(raw: string): { subject: string; body: string; html: string | null } {
  let subject = '';
  let body = raw.trim();
  let html: string | null = null;

  try {
    const parsed = JSON.parse(raw) as { subject?: string; body?: string; html?: string };
    subject = parsed.subject ?? '';
    body = parsed.body ?? raw.trim();
    html = typeof parsed.html === 'string' ? parsed.html : null;
  } catch {
    const subjectMatch = raw.match(/"subject"\s*:\s*"([^"]+)"/i);
    if (subjectMatch) {
      subject = subjectMatch[1];
    }
    const bodyMatch = raw.match(/"body"\s*:\s*"([\s\S]*)"/i);
    if (bodyMatch) {
      body = bodyMatch[1].replace(/"\s*}\s*$/, '').trim();
    }
    const htmlMatch = raw.match(/"html"\s*:\s*"([\s\S]*)"/i);
    if (htmlMatch) {
      html = htmlMatch[1].replace(/"\s*}\s*$/, '').trim();
    }
  }

  if (subject.length === 0) {
    subject = 'Quick hello';
  }

  if (body.length === 0) {
    body = raw.trim();
  }

  const normalize = (value: string) =>
    value
      .replace(/\\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

  subject = normalize(subject).replace(/\s+/g, ' ');
  body = normalize(body);
  if (html) {
    html = normalize(html);
  }

  return { subject, body, html };
}

function parseChatResponse(raw: string): AiChatResponse {
  const trimmed = raw.trim();

  const tryParse = (value: string): AiChatResponse | null => {
    try {
      const parsed = JSON.parse(value) as AiChatResponse;
      if (parsed && typeof parsed.message === 'string') {
        return {
          message: parsed.message,
          updates: parsed.updates,
          tokensApprox: parsed.tokensApprox
        };
      }
    } catch {
      // ignore
    }
    return null;
  };

  const direct = tryParse(trimmed);
  if (direct) {
    return direct;
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    const parsed = tryParse(candidate);
    if (parsed) {
      return parsed;
    }
  }

  return {
    message: trimmed
  };
}

function buildDraftIterationPrompt(args: {
  knowledgeBase: string;
  templateSubject: string;
  textTemplate: string;
  htmlTemplate?: string;
  lead: {
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    company?: string | null;
    role?: string | null;
    timezone?: string | null;
    phone?: string | null;
    address?: string | null;
    customJson?: unknown;
  };
  previousText?: string;
  previousHtml?: string;
  instructions?: string;
}): string {
  const {
    knowledgeBase,
    templateSubject,
    textTemplate,
    htmlTemplate,
    lead,
    previousText,
    previousHtml,
    instructions
  } = args;

  const leadData = {
    email: lead.email,
    first_name: lead.firstName,
    last_name: lead.lastName,
    company: lead.company,
    role: lead.role,
    timezone: lead.timezone,
    phone: lead.phone,
    address: lead.address,
    custom:
      lead.customJson && typeof lead.customJson === 'object' && !Array.isArray(lead.customJson)
        ? (lead.customJson as Record<string, unknown>)
        : {}
  };

  const feedbackSection = instructions ? `\nCreator feedback: ${instructions}` : '';
  const previousTextSection = previousText ? `\nPrevious draft (text):\n${previousText}` : '';
  const previousHtmlSection = previousHtml ? `\nPrevious draft (html):\n${previousHtml}` : '';
  const htmlSection = htmlTemplate ? `\nActive HTML template:\n${htmlTemplate}` : '';

  return `Knowledge Base:\n${knowledgeBase}\n\nBase Template:\nSubject: ${templateSubject}\nText Body:\n${textTemplate}${htmlSection}\nLead Data (JSON):\n${JSON.stringify(leadData, null, 2)}${previousTextSection}${previousHtmlSection}${feedbackSection}\n\nInstructions:\n- Improve the draft while keeping tone human and aligned with the template's layout.\n- Keep body under 150 words and retain a clear CTA.\n- Return JSON with keys 'subject', 'body' (plain text), and 'html'.`;
}
