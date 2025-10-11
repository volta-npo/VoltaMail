import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LeadsController } from './leads.controller.js';
import { LeadImportService } from './lead-import.service.js';
import { ProjectAccessService } from '../projects/project-access.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [LeadsController],
  providers: [LeadImportService, ProjectAccessService]
})
export class LeadsModule {}
