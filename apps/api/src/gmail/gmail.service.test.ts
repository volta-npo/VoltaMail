import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GmailService } from './gmail.service';
import { PrismaService } from '../prisma.service';
import { SessionService } from '../auth/session.service';
import { TokenCipherService } from '../security/token-cipher.service';
import { ProjectAccessService } from '../projects/project-access.service';
import { OAuth2Client } from 'google-auth-library';
import { AuthenticatedUser } from '../auth/authenticated-request';

// Mock the fetch API
global.fetch = vi.fn();

// Mock OAuth2Client
vi.mock('google-auth-library', () => {
  return {
    OAuth2Client: vi.fn().mockImplementation(() => ({
      generateAuthUrl: vi.fn(),
      getToken: vi.fn(),
      setCredentials: vi.fn(),
      getTokenInfo: vi.fn(),
      request: vi.fn(),
      getAccessToken: vi.fn()
    }))
  };
});

describe('GmailService', () => {
  let service: GmailService;
  let prismaService: PrismaService;
  let configService: ConfigService;
  let sessionService: SessionService;
  let tokenCipherService: TokenCipherService;
  let projectAccessService: ProjectAccessService;
  let mockOAuthClient: OAuth2Client;

  const mockUser: AuthenticatedUser = {
    userId: 'user-123',
    sessionId: 'session-123'
  };

  const mockConnection = {
    id: 'conn-123',
    projectId: 'project-123',
    googleUserId: 'google-user-123',
    email: 'test@example.com',
    refreshTokenCiphertext: 'encrypted-refresh-token',
    accessToken: 'access-token-123',
    accessTokenExpiresAt: new Date(Date.now() + 3600000),
    scopes: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.email'
    ],
    tokenMetadataJson: {},
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z')
  };

  beforeEach(() => {
    prismaService = {
      gmailConnection: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn()
      }
    } as any;

    configService = {
      get: vi.fn((key: string) => {
        const config: Record<string, string> = {
          GMAIL_OAUTH_CLIENT_ID: 'test-client-id',
          GMAIL_OAUTH_CLIENT_SECRET: 'test-client-secret',
          GMAIL_OAUTH_REDIRECT_URI: 'http://localhost:4000/api/v1/gmail/oauth/callback',
          APP_BASE_URL: 'http://localhost:3000'
        };
        return config[key];
      })
    } as any;

    sessionService = {
      getSessionWithUser: vi.fn()
    } as any;

    tokenCipherService = {
      encrypt: vi.fn((token: string) => `encrypted-${token}`),
      decrypt: vi.fn((ciphertext: string) => ciphertext.replace('encrypted-', ''))
    } as any;

    projectAccessService = {
      ensureProjectAccess: vi.fn()
    } as any;

    service = new GmailService(
      prismaService,
      configService,
      sessionService,
      tokenCipherService,
      projectAccessService
    );

    // Get the mock OAuth client instance
    mockOAuthClient = new OAuth2Client() as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with valid OAuth credentials', () => {
      expect(service).toBeDefined();
      expect(configService.get).toHaveBeenCalledWith('GMAIL_OAUTH_CLIENT_ID');
      expect(configService.get).toHaveBeenCalledWith('GMAIL_OAUTH_CLIENT_SECRET');
    });

    it('should throw error when OAuth credentials are missing', () => {
      const mockConfigWithoutCredentials = {
        get: vi.fn(() => '')
      } as any;

      expect(() => {
        new GmailService(
          prismaService,
          mockConfigWithoutCredentials,
          sessionService,
          tokenCipherService,
          projectAccessService
        );
      }).toThrow('Gmail OAuth client credentials are not configured.');
    });

    it('should fallback to GOOGLE_CLIENT_ID if GMAIL_OAUTH_CLIENT_ID is not set', () => {
      const mockConfigWithFallback = {
        get: vi.fn((key: string) => {
          const config: Record<string, string> = {
            GOOGLE_CLIENT_ID: 'fallback-client-id',
            GOOGLE_CLIENT_SECRET: 'fallback-client-secret'
          };
          return config[key];
        })
      } as any;

      const testService = new GmailService(
        prismaService,
        mockConfigWithFallback,
        sessionService,
        tokenCipherService,
        projectAccessService
      );
      expect(testService).toBeDefined();
    });
  });

  describe('listConnections', () => {
    it('should return list of Gmail connections', async () => {
      const connections = [
        mockConnection,
        {
          ...mockConnection,
          id: 'conn-456',
          email: 'test2@example.com'
        }
      ];

      projectAccessService.ensureProjectAccess.mockResolvedValue(undefined);
      prismaService.gmailConnection.findMany.mockResolvedValue(connections);

      const result = await service.listConnections('project-123', mockUser);

      expect(projectAccessService.ensureProjectAccess).toHaveBeenCalledWith('project-123', mockUser);
      expect(prismaService.gmailConnection.findMany).toHaveBeenCalledWith({
        where: { projectId: 'project-123' },
        orderBy: { createdAt: 'desc' }
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'conn-123',
        email: 'test@example.com',
        connectedAt: '2024-01-01T00:00:00.000Z',
        scopes: mockConnection.scopes,
        needsReauth: false,
        lastError: null,
        lastErrorAt: null
      });
    });

    it('should handle connections with needsReauth metadata', async () => {
      const connectionWithMetadata = {
        ...mockConnection,
        tokenMetadataJson: {
          needsReauth: true,
          lastError: 'Token expired',
          lastErrorAt: '2024-01-15T00:00:00.000Z'
        }
      };

      projectAccessService.ensureProjectAccess.mockResolvedValue(undefined);
      prismaService.gmailConnection.findMany.mockResolvedValue([connectionWithMetadata]);

      const result = await service.listConnections('project-123', mockUser);

      expect(result[0].needsReauth).toBe(true);
      expect(result[0].lastError).toBe('Token expired');
      expect(result[0].lastErrorAt).toBe('2024-01-15T00:00:00.000Z');
    });

    it('should handle invalid tokenMetadataJson', async () => {
      const connectionWithInvalidMetadata = {
        ...mockConnection,
        tokenMetadataJson: ['invalid', 'array']
      };

      projectAccessService.ensureProjectAccess.mockResolvedValue(undefined);
      prismaService.gmailConnection.findMany.mockResolvedValue([connectionWithInvalidMetadata]);

      const result = await service.listConnections('project-123', mockUser);

      expect(result[0].needsReauth).toBe(false);
      expect(result[0].lastError).toBeNull();
    });

    it('should throw error if user lacks project access', async () => {
      projectAccessService.ensureProjectAccess.mockRejectedValue(
        new UnauthorizedException('Access denied')
      );

      await expect(service.listConnections('project-123', mockUser)).rejects.toThrow(
        UnauthorizedException
      );
    });
  });

  describe('generateAuthUrl', () => {
    it('should generate OAuth authorization URL', async () => {
      const expectedUrl = 'https://accounts.google.com/o/oauth2/auth?client_id=test';
      projectAccessService.ensureProjectAccess.mockResolvedValue(undefined);
      mockOAuthClient.generateAuthUrl.mockReturnValue(expectedUrl);

      // Mock the OAuth2Client constructor to return our mock
      (OAuth2Client as any).mockImplementation(() => mockOAuthClient);

      const result = await service.generateAuthUrl('project-123', mockUser, 'session-token-123');

      expect(projectAccessService.ensureProjectAccess).toHaveBeenCalledWith('project-123', mockUser);
      expect(mockOAuthClient.generateAuthUrl).toHaveBeenCalledWith({
        access_type: 'offline',
        prompt: 'consent',
        scope: [
          'https://www.googleapis.com/auth/gmail.send',
          'https://www.googleapis.com/auth/userinfo.email',
          'https://www.googleapis.com/auth/userinfo.profile'
        ],
        state: expect.any(String)
      });
      expect(result).toBe(expectedUrl);
    });

    it('should encode state with projectId and sessionToken', async () => {
      projectAccessService.ensureProjectAccess.mockResolvedValue(undefined);
      mockOAuthClient.generateAuthUrl.mockReturnValue('https://oauth.url');
      (OAuth2Client as any).mockImplementation(() => mockOAuthClient);

      await service.generateAuthUrl('project-123', mockUser, 'session-token-123');

      const callArgs = mockOAuthClient.generateAuthUrl.mock.calls[0][0];
      const state = callArgs.state as string;
      const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));

      expect(decoded).toEqual({
        projectId: 'project-123',
        sessionToken: 'session-token-123'
      });
    });
  });

  describe('handleOAuthCallback', () => {
    const validCode = 'oauth-code-123';
    const validState = Buffer.from(
      JSON.stringify({
        projectId: 'project-123',
        sessionToken: 'session-token-123'
      })
    ).toString('base64url');

    const mockTokens = {
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expiry_date: Date.now() + 3600000,
      scope:
        'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email'
    };

    beforeEach(() => {
      (OAuth2Client as any).mockImplementation(() => mockOAuthClient);
    });

    it('should handle successful OAuth callback', async () => {
      sessionService.getSessionWithUser.mockResolvedValue({
        user: mockUser,
        id: 'session-123',
        userId: mockUser.userId,
        expiresAt: new Date(Date.now() + 86400000),
        token: 'session-token-123',
        createdAt: new Date()
      });
      projectAccessService.ensureProjectAccess.mockResolvedValue(undefined);
      mockOAuthClient.getToken.mockResolvedValue({ tokens: mockTokens });
      mockOAuthClient.getTokenInfo.mockResolvedValue({
        email: 'test@example.com',
        sub: 'google-user-123'
      });
      prismaService.gmailConnection.findUnique.mockResolvedValue(null);
      prismaService.gmailConnection.upsert.mockResolvedValue(mockConnection);

      const result = await service.handleOAuthCallback(validCode, validState);

      expect(sessionService.getSessionWithUser).toHaveBeenCalledWith('session-token-123');
      expect(mockOAuthClient.getToken).toHaveBeenCalledWith(validCode);
      expect(prismaService.gmailConnection.upsert).toHaveBeenCalled();
      expect(result.redirectUrl).toContain('status=success');
      expect(result.redirectUrl).toContain('projectId=project-123');
    });

    it('should throw BadRequestException when code is missing', async () => {
      await expect(service.handleOAuthCallback(null, validState)).rejects.toThrow(
        new BadRequestException('Missing OAuth credentials')
      );
    });

    it('should throw BadRequestException when state is missing', async () => {
      await expect(service.handleOAuthCallback(validCode, null)).rejects.toThrow(
        new BadRequestException('Missing OAuth credentials')
      );
    });

    it('should throw BadRequestException when state is invalid', async () => {
      await expect(service.handleOAuthCallback(validCode, 'invalid-state')).rejects.toThrow(
        new BadRequestException('Invalid OAuth state')
      );
    });

    it('should throw UnauthorizedException when session is expired', async () => {
      sessionService.getSessionWithUser.mockResolvedValue(null);

      await expect(service.handleOAuthCallback(validCode, validState)).rejects.toThrow(
        new UnauthorizedException('Session expired. Please try connecting again.')
      );
    });

    it('should throw BadRequestException when refresh token is missing', async () => {
      sessionService.getSessionWithUser.mockResolvedValue({
        user: mockUser,
        id: 'session-123',
        userId: mockUser.userId,
        expiresAt: new Date(Date.now() + 86400000),
        token: 'session-token-123',
        createdAt: new Date()
      });
      projectAccessService.ensureProjectAccess.mockResolvedValue(undefined);
      mockOAuthClient.getToken.mockResolvedValue({
        tokens: { ...mockTokens, refresh_token: undefined }
      });

      await expect(service.handleOAuthCallback(validCode, validState)).rejects.toThrow(
        new BadRequestException(
          'Google did not return a refresh token. Request offline access and try again.'
        )
      );
    });

    it('should fetch user profile when tokenInfo does not contain email', async () => {
      sessionService.getSessionWithUser.mockResolvedValue({
        user: mockUser,
        id: 'session-123',
        userId: mockUser.userId,
        expiresAt: new Date(Date.now() + 86400000),
        token: 'session-token-123',
        createdAt: new Date()
      });
      projectAccessService.ensureProjectAccess.mockResolvedValue(undefined);
      mockOAuthClient.getToken.mockResolvedValue({ tokens: mockTokens });
      mockOAuthClient.getTokenInfo.mockResolvedValue({});
      mockOAuthClient.request.mockResolvedValue({
        data: { email: 'profile@example.com', id: 'profile-user-123' }
      });
      prismaService.gmailConnection.findUnique.mockResolvedValue(null);
      prismaService.gmailConnection.upsert.mockResolvedValue(mockConnection);

      const result = await service.handleOAuthCallback(validCode, validState);

      expect(mockOAuthClient.request).toHaveBeenCalledWith({
        url: 'https://www.googleapis.com/oauth2/v2/userinfo'
      });
      expect(result.redirectUrl).toContain('status=success');
    });

    it('should throw BadRequestException when unable to determine email', async () => {
      sessionService.getSessionWithUser.mockResolvedValue({
        user: mockUser,
        id: 'session-123',
        userId: mockUser.userId,
        expiresAt: new Date(Date.now() + 86400000),
        token: 'session-token-123',
        createdAt: new Date()
      });
      projectAccessService.ensureProjectAccess.mockResolvedValue(undefined);
      mockOAuthClient.getToken.mockResolvedValue({ tokens: mockTokens });
      mockOAuthClient.getTokenInfo.mockResolvedValue({});
      mockOAuthClient.request.mockResolvedValue({ data: {} });

      await expect(service.handleOAuthCallback(validCode, validState)).rejects.toThrow(
        new BadRequestException('Unable to determine Google account identity.')
      );
    });

    it('should parse scope string into array', async () => {
      sessionService.getSessionWithUser.mockResolvedValue({
        user: mockUser,
        id: 'session-123',
        userId: mockUser.userId,
        expiresAt: new Date(Date.now() + 86400000),
        token: 'session-token-123',
        createdAt: new Date()
      });
      projectAccessService.ensureProjectAccess.mockResolvedValue(undefined);
      mockOAuthClient.getToken.mockResolvedValue({ tokens: mockTokens });
      mockOAuthClient.getTokenInfo.mockResolvedValue({
        email: 'test@example.com',
        sub: 'google-user-123'
      });
      prismaService.gmailConnection.findUnique.mockResolvedValue(null);
      prismaService.gmailConnection.upsert.mockResolvedValue(mockConnection);

      await service.handleOAuthCallback(validCode, validState);

      const upsertCall = prismaService.gmailConnection.upsert.mock.calls[0][0];
      expect(upsertCall.create.scopes).toEqual([
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/userinfo.email'
      ]);
    });
  });

  describe('sendEmail', () => {
    const sendEmailOptions = {
      projectId: 'project-123',
      gmailConnectionId: 'conn-123',
      to: 'recipient@example.com',
      subject: 'Test Subject',
      body: 'Test body content'
    };

    beforeEach(() => {
      (OAuth2Client as any).mockImplementation(() => mockOAuthClient);
      (global.fetch as any).mockClear();
    });

    it('should send email successfully', async () => {
      prismaService.gmailConnection.findFirst.mockResolvedValue(mockConnection);
      tokenCipherService.decrypt.mockReturnValue('decrypted-refresh-token');
      mockOAuthClient.getAccessToken.mockResolvedValue({
        token: 'valid-access-token',
        res: null
      });
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'message-123' })
      });

      const result = await service.sendEmail(sendEmailOptions);

      expect(prismaService.gmailConnection.findFirst).toHaveBeenCalledWith({
        where: { id: 'conn-123', projectId: 'project-123' }
      });
      expect(tokenCipherService.decrypt).toHaveBeenCalledWith('encrypted-refresh-token');
      expect(mockOAuthClient.getAccessToken).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledWith(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-access-token',
            'Content-Type': 'application/json'
          }
        })
      );
      expect(result).toEqual({
        messageId: 'message-123',
        gmailConnectionId: 'conn-123',
        gmailConnectionEmail: 'test@example.com',
        sentAt: expect.any(String)
      });
    });

    it('should send email with HTML body', async () => {
      const optionsWithHtml = {
        ...sendEmailOptions,
        html: '<p>HTML content</p>'
      };

      prismaService.gmailConnection.findFirst.mockResolvedValue(mockConnection);
      tokenCipherService.decrypt.mockReturnValue('decrypted-refresh-token');
      mockOAuthClient.getAccessToken.mockResolvedValue({
        token: 'valid-access-token',
        res: null
      });
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'message-123' })
      });

      await service.sendEmail(optionsWithHtml);

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      const decodedMessage = Buffer.from(
        body.raw.replace(/-/g, '+').replace(/_/g, '/'),
        'base64'
      ).toString();

      expect(decodedMessage).toContain('Content-Type: text/html');
      expect(decodedMessage).toContain('HTML content');
    });

    it('should use first available connection when gmailConnectionId is not provided', async () => {
      const optionsWithoutConnectionId = {
        projectId: 'project-123',
        to: 'recipient@example.com',
        subject: 'Test',
        body: 'Body'
      };

      prismaService.gmailConnection.findFirst.mockResolvedValue(mockConnection);
      tokenCipherService.decrypt.mockReturnValue('decrypted-refresh-token');
      mockOAuthClient.getAccessToken.mockResolvedValue({
        token: 'valid-access-token',
        res: null
      });
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'message-123' })
      });

      await service.sendEmail(optionsWithoutConnectionId);

      expect(prismaService.gmailConnection.findFirst).toHaveBeenCalledWith({
        where: { projectId: 'project-123' },
        orderBy: { createdAt: 'desc' }
      });
    });

    it('should throw BadRequestException when no connection is available', async () => {
      prismaService.gmailConnection.findFirst.mockResolvedValue(null);

      await expect(service.sendEmail(sendEmailOptions)).rejects.toThrow(
        new BadRequestException('No Gmail connection available for this project.')
      );
    });

    it('should throw UnauthorizedException when refresh token is invalid', async () => {
      prismaService.gmailConnection.findFirst.mockResolvedValue(mockConnection);
      tokenCipherService.decrypt.mockReturnValue('invalid-refresh-token');
      mockOAuthClient.getAccessToken.mockRejectedValue(new Error('invalid_grant'));
      prismaService.gmailConnection.update.mockResolvedValue(mockConnection);

      await expect(service.sendEmail(sendEmailOptions)).rejects.toThrow(
        new UnauthorizedException(
          'Gmail access expired. Reconnect your Gmail account from Integrations → Gmail to continue sending.'
        )
      );

      expect(prismaService.gmailConnection.update).toHaveBeenCalledWith({
        where: { id: 'conn-123' },
        data: {
          tokenMetadataJson: expect.objectContaining({
            needsReauth: true,
            lastError: 'Google rejected the stored refresh token.'
          })
        }
      });
    });

    it('should throw UnauthorizedException when access token is not obtained', async () => {
      prismaService.gmailConnection.findFirst.mockResolvedValue(mockConnection);
      tokenCipherService.decrypt.mockReturnValue('decrypted-refresh-token');
      mockOAuthClient.getAccessToken.mockResolvedValue({ token: null, res: null });
      prismaService.gmailConnection.update.mockResolvedValue(mockConnection);

      await expect(service.sendEmail(sendEmailOptions)).rejects.toThrow(
        new UnauthorizedException('Unable to obtain Gmail access token. Reconnect Gmail and try again.')
      );
    });

    it('should handle Gmail API errors with 401 status', async () => {
      prismaService.gmailConnection.findFirst.mockResolvedValue(mockConnection);
      tokenCipherService.decrypt.mockReturnValue('decrypted-refresh-token');
      mockOAuthClient.getAccessToken.mockResolvedValue({
        token: 'valid-access-token',
        res: null
      });
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: { message: 'Unauthorized' } })
      });
      prismaService.gmailConnection.update.mockResolvedValue(mockConnection);

      await expect(service.sendEmail(sendEmailOptions)).rejects.toThrow(
        new UnauthorizedException(
          'Gmail connection needs to be refreshed. Reconnect Gmail from Integrations → Gmail and then retry.'
        )
      );

      expect(prismaService.gmailConnection.update).toHaveBeenCalledWith({
        where: { id: 'conn-123' },
        data: {
          tokenMetadataJson: expect.objectContaining({
            needsReauth: true,
            lastError: 'Unauthorized'
          })
        }
      });
    });

    it('should handle Gmail API errors with invalid_grant message', async () => {
      prismaService.gmailConnection.findFirst.mockResolvedValue(mockConnection);
      tokenCipherService.decrypt.mockReturnValue('decrypted-refresh-token');
      mockOAuthClient.getAccessToken.mockResolvedValue({
        token: 'valid-access-token',
        res: null
      });
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: { message: 'invalid_grant detected' } })
      });
      prismaService.gmailConnection.update.mockResolvedValue(mockConnection);

      await expect(service.sendEmail(sendEmailOptions)).rejects.toThrow(UnauthorizedException);
    });

    it('should handle Gmail API errors with non-auth issues', async () => {
      prismaService.gmailConnection.findFirst.mockResolvedValue(mockConnection);
      tokenCipherService.decrypt.mockReturnValue('decrypted-refresh-token');
      mockOAuthClient.getAccessToken.mockResolvedValue({
        token: 'valid-access-token',
        res: null
      });
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: { message: 'Rate limit exceeded' } })
      });
      prismaService.gmailConnection.update.mockResolvedValue(mockConnection);

      await expect(service.sendEmail(sendEmailOptions)).rejects.toThrow(
        new BadRequestException('Rate limit exceeded')
      );
    });

    it('should handle non-JSON error responses', async () => {
      prismaService.gmailConnection.findFirst.mockResolvedValue(mockConnection);
      tokenCipherService.decrypt.mockReturnValue('decrypted-refresh-token');
      mockOAuthClient.getAccessToken.mockResolvedValue({
        token: 'valid-access-token',
        res: null
      });
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error'
      });
      prismaService.gmailConnection.update.mockResolvedValue(mockConnection);

      await expect(service.sendEmail(sendEmailOptions)).rejects.toThrow(
        new BadRequestException('Internal Server Error')
      );
    });

    it('should clear error metadata after successful send', async () => {
      const connectionWithError = {
        ...mockConnection,
        tokenMetadataJson: {
          needsReauth: true,
          lastError: 'Previous error',
          lastErrorAt: '2024-01-01T00:00:00.000Z'
        }
      };

      prismaService.gmailConnection.findFirst.mockResolvedValue(connectionWithError);
      tokenCipherService.decrypt.mockReturnValue('decrypted-refresh-token');
      mockOAuthClient.getAccessToken.mockResolvedValue({
        token: 'valid-access-token',
        res: null
      });
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'message-123' })
      });
      prismaService.gmailConnection.update.mockResolvedValue(mockConnection);

      await service.sendEmail(sendEmailOptions);

      expect(prismaService.gmailConnection.update).toHaveBeenCalledWith({
        where: { id: 'conn-123' },
        data: {
          tokenMetadataJson: expect.objectContaining({
            needsReauth: false,
            lastError: null,
            lastErrorAt: null
          })
        }
      });
    });

    it('should handle connection with empty metadata', async () => {
      const connectionWithoutMetadata = {
        ...mockConnection,
        tokenMetadataJson: null
      };

      prismaService.gmailConnection.findFirst.mockResolvedValue(connectionWithoutMetadata);
      tokenCipherService.decrypt.mockReturnValue('decrypted-refresh-token');
      mockOAuthClient.getAccessToken.mockResolvedValue({
        token: 'valid-access-token',
        res: null
      });
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'message-123' })
      });

      const result = await service.sendEmail(sendEmailOptions);

      expect(result.messageId).toBe('message-123');
    });
  });

  describe('Token Encryption/Decryption', () => {
    it('should encrypt refresh tokens before storing', async () => {
      const validCode = 'oauth-code-123';
      const validState = Buffer.from(
        JSON.stringify({
          projectId: 'project-123',
          sessionToken: 'session-token-123'
        })
      ).toString('base64url');

      (OAuth2Client as any).mockImplementation(() => mockOAuthClient);
      sessionService.getSessionWithUser.mockResolvedValue({
        user: mockUser,
        id: 'session-123',
        userId: mockUser.userId,
        expiresAt: new Date(Date.now() + 86400000),
        token: 'session-token-123',
        createdAt: new Date()
      });
      projectAccessService.ensureProjectAccess.mockResolvedValue(undefined);
      mockOAuthClient.getToken.mockResolvedValue({
        tokens: {
          access_token: 'access-token',
          refresh_token: 'plain-refresh-token',
          expiry_date: Date.now() + 3600000
        }
      });
      mockOAuthClient.getTokenInfo.mockResolvedValue({
        email: 'test@example.com',
        sub: 'google-user-123'
      });
      prismaService.gmailConnection.findUnique.mockResolvedValue(null);
      prismaService.gmailConnection.upsert.mockResolvedValue(mockConnection);

      await service.handleOAuthCallback(validCode, validState);

      expect(tokenCipherService.encrypt).toHaveBeenCalledWith('plain-refresh-token');
      expect(prismaService.gmailConnection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            refreshTokenCiphertext: 'encrypted-plain-refresh-token'
          })
        })
      );
    });

    it('should decrypt refresh tokens before use', async () => {
      prismaService.gmailConnection.findFirst.mockResolvedValue(mockConnection);
      tokenCipherService.decrypt.mockReturnValue('decrypted-refresh-token');
      mockOAuthClient.getAccessToken.mockResolvedValue({
        token: 'valid-access-token',
        res: null
      });
      (OAuth2Client as any).mockImplementation(() => mockOAuthClient);
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'message-123' })
      });

      await service.sendEmail({
        projectId: 'project-123',
        gmailConnectionId: 'conn-123',
        to: 'test@example.com',
        subject: 'Test',
        body: 'Body'
      });

      expect(tokenCipherService.decrypt).toHaveBeenCalledWith('encrypted-refresh-token');
      expect(mockOAuthClient.setCredentials).toHaveBeenCalledWith({
        refresh_token: 'decrypted-refresh-token'
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle missing message ID in Gmail API response', async () => {
      prismaService.gmailConnection.findFirst.mockResolvedValue(mockConnection);
      tokenCipherService.decrypt.mockReturnValue('decrypted-refresh-token');
      mockOAuthClient.getAccessToken.mockResolvedValue({
        token: 'valid-access-token',
        res: null
      });
      (OAuth2Client as any).mockImplementation(() => mockOAuthClient);
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({})
      });

      const result = await service.sendEmail({
        projectId: 'project-123',
        to: 'test@example.com',
        subject: 'Test',
        body: 'Body'
      });

      expect(result.messageId).toBe('');
    });

    it('should handle array tokenMetadataJson gracefully', async () => {
      const connectionWithArrayMetadata = {
        ...mockConnection,
        tokenMetadataJson: ['not', 'an', 'object']
      };

      projectAccessService.ensureProjectAccess.mockResolvedValue(undefined);
      prismaService.gmailConnection.findMany.mockResolvedValue([connectionWithArrayMetadata]);

      const result = await service.listConnections('project-123', mockUser);

      expect(result[0].needsReauth).toBe(false);
      expect(result[0].lastError).toBeNull();
    });

    it('should handle tokenInfo with user_id instead of sub', async () => {
      const validCode = 'oauth-code-123';
      const validState = Buffer.from(
        JSON.stringify({
          projectId: 'project-123',
          sessionToken: 'session-token-123'
        })
      ).toString('base64url');

      (OAuth2Client as any).mockImplementation(() => mockOAuthClient);
      sessionService.getSessionWithUser.mockResolvedValue({
        user: mockUser,
        id: 'session-123',
        userId: mockUser.userId,
        expiresAt: new Date(Date.now() + 86400000),
        token: 'session-token-123',
        createdAt: new Date()
      });
      projectAccessService.ensureProjectAccess.mockResolvedValue(undefined);
      mockOAuthClient.getToken.mockResolvedValue({
        tokens: {
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expiry_date: Date.now() + 3600000
        }
      });
      mockOAuthClient.getTokenInfo.mockResolvedValue({
        email: 'test@example.com',
        user_id: 'legacy-user-id'
      });
      prismaService.gmailConnection.findUnique.mockResolvedValue(null);
      prismaService.gmailConnection.upsert.mockResolvedValue(mockConnection);

      await service.handleOAuthCallback(validCode, validState);

      expect(prismaService.gmailConnection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            googleUserId: 'legacy-user-id'
          })
        })
      );
    });
  });
});
