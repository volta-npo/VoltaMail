import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import { TokenCipherService } from '../security/token-cipher.service.js';
import { ConfigService } from '@nestjs/config';
import { AiProvider, AiConfigResponse } from '@email-automation/shared';
import { DEFAULT_MODELS } from './ai-client.service.js';

type Provider = AiProvider;

type StoredProviderConfig = {
  apiKeyCiphertext?: string | null;
  model?: string | null;
};

type StoredAiConfig = {
  defaultProvider?: Provider;
  providers?: Partial<Record<Provider, StoredProviderConfig>>;
};

interface ProviderSecrets {
  apiKey: string | null;
  model: string;
  hasStoredKey: boolean;
}

export interface OrganizationAiSecrets {
  defaultProvider: Provider;
  providers: Record<Provider, ProviderSecrets>;
}

const PROVIDERS: Provider[] = ['openrouter', 'openai', 'gemini'];

@Injectable()
export class AiConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenCipher: TokenCipherService,
    private readonly configService: ConfigService
  ) {}

  private sanitizeStoredConfig(input: unknown): StoredAiConfig {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return {};
    }

    const data = input as StoredAiConfig;
    const sanitizedProviders: Partial<Record<Provider, StoredProviderConfig>> = {};

    if (data.providers && typeof data.providers === 'object') {
      for (const provider of PROVIDERS) {
        const raw = data.providers[provider];
        if (raw && typeof raw === 'object') {
          const config: StoredProviderConfig = {};
          if (typeof raw.apiKeyCiphertext === 'string') {
            config.apiKeyCiphertext = raw.apiKeyCiphertext;
          }
          if (raw.model === null || typeof raw.model === 'string') {
            config.model = raw.model ?? null;
          }
          if (Object.keys(config).length > 0) {
            sanitizedProviders[provider] = config;
          }
        }
      }
    }

    return {
      defaultProvider: data.defaultProvider,
      providers: sanitizedProviders
    };
  }

  private getEnvKey(provider: Provider): string | undefined {
    switch (provider) {
      case 'openrouter':
        return this.configService.get<string>('OPENROUTER_API_KEY') ?? process.env.OPENROUTER_API_KEY ?? undefined;
      case 'openai':
        return this.configService.get<string>('OPENAI_API_KEY') ?? process.env.OPENAI_API_KEY ?? undefined;
      case 'gemini':
        return this.configService.get<string>('GEMINI_API_KEY') ?? process.env.GEMINI_API_KEY ?? undefined;
      default:
        return undefined;
    }
  }

  private getDefaultProvider(stored?: Provider): Provider {
    if (stored && PROVIDERS.includes(stored)) {
      return stored;
    }
    return 'openrouter';
  }

  private getProviderSecrets(
    provider: Provider,
    stored?: StoredProviderConfig
  ): ProviderSecrets {
    let decrypted: string | null = null;
    let hasStoredKey = false;

    if (stored?.apiKeyCiphertext) {
      try {
        decrypted = this.tokenCipher.decrypt(stored.apiKeyCiphertext);
        hasStoredKey = Boolean(decrypted);
      } catch {
        decrypted = null;
        hasStoredKey = false;
      }
    }

    const envKey = this.getEnvKey(provider) ?? null;
    const apiKey = decrypted ?? envKey;

    const model = this.normalizeModel(provider, stored?.model);

    return {
      apiKey,
      model,
      hasStoredKey
    };
  }

  async getOrganizationSecrets(organizationId: string): Promise<OrganizationAiSecrets> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { aiConfigJson: true }
    });

    const stored = this.sanitizeStoredConfig(organization?.aiConfigJson ?? null);
    const defaultProvider = this.getDefaultProvider(stored.defaultProvider);

    const providers = PROVIDERS.reduce<Record<Provider, ProviderSecrets>>((acc, provider) => {
      acc[provider] = this.getProviderSecrets(provider, stored.providers?.[provider]);
      return acc;
    }, {} as Record<Provider, ProviderSecrets>);

    return {
      defaultProvider,
      providers
    };
  }

  async resolveGenerationConfig(
    organizationId: string,
    requestedProvider?: Provider,
    requestedModel?: string
  ): Promise<{ provider: Provider; model: string; apiKey: string | null; hasKey: boolean }> {
    const config = await this.getOrganizationSecrets(organizationId);
    const provider = requestedProvider ?? config.defaultProvider;
    const providerSecrets = config.providers[provider];

    if (!providerSecrets.apiKey) {
      const providerLabel = provider.toUpperCase();
      throw new BadRequestException(
        `${providerLabel} API key is not configured. Add one in AI settings or set an environment variable.`
      );
    }

    const requested = requestedModel?.trim();
    const model = this.normalizeModel(provider, requested || providerSecrets.model);

    return {
      provider,
      model,
      apiKey: providerSecrets.apiKey,
      hasKey: Boolean(providerSecrets.apiKey)
    };
  }

  async getPublicConfig(organizationId: string): Promise<AiConfigResponse> {
    const secrets = await this.getOrganizationSecrets(organizationId);

    const providers = PROVIDERS.reduce<Record<Provider, { hasKey: boolean; model: string | null }>>(
      (acc, provider) => {
        const providerSecrets = secrets.providers[provider];
        acc[provider] = {
          hasKey: providerSecrets.hasStoredKey || Boolean(providerSecrets.apiKey),
          model: providerSecrets.model ?? null
        };
        return acc;
      },
      {} as Record<Provider, { hasKey: boolean; model: string | null }>
    );

    return {
      defaultProvider: secrets.defaultProvider,
      providers
    };
  }

  private normalizeModel(provider: Provider, model?: string | null): string {
    const fallback = DEFAULT_MODELS[provider];
    if (!model || model.trim().length === 0) {
      return fallback;
    }
    const trimmed = model.trim();
    if (provider === 'openrouter') {
      return trimmed.replace(/^openrouter\//i, '') || fallback;
    }
    return trimmed;
  }
}
