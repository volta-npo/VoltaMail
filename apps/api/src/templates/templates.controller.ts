import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Delete,
  Req,
  Res,
  UseGuards,
  BadRequestException,
  Logger
} from '@nestjs/common';
import type { Response } from 'express';
import { TemplatesService } from './templates.service.js';
import { SessionGuard } from '../auth/session.guard.js';
import { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { CreateTemplateDto } from './dto/create-template.dto.js';
import {
  TemplateSummary,
  RenderedLeadPreview,
  AiDraftResult,
  SendDraftResponse,
  AiTemplateSuggestion,
  BulkSendResponse
} from '@email-automation/shared';
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
import { TemplateChatDto } from './dto/template-chat.dto.js';

@Controller('v1')
export class TemplatesController {
  private readonly logger = new Logger(TemplatesController.name);

  constructor(private readonly templatesService: TemplatesService) {}

  @Get('projects/:projectId/templates')
  @UseGuards(SessionGuard)
  async listTemplates(
    @Param('projectId') projectId: string,
    @Param() _params: unknown,
    @Body() _body: unknown,
    @Req() request: AuthenticatedRequest
  ): Promise<TemplateSummary[]> {
    return this.templatesService.listTemplates(projectId, request.auth!.user);
  }

  @Post('projects/:projectId/templates')
  @UseGuards(SessionGuard)
  async createTemplate(
    @Param('projectId') projectId: string,
    @Body() body: CreateTemplateDto,
    @Req() request: AuthenticatedRequest
  ): Promise<TemplateSummary> {
    return this.templatesService.createTemplate(projectId, body, request.auth!.user);
  }

  @Put('templates/:templateId')
  @UseGuards(SessionGuard)
  async updateTemplate(
    @Param('templateId') templateId: string,
    @Body() body: UpdateTemplateDto,
    @Req() request: AuthenticatedRequest
  ): Promise<TemplateSummary> {
    return this.templatesService.updateTemplate(templateId, body, request.auth!.user);
  }

  @Delete('templates/:templateId')
  @UseGuards(SessionGuard)
  async deleteTemplate(
    @Param('templateId') templateId: string,
    @Req() request: AuthenticatedRequest
  ) {
    await this.templatesService.deleteTemplate(templateId, request.auth!.user);
    return { success: true };
  }

  @Post('templates/:templateId/render')
  @UseGuards(SessionGuard)
  async renderTemplate(
    @Param('templateId') templateId: string,
    @Body() body: RenderTemplateDto,
    @Req() request: AuthenticatedRequest
  ): Promise<RenderedLeadPreview[]> {
    return this.templatesService.renderTemplate(templateId, body, request.auth!.user);
  }

  @Post('templates/:templateId/generate')
  @UseGuards(SessionGuard)
  async generateTemplate(
    @Param('templateId') templateId: string,
    @Body() body: GenerateTemplateDto,
    @Req() request: AuthenticatedRequest
  ): Promise<AiDraftResult[]> {
    return this.templatesService.generateAiDrafts(templateId, body, request.auth!.user);
  }

  @Post('templates/:templateId/chat')
  @UseGuards(SessionGuard)
  async chatWithTemplate(
    @Param('templateId') templateId: string,
    @Body() body: TemplateChatDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.templatesService.chatWithTemplate(templateId, body, request.auth!.user);
  }

  @Post('templates/:templateId/send')
  @UseGuards(SessionGuard)
  async sendTemplate(
    @Param('templateId') templateId: string,
    @Body() body: SendDraftDto,
    @Req() request: AuthenticatedRequest
  ): Promise<SendDraftResponse> {
    return this.templatesService.sendDraft(templateId, body, request.auth!.user);
  }

  @Post('projects/:projectId/templates/suggest')
  @UseGuards(SessionGuard)
  async suggestTemplate(
    @Param('projectId') projectId: string,
    @Body() body: SuggestTemplateDto,
    @Req() request: AuthenticatedRequest,
    @Res() res: Response
  ): Promise<void> {
    try {
      this.logger.debug(
        `[suggest] Processing for project: ${projectId}, provider: ${body.provider}, leadSampleSize: ${body.leadSampleSize}`
      );

      const { provider, stream } = await this.templatesService.prepareSuggestionStream(
        projectId,
        body,
        request.auth!.user
      );

      if (provider !== 'gemini') {
        let fullText = '';
        for await (const chunk of stream) {
          fullText += chunk;
        }
        res.json(JSON.parse(fullText));
        this.logger.debug(`[suggest] Success for project: ${projectId}`);
        return;
      }

      res.set({
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Transfer-Encoding': 'chunked'
      });
      res.flushHeaders();

      for await (const chunk of stream) {
        res.write(chunk);
        res.flush?.();
      }
      res.end();
      this.logger.debug(`[suggest] Success for project: ${projectId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[suggest] Failed for project ${projectId}: ${errorMessage}`,
        error instanceof Error ? error.stack : ''
      );
      if (!res.headersSent) {
        throw error;
      }
      res.end();
    }
  }

  @Post('projects/:projectId/templates/suggest-html')
  @UseGuards(SessionGuard)
  async suggestHtmlTemplates(
    @Param('projectId') projectId: string,
    @Body() body: SuggestHtmlTemplateDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.templatesService.suggestHtmlTemplates(projectId, body, request.auth!.user);
  }

  @Post('templates/:templateId/send-bulk')
  @UseGuards(SessionGuard)
  async sendBulkDrafts(
    @Param('templateId') templateId: string,
    @Body() body: SendBulkDraftsDto,
    @Req() request: AuthenticatedRequest
  ): Promise<BulkSendResponse> {
    return this.templatesService.sendBulkDrafts(templateId, body, request.auth!.user);
  }

  @Get('templates/:templateId/versions')
  @UseGuards(SessionGuard)
  async listTemplateVersions(
    @Param('templateId') templateId: string,
    @Req() request: AuthenticatedRequest
  ) {
    return this.templatesService.listTemplateVersions(templateId, request.auth!.user);
  }

  @Post('templates/:templateId/versions')
  @UseGuards(SessionGuard)
  async createTemplateVersion(
    @Param('templateId') templateId: string,
    @Body() body: CreateTemplateVersionDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.templatesService.createTemplateVersion(templateId, body, request.auth!.user);
  }

  @Put('templates/:templateId/versions/:versionId')
  @UseGuards(SessionGuard)
  async updateTemplateVersion(
    @Param('templateId') templateId: string,
    @Param('versionId') versionId: string,
    @Body() body: UpdateTemplateVersionDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.templatesService.updateTemplateVersion(templateId, versionId, body, request.auth!.user);
  }

  @Post('templates/:templateId/versions/:versionId/activate')
  @UseGuards(SessionGuard)
  async activateTemplateVersion(
    @Param('templateId') templateId: string,
    @Param('versionId') versionId: string,
    @Req() request: AuthenticatedRequest
  ) {
    return this.templatesService.activateTemplateVersion(templateId, versionId, request.auth!.user);
  }

  @Post('templates/:templateId/iterate-drafts')
  @UseGuards(SessionGuard)
  async iterateDrafts(
    @Param('templateId') templateId: string,
    @Body() body: IterateDraftsDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.templatesService.iterateDrafts(templateId, body, request.auth!.user);
  }
}
