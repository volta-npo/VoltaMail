import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
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
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000, // 1 second
        limit: 10 // 10 requests per second
      },
      {
        name: 'medium',
        ttl: 10000, // 10 seconds
        limit: 100 // 100 requests per 10 seconds
      },
      {
        name: 'long',
        ttl: 60000, // 1 minute
        limit: 100 // 100 requests per minute
      }
    ]),
    AuthModule,
    GmailModule,
    LeadsModule,
    TemplatesModule
  ],
  controllers: [HealthController, ProjectSettingsController, OrganizationSettingsController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard
    },
    TokenCipherService,
    PrismaService,
    AiConfigService,
    AiClientService
  ]
})
export class AppModule {}
