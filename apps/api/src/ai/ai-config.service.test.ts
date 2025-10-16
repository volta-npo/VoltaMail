import { describe, expect, it, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiConfigService } from './ai-config.service';
import { PrismaService } from '../prisma.service';
import { TokenCipherService } from '../security/token-cipher.service';
import { DEFAULT_MODELS } from './ai-client.service';

describe('AiConfigService', () => {
  let service: AiConfigService;
  let prisma: PrismaService;
  let tokenCipher: TokenCipherService;
  let configService: ConfigService;

  const mockOrganizationId = 'org-123';

  beforeEach(() => {
    vi.clearAllMocks();

    prisma = {
      organization: {
        findUnique: vi.fn()
      }
    } as any;

    tokenCipher = {
      encrypt: vi.fn(),
      decrypt: vi.fn()
    } as any;

    configService = {
      get: vi.fn()
    } as any;

    service = new AiConfigService(prisma, tokenCipher, configService);
  });

  describe('getOrganizationSecrets', () => {
    it('should return default config when no organization config exists', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: null
      } as any);

      const result = await service.getOrganizationSecrets(mockOrganizationId);

      expect(result.defaultProvider).toBe('openrouter');
      expect(result.providers).toBeDefined();
      expect(result.providers.openrouter).toBeDefined();
      expect(result.providers.openai).toBeDefined();
      expect(result.providers.gemini).toBeDefined();
    });

    it('should use stored default provider when available', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: {
          defaultProvider: 'openai'
        }
      } as any);

      const result = await service.getOrganizationSecrets(mockOrganizationId);

      expect(result.defaultProvider).toBe('openai');
    });

    it('should decrypt stored API keys', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: {
          providers: {
            openai: {
              apiKeyCiphertext: 'encrypted-key-123'
            }
          }
        }
      } as any);

      vi.spyOn(tokenCipher, 'decrypt').mockReturnValue('decrypted-api-key');

      const result = await service.getOrganizationSecrets(mockOrganizationId);

      expect(tokenCipher.decrypt).toHaveBeenCalledWith('encrypted-key-123');
      expect(result.providers.openai.apiKey).toBe('decrypted-api-key');
      expect(result.providers.openai.hasStoredKey).toBe(true);
    });

    it('should fall back to env vars when no stored key exists', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: null
      } as any);

      vi.spyOn(configService, 'get').mockReturnValue('env-api-key');

      const result = await service.getOrganizationSecrets(mockOrganizationId);

      expect(result.providers.openai.apiKey).toBe('env-api-key');
      expect(result.providers.openai.hasStoredKey).toBe(false);
    });

    it('should handle decryption failures gracefully', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: {
          providers: {
            openai: {
              apiKeyCiphertext: 'corrupted-ciphertext'
            }
          }
        }
      } as any);

      vi.spyOn(tokenCipher, 'decrypt').mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      const result = await service.getOrganizationSecrets(mockOrganizationId);

      expect(result.providers.openai.apiKey).toBeNull();
      expect(result.providers.openai.hasStoredKey).toBe(false);
    });

    it('should use stored model configuration', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: {
          providers: {
            openai: {
              model: 'gpt-4-turbo'
            }
          }
        }
      } as any);

      const result = await service.getOrganizationSecrets(mockOrganizationId);

      expect(result.providers.openai.model).toBe('gpt-4-turbo');
    });

    it('should use default model when none is stored', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: null
      } as any);

      const result = await service.getOrganizationSecrets(mockOrganizationId);

      expect(result.providers.openai.model).toBe(DEFAULT_MODELS.openai);
      expect(result.providers.openrouter.model).toBe(DEFAULT_MODELS.openrouter);
      expect(result.providers.gemini.model).toBe(DEFAULT_MODELS.gemini);
    });

    it('should handle all three providers', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: {
          providers: {
            openrouter: { apiKeyCiphertext: 'enc-1' },
            openai: { apiKeyCiphertext: 'enc-2' },
            gemini: { apiKeyCiphertext: 'enc-3' }
          }
        }
      } as any);

      vi.spyOn(tokenCipher, 'decrypt')
        .mockReturnValueOnce('key-openrouter')
        .mockReturnValueOnce('key-openai')
        .mockReturnValueOnce('key-gemini');

      const result = await service.getOrganizationSecrets(mockOrganizationId);

      expect(result.providers.openrouter.apiKey).toBe('key-openrouter');
      expect(result.providers.openai.apiKey).toBe('key-openai');
      expect(result.providers.gemini.apiKey).toBe('key-gemini');
    });
  });

  describe('resolveGenerationConfig', () => {
    it('should use default provider when none is requested', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: {
          defaultProvider: 'openai'
        }
      } as any);

      vi.spyOn(configService, 'get').mockReturnValue('test-key');

      const result = await service.resolveGenerationConfig(mockOrganizationId);

      expect(result.provider).toBe('openai');
      expect(result.apiKey).toBe('test-key');
    });

    it('should use requested provider over default', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: {
          defaultProvider: 'openai'
        }
      } as any);

      vi.spyOn(configService, 'get').mockReturnValue('gemini-key');

      const result = await service.resolveGenerationConfig(
        mockOrganizationId,
        'gemini'
      );

      expect(result.provider).toBe('gemini');
    });

    it('should throw error when API key is not available', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: null
      } as any);

      vi.spyOn(configService, 'get').mockReturnValue(undefined);

      await expect(
        service.resolveGenerationConfig(mockOrganizationId, 'openai')
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.resolveGenerationConfig(mockOrganizationId, 'openai')
      ).rejects.toThrow('OPENAI API key is not configured');
    });

    it('should use requested model when provided', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: null
      } as any);

      vi.spyOn(configService, 'get').mockReturnValue('test-key');

      const result = await service.resolveGenerationConfig(
        mockOrganizationId,
        'openai',
        'gpt-4-turbo'
      );

      expect(result.model).toBe('gpt-4-turbo');
    });

    it('should use stored model when no model is requested', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: {
          providers: {
            openai: {
              model: 'gpt-4'
            }
          }
        }
      } as any);

      vi.spyOn(configService, 'get').mockReturnValue('test-key');

      const result = await service.resolveGenerationConfig(
        mockOrganizationId,
        'openai'
      );

      expect(result.model).toBe('gpt-4');
    });

    it('should normalize OpenRouter model names', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: null
      } as any);

      vi.spyOn(configService, 'get').mockReturnValue('test-key');

      const result = await service.resolveGenerationConfig(
        mockOrganizationId,
        'openrouter',
        'openrouter/meta-llama/llama-3'
      );

      expect(result.model).toBe('meta-llama/llama-3');
    });

    it('should return hasKey as true when key exists', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: null
      } as any);

      vi.spyOn(configService, 'get').mockReturnValue('test-key');

      const result = await service.resolveGenerationConfig(
        mockOrganizationId,
        'openai'
      );

      expect(result.hasKey).toBe(true);
    });

    it('should prioritize stored key over environment variable', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: {
          providers: {
            openai: {
              apiKeyCiphertext: 'encrypted-stored-key'
            }
          }
        }
      } as any);

      vi.spyOn(tokenCipher, 'decrypt').mockReturnValue('stored-key');
      vi.spyOn(configService, 'get').mockReturnValue('env-key');

      const result = await service.resolveGenerationConfig(
        mockOrganizationId,
        'openai'
      );

      expect(result.apiKey).toBe('stored-key');
    });
  });

  describe('getPublicConfig', () => {
    it('should not expose API keys', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: {
          providers: {
            openai: {
              apiKeyCiphertext: 'encrypted-key'
            }
          }
        }
      } as any);

      vi.spyOn(tokenCipher, 'decrypt').mockReturnValue('secret-api-key');

      const result = await service.getPublicConfig(mockOrganizationId);

      expect(result.providers.openai).not.toHaveProperty('apiKey');
      expect(result.providers.openai.hasKey).toBe(true);
    });

    it('should return hasKey status correctly', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: {
          providers: {
            openai: {
              apiKeyCiphertext: 'encrypted-key'
            }
          }
        }
      } as any);

      vi.spyOn(tokenCipher, 'decrypt').mockReturnValue('api-key');
      vi.spyOn(configService, 'get').mockReturnValue(undefined);

      const result = await service.getPublicConfig(mockOrganizationId);

      expect(result.providers.openai.hasKey).toBe(true);
      expect(result.providers.openrouter.hasKey).toBe(false);
      expect(result.providers.gemini.hasKey).toBe(false);
    });

    it('should include model configuration', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: {
          providers: {
            openai: {
              model: 'gpt-4-turbo'
            }
          }
        }
      } as any);

      const result = await service.getPublicConfig(mockOrganizationId);

      expect(result.providers.openai.model).toBe('gpt-4-turbo');
    });

    it('should return default provider', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: {
          defaultProvider: 'gemini'
        }
      } as any);

      const result = await service.getPublicConfig(mockOrganizationId);

      expect(result.defaultProvider).toBe('gemini');
    });

    it('should include all three providers', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: null
      } as any);

      const result = await service.getPublicConfig(mockOrganizationId);

      expect(result.providers).toHaveProperty('openrouter');
      expect(result.providers).toHaveProperty('openai');
      expect(result.providers).toHaveProperty('gemini');
    });

    it('should indicate hasKey true when env var is present', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: null
      } as any);

      vi.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'OPENAI_API_KEY') return 'env-key';
        return undefined;
      });

      const result = await service.getPublicConfig(mockOrganizationId);

      expect(result.providers.openai.hasKey).toBe(true);
    });
  });

  describe('sanitizeStoredConfig', () => {
    it('should handle null input', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: null
      } as any);

      const result = await service.getOrganizationSecrets(mockOrganizationId);

      expect(result).toBeDefined();
      expect(result.defaultProvider).toBe('openrouter');
    });

    it('should handle undefined input', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: undefined
      } as any);

      const result = await service.getOrganizationSecrets(mockOrganizationId);

      expect(result).toBeDefined();
    });

    it('should handle array input', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: [] as any
      } as any);

      const result = await service.getOrganizationSecrets(mockOrganizationId);

      expect(result.defaultProvider).toBe('openrouter');
    });

    it('should ignore invalid provider configurations', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: {
          providers: {
            openai: 'invalid-string-value'
          }
        }
      } as any);

      const result = await service.getOrganizationSecrets(mockOrganizationId);

      expect(result.providers.openai.hasStoredKey).toBe(false);
    });

    it('should ignore unknown providers', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: {
          providers: {
            unknownProvider: {
              apiKeyCiphertext: 'some-key'
            }
          }
        }
      } as any);

      const result = await service.getOrganizationSecrets(mockOrganizationId);

      expect(result.providers).not.toHaveProperty('unknownProvider');
    });

    it('should validate apiKeyCiphertext is string', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: {
          providers: {
            openai: {
              apiKeyCiphertext: 12345
            }
          }
        }
      } as any);

      const result = await service.getOrganizationSecrets(mockOrganizationId);

      expect(result.providers.openai.hasStoredKey).toBe(false);
    });

    it('should handle null model value', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: {
          providers: {
            openai: {
              model: null
            }
          }
        }
      } as any);

      const result = await service.getOrganizationSecrets(mockOrganizationId);

      expect(result.providers.openai.model).toBe(DEFAULT_MODELS.openai);
    });
  });

  describe('Environment Variable Handling', () => {
    it('should check ConfigService before process.env for OpenRouter', async () => {
      process.env.OPENROUTER_API_KEY = 'env-key';

      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: null
      } as any);

      vi.spyOn(configService, 'get').mockReturnValue('config-key');

      const result = await service.getOrganizationSecrets(mockOrganizationId);

      expect(result.providers.openrouter.apiKey).toBe('config-key');

      delete process.env.OPENROUTER_API_KEY;
    });

    it('should check ConfigService before process.env for OpenAI', async () => {
      process.env.OPENAI_API_KEY = 'env-key';

      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: null
      } as any);

      vi.spyOn(configService, 'get').mockReturnValue('config-key');

      const result = await service.getOrganizationSecrets(mockOrganizationId);

      expect(result.providers.openai.apiKey).toBe('config-key');

      delete process.env.OPENAI_API_KEY;
    });

    it('should check ConfigService before process.env for Gemini', async () => {
      process.env.GEMINI_API_KEY = 'env-key';

      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: null
      } as any);

      vi.spyOn(configService, 'get').mockReturnValue('config-key');

      const result = await service.getOrganizationSecrets(mockOrganizationId);

      expect(result.providers.gemini.apiKey).toBe('config-key');

      delete process.env.GEMINI_API_KEY;
    });

    it('should fall back to process.env when ConfigService returns undefined', async () => {
      process.env.OPENAI_API_KEY = 'env-key';

      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: null
      } as any);

      vi.spyOn(configService, 'get').mockReturnValue(undefined);

      const result = await service.getOrganizationSecrets(mockOrganizationId);

      expect(result.providers.openai.apiKey).toBe('env-key');

      delete process.env.OPENAI_API_KEY;
    });
  });

  describe('Model Normalization', () => {
    it('should trim empty model strings', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: {
          providers: {
            openai: {
              model: '   '
            }
          }
        }
      } as any);

      const result = await service.getOrganizationSecrets(mockOrganizationId);

      expect(result.providers.openai.model).toBe(DEFAULT_MODELS.openai);
    });

    it('should remove openrouter/ prefix case-insensitively', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: null
      } as any);

      vi.spyOn(configService, 'get').mockReturnValue('test-key');

      const result = await service.resolveGenerationConfig(
        mockOrganizationId,
        'openrouter',
        'OpenRouter/some-model'
      );

      expect(result.model).toBe('some-model');
    });

    it('should not modify non-OpenRouter model names', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: null
      } as any);

      vi.spyOn(configService, 'get').mockReturnValue('test-key');

      const result = await service.resolveGenerationConfig(
        mockOrganizationId,
        'openai',
        'gpt-4-turbo-preview'
      );

      expect(result.model).toBe('gpt-4-turbo-preview');
    });

    it('should handle empty string after prefix removal', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: null
      } as any);

      vi.spyOn(configService, 'get').mockReturnValue('test-key');

      const result = await service.resolveGenerationConfig(
        mockOrganizationId,
        'openrouter',
        'openrouter/'
      );

      expect(result.model).toBe(DEFAULT_MODELS.openrouter);
    });
  });

  describe('Multiple Organization Support', () => {
    it('should handle different configurations for different orgs', async () => {
      const org1 = 'org-1';
      const org2 = 'org-2';

      vi.spyOn(prisma.organization, 'findUnique')
        .mockImplementation(async ({ where }) => {
          if (where.id === org1) {
            return {
              id: org1,
              aiConfigJson: {
                defaultProvider: 'openai',
                providers: {
                  openai: { apiKeyCiphertext: 'enc-1' }
                }
              }
            } as any;
          }
          return {
            id: org2,
            aiConfigJson: {
              defaultProvider: 'gemini',
              providers: {
                gemini: { apiKeyCiphertext: 'enc-2' }
              }
            }
          } as any;
        });

      vi.spyOn(tokenCipher, 'decrypt')
        .mockReturnValueOnce('key-1')
        .mockReturnValueOnce('key-2');

      const result1 = await service.getOrganizationSecrets(org1);
      const result2 = await service.getOrganizationSecrets(org2);

      expect(result1.defaultProvider).toBe('openai');
      expect(result2.defaultProvider).toBe('gemini');
      expect(result1.providers.openai.apiKey).toBe('key-1');
      expect(result2.providers.gemini.apiKey).toBe('key-2');
    });
  });

  describe('Cache Behavior', () => {
    it('should query database each time (no caching)', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: null
      } as any);

      await service.getOrganizationSecrets(mockOrganizationId);
      await service.getOrganizationSecrets(mockOrganizationId);

      expect(prisma.organization.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle organization not found', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue(null);

      const result = await service.getOrganizationSecrets('non-existent-org');

      expect(result.defaultProvider).toBe('openrouter');
    });

    it('should handle malformed JSON in aiConfigJson', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: { invalid: true, nested: { wrong: 'structure' } }
      } as any);

      const result = await service.getOrganizationSecrets(mockOrganizationId);

      expect(result).toBeDefined();
      expect(result.defaultProvider).toBe('openrouter');
    });

    it('should handle empty provider configuration object', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: {
          providers: {}
        }
      } as any);

      const result = await service.getOrganizationSecrets(mockOrganizationId);

      expect(result.providers.openai).toBeDefined();
      expect(result.providers.openrouter).toBeDefined();
      expect(result.providers.gemini).toBeDefined();
    });

    it('should handle provider config with no valid fields', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: mockOrganizationId,
        aiConfigJson: {
          providers: {
            openai: {
              invalidField: 'value'
            }
          }
        }
      } as any);

      const result = await service.getOrganizationSecrets(mockOrganizationId);

      expect(result.providers.openai.hasStoredKey).toBe(false);
      expect(result.providers.openai.model).toBe(DEFAULT_MODELS.openai);
    });
  });
});
