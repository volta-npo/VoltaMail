import { BadRequestException, Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { PrismaService } from '../prisma.service.js';
import { AuthenticatedUser } from '../auth/authenticated-request.js';
import { ProjectAccessService } from '../projects/project-access.service.js';
import { LeadStatus, Prisma } from '@email-automation/database';
import { LeadImportSummary, LeadImportRowResult } from '@email-automation/shared';

interface CandidateLead {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  role?: string;
  timezone?: string;
  phone?: string;
  address?: string;
  custom: Record<string, string | null>;
}

const EMAIL_KEYS = ['email', 'email_address', 'e-mail', 'e_mail'];
const FIRST_NAME_KEYS = ['first_name', 'firstname', 'given_name'];
const LAST_NAME_KEYS = ['last_name', 'lastname', 'surname'];
const COMPANY_KEYS = ['company', 'company_name', 'business', 'business_name'];
const ROLE_KEYS = ['role', 'title', 'job_title'];
const TIMEZONE_KEYS = ['timezone', 'time_zone'];
const PHONE_KEYS = ['phone', 'phone_number', 'tel'];
const ADDRESS_KEYS = ['address', 'street', 'address_line'];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class LeadImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService
  ) {}

  async importCsv(
    projectId: string,
    file: Express.Multer.File | undefined,
    user: AuthenticatedUser
  ): Promise<LeadImportSummary> {
    if (!file || !file.buffer) {
      throw new BadRequestException('CSV file is required.');
    }

    await this.projectAccess.ensureProjectAccess(projectId, user);

    let records: Record<string, string>[];
    try {
      records = parse(file.buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });
    } catch (error) {
      throw new BadRequestException(
        `Unable to parse CSV file: ${error instanceof Error ? error.message : 'unknown error'}`
      );
    }

    if (records.length === 0) {
      throw new BadRequestException('CSV file does not contain any rows.');
    }

    const seen = new Set<string>();
    const candidates: CandidateLead[] = [];
    const candidateRowIndices: number[] = [];
    const rowResults: LeadImportRowResult[] = [];

    for (const record of records) {
      const normalized = this.normalizeRecord(record);
      const email = this.pickFirst(normalized, EMAIL_KEYS)?.toLowerCase() ?? null;

      if (!email || !EMAIL_REGEX.test(email)) {
        rowResults.push({ email, status: 'invalid', reason: 'Missing or invalid email' });
        continue;
      }

      if (seen.has(email)) {
        rowResults.push({ email, status: 'skipped', reason: 'Duplicate email in file' });
        continue;
      }

      seen.add(email);

      const candidate: CandidateLead = {
        email,
        firstName: this.pickFirst(normalized, FIRST_NAME_KEYS) ?? undefined,
        lastName: this.pickFirst(normalized, LAST_NAME_KEYS) ?? undefined,
        company: this.pickFirst(normalized, COMPANY_KEYS) ?? undefined,
        role: this.pickFirst(normalized, ROLE_KEYS) ?? undefined,
        timezone: this.pickFirst(normalized, TIMEZONE_KEYS) ?? undefined,
        phone: this.pickFirst(normalized, PHONE_KEYS) ?? undefined,
        address: this.pickFirst(normalized, ADDRESS_KEYS) ?? undefined,
        custom: {}
      };

      for (const [key, value] of Object.entries(normalized)) {
        if (
          EMAIL_KEYS.includes(key) ||
          FIRST_NAME_KEYS.includes(key) ||
          LAST_NAME_KEYS.includes(key) ||
          COMPANY_KEYS.includes(key) ||
          ROLE_KEYS.includes(key) ||
          TIMEZONE_KEYS.includes(key) ||
          PHONE_KEYS.includes(key) ||
          ADDRESS_KEYS.includes(key)
        ) {
          continue;
        }

        candidate.custom[key] = value;
      }

      candidates.push(candidate);
      rowResults.push({ email, status: 'imported' });
      candidateRowIndices.push(rowResults.length - 1);
    }

    if (candidates.length === 0) {
      const imported = rowResults.filter((row) => row.status === 'imported').length;
      return {
        inserted: 0,
        skipped: rowResults.length - imported,
        invalid: rowResults.filter((row) => row.status === 'invalid').length,
        rows: rowResults
      };
    }

    const existingLeads = await this.prisma.lead.findMany({
      where: {
        projectId,
        email: {
          in: candidates.map((candidate) => candidate.email)
        }
      },
      select: {
        email: true
      }
    });

    const existingEmails = new Set(existingLeads.map((lead) => lead.email));
    const toInsert: Array<{ candidate: CandidateLead; rowIndex: number }> = [];
    candidates.forEach((candidate, candidateIndex) => {
      if (existingEmails.has(candidate.email)) {
        const row = rowResults[candidateRowIndices[candidateIndex]];
        if (row) {
          row.status = 'skipped';
          row.reason = 'Email already exists in project';
        }
        return;
      }
      toInsert.push({ candidate, rowIndex: candidateRowIndices[candidateIndex] });
    });

    if (toInsert.length > 0) {
      await this.prisma.lead.createMany({
        data: toInsert.map(({ candidate }) => ({
          projectId,
          email: candidate.email,
          firstName: candidate.firstName ?? null,
          lastName: candidate.lastName ?? null,
          company: candidate.company ?? null,
          role: candidate.role ?? null,
          timezone: candidate.timezone ?? null,
          phone: candidate.phone ?? null,
          address: candidate.address ?? null,
          customJson:
            Object.keys(candidate.custom).length > 0
              ? (candidate.custom as unknown as Prisma.InputJsonValue)
              : undefined,
          status: LeadStatus.IMPORTED
        }))
      });

      for (const { rowIndex } of toInsert) {
        const row = rowResults[rowIndex];
        if (row) {
          row.status = 'imported';
        }
      }
    }

    const inserted = toInsert.length;
    const invalid = rowResults.filter((row) => row.status === 'invalid').length;
    const skipped = rowResults.filter((row) => row.status === 'skipped').length;

    return {
      inserted,
      skipped,
      invalid,
      rows: rowResults
    };
  }

  private normalizeRecord(record: Record<string, string>): Record<string, string | null> {
    const result: Record<string, string | null> = {};
    for (const [key, rawValue] of Object.entries(record)) {
      const normalizedKey = key.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
      result[normalizedKey] = value === '' ? null : value;
    }
    return result;
  }

  private pickFirst(record: Record<string, string | null>, keys: string[]): string | null {
    for (const key of keys) {
      if (key in record && record[key]) {
        return record[key] as string;
      }
    }
    return null;
  }
}
