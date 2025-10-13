import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TemplatesController } from './templates.controller.js';
import { TemplatesService } from './templates.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { ProjectAccessService } from '../projects/project-access.service.js';
import { GmailModule } from '../gmail/gmail.module.js';
import { TokenCipherService } from '../security/token-cipher.service.js';
import { PrismaService } from '../prisma.service.js';
import { AiConfigService } from '../ai/ai-config.service.js';
import { AiClientService } from '../ai/ai-client.service.js';

@Module({
  imports: [ConfigModule, AuthModule, GmailModule],
  controllers: [TemplatesController],
  providers: [
    TemplatesService,
    ProjectAccessService,
    TokenCipherService,
    PrismaService,
    AiConfigService,
    AiClientService
  ]
})
export class TemplatesModule {}
