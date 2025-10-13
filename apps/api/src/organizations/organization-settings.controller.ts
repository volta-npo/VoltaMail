import { Body, Controller, Get, Put, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard.js';
import { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { PrismaService } from '../prisma.service.js';
import { TokenCipherService } from '../security/token-cipher.service.js';
import { AiConfigResponse, AiProvider } from '@email-automation/shared';
import { AiConfigService } from '../ai/ai-config.service.js';
import { IsIn, IsObject, IsOptional, IsString, validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';

type StoredProviderConfig = {
  apiKeyCiphertext?: string | null;
  model?: string | null;
};

type StoredAiConfig = {
  defaultProvider?: AiProvider;
  providers?: Partial<Record<AiProvider, StoredProviderConfig>>;
};

class ProviderConfigDto {
  @IsOptional()
  @IsString()
  apiKey?: string | null;

  @IsOptional()
  @IsString()
  model?: string | null;
}

class UpdateAiConfigDto {
  @IsOptional()
  @IsIn(['openrouter', 'openai', 'gemini'])
  defaultProvider?: AiProvider;

  @IsOptional()
  @IsObject()
  providers?: Record<string, ProviderConfigDto>;
}

const AI_PROVIDERS: AiProvider[] = ['openrouter', 'openai', 'gemini'];

@Controller('v1/organizations/me')
export class OrganizationSettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenCipher: TokenCipherService,
    private readonly aiConfigService: AiConfigService
  ) {}

  private parseStoredConfig(input: unknown): StoredAiConfig {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return {};
    }
    const data = input as StoredAiConfig;
    const sanitizedProviders: Partial<Record<AiProvider, StoredProviderConfig>> = {};
    if (data.providers && typeof data.providers === 'object') {
      for (const provider of AI_PROVIDERS) {
        const providerData = data.providers[provider];
        if (providerData && typeof providerData === 'object') {
          const config: StoredProviderConfig = {};
          if (typeof providerData.apiKeyCiphertext === 'string') {
            config.apiKeyCiphertext = providerData.apiKeyCiphertext;
          }
          if (
            providerData.model === null ||
            typeof providerData.model === 'string'
          ) {
            config.model = providerData.model ?? null;
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

  @Get('ai-config')
  @UseGuards(SessionGuard)
  async getAiConfig(@Req() request: AuthenticatedRequest): Promise<AiConfigResponse> {
    const organizationId = request.auth!.user.organizationId;
    return this.aiConfigService.getPublicConfig(organizationId);
  }

  @Put('ai-config')
  @UseGuards(SessionGuard)
  async updateAiConfig(
    @Body() body: UpdateAiConfigDto,
    @Req() request: AuthenticatedRequest
  ): Promise<AiConfigResponse> {
    const dto = plainToInstance(UpdateAiConfigDto, body);
    const validationErrors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
    if (validationErrors.length > 0) {
      throw new BadRequestException('Invalid AI configuration payload.');
    }

    const organizationId = request.auth!.user.organizationId;

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { aiConfigJson: true }
    });

    const storedConfig = this.parseStoredConfig(organization?.aiConfigJson ?? null);
    const updatedConfig: StoredAiConfig = {
      defaultProvider: storedConfig.defaultProvider,
      providers: { ...(storedConfig.providers ?? {}) }
    };

    if (dto.defaultProvider) {
      updatedConfig.defaultProvider = dto.defaultProvider;
    }

    if (dto.providers) {
      for (const providerKey of Object.keys(dto.providers)) {
        if (!AI_PROVIDERS.includes(providerKey as AiProvider)) {
          continue;
        }
        const provider = providerKey as AiProvider;
        const providerDto = plainToInstance(ProviderConfigDto, dto.providers[providerKey]);
        const providerValidation = validateSync(providerDto, {
          whitelist: true,
          forbidNonWhitelisted: true
        });
        if (providerValidation.length > 0) {
          throw new BadRequestException(`Invalid configuration for provider ${provider}.`);
        }

        const existing = updatedConfig.providers?.[provider] ?? {};
        const nextConfig: StoredProviderConfig = { ...existing };

        if (providerDto.apiKey !== undefined) {
          const trimmed = providerDto.apiKey?.trim() ?? '';
          if (trimmed.length === 0) {
            nextConfig.apiKeyCiphertext = null;
          } else {
            nextConfig.apiKeyCiphertext = this.tokenCipher.encrypt(trimmed);
          }
        }

        if (providerDto.model !== undefined) {
          const trimmedModel = providerDto.model?.trim() ?? '';
          nextConfig.model = trimmedModel.length > 0 ? trimmedModel : null;
        }

        if (!updatedConfig.providers) {
          updatedConfig.providers = {};
        }
        updatedConfig.providers[provider] = nextConfig;
      }
    }

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        aiConfigJson: updatedConfig
      }
    });

    return this.aiConfigService.getPublicConfig(organizationId);
  }
}
