import {
  BadRequestException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service.js';
import { SessionService } from '../auth/session.service.js';
import { AuthenticatedUser } from '../auth/authenticated-request.js';
import { TokenCipherService } from '../security/token-cipher.service.js';
import { ProjectAccessService } from '../projects/project-access.service.js';
import { OAuth2Client } from 'google-auth-library';
import { GmailConnectionSummary } from '@email-automation/shared';

const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

interface OAuthStatePayload {
  projectId: string;
  sessionToken: string;
}

@Injectable()
export class GmailService {
  private readonly oauthClientId: string;
  private readonly oauthClientSecret: string;
  private readonly oauthRedirectUri: string;
  private readonly appBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly sessionService: SessionService,
    private readonly tokenCipher: TokenCipherService,
    private readonly projectAccess: ProjectAccessService
  ) {
    this.oauthClientId =
      this.configService.get<string>('GMAIL_OAUTH_CLIENT_ID') ??
      this.configService.get<string>('GOOGLE_CLIENT_ID') ??
      '';
    this.oauthClientSecret =
      this.configService.get<string>('GMAIL_OAUTH_CLIENT_SECRET') ??
      this.configService.get<string>('GOOGLE_CLIENT_SECRET') ??
      '';
    this.oauthRedirectUri =
      this.configService.get<string>('GMAIL_OAUTH_REDIRECT_URI') ??
      'http://localhost:4000/api/v1/gmail/oauth/callback';
    this.appBaseUrl = this.configService.get<string>('APP_BASE_URL') ?? 'http://localhost:3000';

    if (!this.oauthClientId || !this.oauthClientSecret) {
      throw new Error('Gmail OAuth client credentials are not configured.');
    }
  }

  async listConnections(projectId: string, user: AuthenticatedUser): Promise<GmailConnectionSummary[]> {
    await this.projectAccess.ensureProjectAccess(projectId, user);

    const connections = await this.prisma.gmailConnection.findMany({
      where: {
        projectId
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return connections.map((connection) => {
      const metadata =
        connection.tokenMetadataJson &&
        typeof connection.tokenMetadataJson === 'object' &&
        !Array.isArray(connection.tokenMetadataJson)
          ? (connection.tokenMetadataJson as Partial<{
              needsReauth: boolean;
              lastError: string;
              lastErrorAt: string;
            }>)
          : null;

      const needsReauth = metadata?.needsReauth === true;
      const lastError = metadata?.lastError ?? null;
      const lastErrorAt = metadata?.lastErrorAt ?? null;

      return {
        id: connection.id,
        email: connection.email,
        connectedAt: connection.createdAt.toISOString(),
        scopes: connection.scopes,
        needsReauth,
        lastError,
        lastErrorAt
      } satisfies GmailConnectionSummary;
    });
  }

  async generateAuthUrl(projectId: string, user: AuthenticatedUser, sessionToken: string) {
    await this.projectAccess.ensureProjectAccess(projectId, user);

    const oauthClient = this.createOAuthClient();
    const statePayload: OAuthStatePayload = {
      projectId,
      sessionToken
    };

    const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url');

    return oauthClient.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: DEFAULT_SCOPES,
      state
    });
  }

  async handleOAuthCallback(code: string | null, state: string | null) {
    if (!code || !state) {
      throw new BadRequestException('Missing OAuth credentials');
    }

    let payload: OAuthStatePayload;
    try {
      payload = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')) as OAuthStatePayload;
    } catch {
      throw new BadRequestException('Invalid OAuth state');
    }

    const session = await this.sessionService.getSessionWithUser(payload.sessionToken);
    if (!session) {
      throw new UnauthorizedException('Session expired. Please try connecting again.');
    }

    await this.projectAccess.ensureProjectAccess(payload.projectId, session.user);

    const oauthClient = this.createOAuthClient();
    const { tokens } = await oauthClient.getToken(code);

    if (!tokens.refresh_token) {
      throw new BadRequestException(
        'Google did not return a refresh token. Request offline access and try again.'
      );
    }

    oauthClient.setCredentials(tokens);

    const accessToken = tokens.access_token ?? undefined;
    const tokenInfo =
      accessToken != null ? await oauthClient.getTokenInfo(accessToken) : undefined;

    let email = tokenInfo?.email ?? null;
    let googleUserId = tokenInfo?.sub ?? tokenInfo?.user_id ?? null;

    if (!email) {
      const profileResponse = await oauthClient.request<{ email?: string; id?: string }>({
        url: 'https://www.googleapis.com/oauth2/v2/userinfo'
      });
      email = profileResponse.data.email ?? null;
      googleUserId = googleUserId ?? profileResponse.data.id ?? null;
    }

    if (!email || !googleUserId) {
      throw new BadRequestException('Unable to determine Google account identity.');
    }

    const existingConnection = await this.prisma.gmailConnection.findUnique({
      where: {
        projectId_email: {
          projectId: payload.projectId,
          email
        }
      }
    });

    const refreshToken =
      tokens.refresh_token ??
      (existingConnection
        ? this.tokenCipher.decrypt(existingConnection.refreshTokenCiphertext)
        : null);

    if (!refreshToken) {
      throw new BadRequestException('Missing refresh token in OAuth response.');
    }

    const refreshTokenCiphertext = this.tokenCipher.encrypt(refreshToken);
    const scopes = tokens.scope
      ? typeof tokens.scope === 'string'
        ? tokens.scope.split(/\s+/).filter(Boolean)
        : tokens.scope
      : DEFAULT_SCOPES;

    const tokenMetadata = JSON.parse(JSON.stringify(tokens ?? {}));

    const connection = await this.prisma.gmailConnection.upsert({
      where: {
        projectId_email: {
          projectId: payload.projectId,
          email
        }
      },
      update: {
        googleUserId,
        refreshTokenCiphertext,
        accessToken: tokens.access_token ?? null,
        accessTokenExpiresAt: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : existingConnection?.accessTokenExpiresAt ?? null,
        scopes,
        tokenMetadataJson: tokenMetadata
      },
      create: {
        projectId: payload.projectId,
        googleUserId,
        email,
        refreshTokenCiphertext,
        accessToken: tokens.access_token ?? null,
        accessTokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        scopes,
        tokenMetadataJson: tokenMetadata
      }
    });

    return {
      redirectUrl: `${this.appBaseUrl}/integrations/gmail/connected?status=success&projectId=${
        payload.projectId
      }&email=${encodeURIComponent(connection.email)}`
    };
  }

  async sendEmail(options: {
    projectId: string;
    gmailConnectionId?: string;
    to: string;
    subject: string;
    body: string;
    html?: string | null;
  }): Promise<{
    messageId: string;
    gmailConnectionId: string;
    gmailConnectionEmail: string;
    sentAt: string;
  }> {
    const connection = options.gmailConnectionId
      ? await this.prisma.gmailConnection.findFirst({
          where: {
            id: options.gmailConnectionId,
            projectId: options.projectId
          }
        })
      : await this.prisma.gmailConnection.findFirst({
          where: {
            projectId: options.projectId
          },
          orderBy: {
            createdAt: 'desc'
          }
        });

    if (!connection) {
      throw new BadRequestException('No Gmail connection available for this project.');
    }

    const metadata: {
      needsReauth?: boolean;
      lastError?: string | null;
      lastErrorAt?: string | null;
    } =
      connection.tokenMetadataJson &&
      typeof connection.tokenMetadataJson === 'object' &&
      !Array.isArray(connection.tokenMetadataJson)
        ? { ...(connection.tokenMetadataJson as Record<string, unknown>) }
        : {};

    const updateMetadata = async (updates: {
      needsReauth?: boolean;
      lastError?: string | null;
      lastErrorAt?: string | null;
    }) => {
      Object.assign(metadata, updates);
      await this.prisma.gmailConnection.update({
        where: { id: connection.id },
        data: {
          tokenMetadataJson: {
            ...metadata,
            needsReauth: metadata.needsReauth ?? false,
            lastError: metadata.lastError ?? null,
            lastErrorAt: metadata.lastErrorAt ?? null
          }
        }
      });
    };

    const refreshToken = this.tokenCipher.decrypt(connection.refreshTokenCiphertext);

    const oauthClient = this.createOAuthClient();
    oauthClient.setCredentials({ refresh_token: refreshToken });
    let accessToken;
    try {
      accessToken = await oauthClient.getAccessToken();
    } catch (error) {
      await updateMetadata({
        needsReauth: true,
        lastError: 'Google rejected the stored refresh token.',
        lastErrorAt: new Date().toISOString()
      });
      throw new UnauthorizedException(
        'Gmail access expired. Reconnect your Gmail account from Integrations → Gmail to continue sending.'
      );
    }

    if (!accessToken?.token) {
      await updateMetadata({
        needsReauth: true,
        lastError: 'Unable to obtain Gmail access token.',
        lastErrorAt: new Date().toISOString()
      });
      throw new UnauthorizedException('Unable to obtain Gmail access token. Reconnect Gmail and try again.');
    }

    const rawMessage = buildMimeMessage({
      from: connection.email,
      to: options.to,
      subject: options.subject,
      textBody: options.body,
      htmlBody: options.html ?? undefined
    });

    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw: rawMessage })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let parsedMessage = errorBody;
      try {
        const parsed = JSON.parse(errorBody) as { error?: { message?: string; status?: string } };
        if (parsed.error?.message) {
          parsedMessage = parsed.error.message;
        }
      } catch {
        // ignore JSON parse errors
      }

      const requiresReauth =
        response.status === 401 || parsedMessage.toLowerCase().includes('invalid_grant');

      await updateMetadata({
        needsReauth: requiresReauth || metadata.needsReauth === true,
        lastError: parsedMessage,
        lastErrorAt: new Date().toISOString()
      });

      if (requiresReauth) {
        throw new UnauthorizedException(
          'Gmail connection needs to be refreshed. Reconnect Gmail from Integrations → Gmail and then retry.'
        );
      }

      throw new BadRequestException(parsedMessage);
    }

    const json = (await response.json()) as { id?: string };
    const messageId = json.id ?? '';
    const sentAt = new Date().toISOString();

    if (metadata.needsReauth === true || metadata.lastError) {
      await updateMetadata({ needsReauth: false, lastError: null, lastErrorAt: null });
    }

    return {
      messageId,
      gmailConnectionId: connection.id,
      gmailConnectionEmail: connection.email,
      sentAt
    };
  }

  private createOAuthClient() {
    return new OAuth2Client({
      clientId: this.oauthClientId,
      clientSecret: this.oauthClientSecret,
      redirectUri: this.oauthRedirectUri
    });
  }
}

function buildMimeMessage(args: {
  from: string;
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
}): string {
  const boundary = '001a1142f64c1b8f5b05';

  let messageLines: string[];

  if (args.htmlBody) {
    messageLines = [
      `From: ${args.from}`,
      `To: ${args.to}`,
      `Subject: ${args.subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      '',
      args.textBody,
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      '',
      args.htmlBody,
      `--${boundary}--`
    ];
  } else {
    messageLines = [
      `From: ${args.from}`,
      `To: ${args.to}`,
      `Subject: ${args.subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      args.textBody
    ];
  }

  return Buffer.from(messageLines.join('\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
