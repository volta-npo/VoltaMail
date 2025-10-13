import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { HealthController } from './health.controller.js';
import { GmailModule } from './gmail/gmail.module.js';
import { LeadsModule } from './leads/leads.module.js';
import { TemplatesModule } from './templates/templates.module.js';
import { ProjectSettingsController } from './projects/project-settings.controller.js';
import { OrganizationSettingsController } from './organizations/organization-settings.controller.js';
import { TokenCipherService } from './security/token-cipher.service.js';
import { PrismaService } from './prisma.service.js';
import { AiConfigService } from './ai/ai-config.service.js';
import { AiClientService } from './ai/ai-client.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true
    }),
    AuthModule,
    GmailModule,
    LeadsModule,
    TemplatesModule
  ],
  controllers: [HealthController, ProjectSettingsController, OrganizationSettingsController],
  providers: [TokenCipherService, PrismaService, AiConfigService, AiClientService]
})
export class AppModule {}
