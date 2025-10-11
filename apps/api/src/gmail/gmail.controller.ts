import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  BadRequestException
} from '@nestjs/common';
import { GmailService } from './gmail.service.js';
import { SessionGuard } from '../auth/session.guard.js';
import { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { Response } from 'express';
import { GmailConnectionSummary } from '@email-automation/shared';

@Controller('v1')
export class GmailController {
  constructor(private readonly gmailService: GmailService) {}

  @Get('projects/:projectId/gmail/connections')
  @UseGuards(SessionGuard)
  async listConnections(
    @Param('projectId') projectId: string,
    @Req() request: AuthenticatedRequest
  ): Promise<GmailConnectionSummary[]> {
    return this.gmailService.listConnections(projectId, request.auth!.user);
  }

  @Get('projects/:projectId/gmail/oauth/url')
  @UseGuards(SessionGuard)
  async getOAuthUrl(
    @Param('projectId') projectId: string,
    @Req() request: AuthenticatedRequest
  ): Promise<{ url: string }> {
    const sessionToken = request.auth?.session.sessionToken;
    if (!sessionToken) {
      throw new BadRequestException('Missing session token');
    }

    const url = await this.gmailService.generateAuthUrl(
      projectId,
      request.auth!.user,
      sessionToken
    );

    return { url };
  }
}

@Controller('v1/gmail')
export class GmailCallbackController {
  constructor(private readonly gmailService: GmailService) {}

  @Get('oauth/callback')
  async handleCallback(
    @Query('code') code: string | null,
    @Query('state') state: string | null,
    @Res() res: Response
  ) {
    try {
      const { redirectUrl } = await this.gmailService.handleOAuthCallback(code, state);
      return res.redirect(302, redirectUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error';
      return res.redirect(
        302,
        `${process.env.APP_BASE_URL ?? 'http://localhost:3000'}/integrations/gmail/connected?status=error&message=${encodeURIComponent(
          message
        )}`
      );
    }
  }
}
