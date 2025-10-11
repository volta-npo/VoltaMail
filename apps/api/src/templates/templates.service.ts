import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
  TemplateVersionSource
} from '@email-automation/shared';
import { renderTemplate } from './template-renderer.js';
import { AiClientService } from '../ai/ai-client.service.js';
import { GmailService } from '../gmail/gmail.service.js';
import { TokenCipherService } from '../security/token-cipher.service.js';

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService,
    private readonly aiClient: AiClientService,
    private readonly gmailService: GmailService,
    private readonly tokenCipher: TokenCipherService
  ) {}

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
    const activeVersion = template.activeVersion;
    const baseTextTemplate = activeVersion?.textContent ?? template.body;
    const baseHtmlTemplate = activeVersion?.htmlContent ?? null;

    const results: AiDraftResult[] = [];
    for (const lead of leads) {
      const systemPrompt =
        'You are a helpful outreach email specialist and HTML email designer. Use the provided knowledge base to create a personalized email. Respond with valid JSON containing "subject", "body" (plain text) and "html" (well-formed HTML that uses inline styles).';
      const userPrompt = buildUserPrompt({
        knowledgeBase,
        templateSubject: template.subject,
        textTemplate: baseTextTemplate,
        htmlTemplate: baseHtmlTemplate ?? undefined,
        lead
      });

      const raw = await this.aiClient.generate({
        provider: dto.provider ?? 'openrouter',
        systemPrompt,
        userPrompt
      });

      const { subject, body, html } = parseAiResponse(raw);

      results.push({
        leadId: lead.id,
        email: lead.email,
        subject,
        body,
        html,
        templateVersionId: activeVersion?.id ?? undefined,
        provider: dto.provider ?? 'openrouter'
      });
    }

    return results;
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

    const sampleSize = Math.min(dto.leadSampleSize ?? 25, 50);

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

    const raw = await this.aiClient.generate({
      provider: dto.provider ?? 'openrouter',
      systemPrompt,
      userPrompt
    });

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
    const provider = dto.provider ?? 'openrouter';

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
          provider
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

      const raw = await this.aiClient.generate({
        provider,
        systemPrompt,
        userPrompt
      });

      const { subject, body, html } = parseAiResponse(raw);

      results.push({
        leadId: lead.id,
        email: lead.email,
        subject,
        body,
        html,
        templateVersionId: templateVersionId ?? undefined,
        provider
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

function buildUserPrompt(args: {
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
}): string {
  const { knowledgeBase, templateSubject, textTemplate, htmlTemplate, lead } = args;
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

  return `Knowledge Base:\n${knowledgeBase}\n\nBase Template:\nSubject: ${templateSubject}\nText Body:\n${textTemplate}${htmlSection}\nLead Data (JSON):\n${JSON.stringify(leadData, null, 2)}\n\nInstructions:\n- Maintain a friendly, human tone.\n- Keep body under 150 words.\n- Include a single clear call-to-action.\n- If an HTML template is provided, reuse its layout/styles while personalizing copy.\n- Return your answer as JSON with keys 'subject', 'body' (plain text) and 'html' (HTML email).`;
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

  return { subject, body, html };
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
