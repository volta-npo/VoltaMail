import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { LeadImportService } from './lead-import.service.js';
import { SessionGuard } from '../auth/session.guard.js';
import { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { LeadImportSummary, LeadSummary } from '@email-automation/shared';
import { memoryStorage } from 'multer';
import { PrismaService } from '../prisma.service.js';
import { ProjectAccessService } from '../projects/project-access.service.js';

@Controller('v1/projects/:projectId/leads')
export class LeadsController {
  constructor(
    private readonly leadImportService: LeadImportService,
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService
  ) {}

  @Post('import')
  @UseGuards(SessionGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024 // 5 MB
      }
    })
  )
  async importCsv(
    @Param('projectId') projectId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() request: AuthenticatedRequest
  ): Promise<LeadImportSummary> {
    if (!request.auth) {
      throw new BadRequestException('Session missing');
    }

    return this.leadImportService.importCsv(projectId, file, request.auth.user);
  }

  @Get()
  @UseGuards(SessionGuard)
  async listLeads(
    @Param('projectId') projectId: string,
    @Query('limit') limitQuery: string | undefined,
    @Query('search') search: string | undefined,
    @Req() request: AuthenticatedRequest
  ): Promise<LeadSummary[]> {
    if (!request.auth) {
      throw new BadRequestException('Session missing');
    }

    await this.projectAccess.ensureProjectAccess(projectId, request.auth.user);

    const limit = Math.min(Math.max(Number.parseInt(limitQuery ?? '', 10) || 50, 1), 200);
    const normalizedSearch = search?.trim().toLowerCase() ?? '';

    const leads = await this.prisma.lead.findMany({
      where: {
        projectId,
        status: 'IMPORTED',
        ...(normalizedSearch
          ? {
              OR: [
                { email: { contains: normalizedSearch, mode: 'insensitive' } },
                { firstName: { contains: normalizedSearch, mode: 'insensitive' } },
                { lastName: { contains: normalizedSearch, mode: 'insensitive' } },
                { company: { contains: normalizedSearch, mode: 'insensitive' } }
              ]
            }
          : {})
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit
    });

    return leads.map((lead) => ({
      id: lead.id,
      email: lead.email,
      firstName: lead.firstName,
      lastName: lead.lastName,
      company: lead.company,
      role: lead.role,
      status: lead.status,
      createdAt: lead.createdAt.toISOString(),
      updatedAt: lead.updatedAt.toISOString()
    }));
  }
}
