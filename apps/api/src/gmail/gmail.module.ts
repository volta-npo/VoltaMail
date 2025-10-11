import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GmailController, GmailCallbackController } from './gmail.controller.js';
import { GmailService } from './gmail.service.js';
import { TokenCipherService } from '../security/token-cipher.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { ProjectAccessService } from '../projects/project-access.service.js';

@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [GmailController, GmailCallbackController],
  providers: [GmailService, TokenCipherService, ProjectAccessService],
  exports: [GmailService]
})
export class GmailModule {}
