import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { LeadImportService } from './lead-import.service';
import { PrismaService } from '../prisma.service';
import { ProjectAccessService } from '../projects/project-access.service';
import { AuthenticatedUser } from '../auth/authenticated-request';
import { LeadStatus } from '@email-automation/database';

// Mock csv-parse/sync
vi.mock('csv-parse/sync', () => ({
  parse: vi.fn()
}));

// Mock global fetch
global.fetch = vi.fn() as any;

import { parse } from 'csv-parse/sync';

describe('LeadImportService', () => {
  let service: LeadImportService;
  let mockPrisma: any;
  let mockProjectAccess: any;
  let mockUser: AuthenticatedUser;

  beforeEach(() => {
    mockPrisma = {
      lead: {
        findMany: vi.fn(),
        createMany: vi.fn()
      }
    };

    mockProjectAccess = {
      ensureProjectAccess: vi.fn()
    };

    service = new LeadImportService(mockPrisma, mockProjectAccess);

    mockUser = {
      id: 'user-123',
      email: 'test@example.com'
    };

    // Reset all mocks
    vi.clearAllMocks();
    mockProjectAccess.ensureProjectAccess.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('importCsv', () => {
    it('should throw BadRequestException when file is undefined', async () => {
      await expect(
        service.importCsv('project-1', undefined, mockUser)
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.importCsv('project-1', undefined, mockUser)
      ).rejects.toThrow('CSV file is required.');
    });

    it('should throw BadRequestException when file buffer is missing', async () => {
      const mockFile = {
        buffer: undefined
      } as Express.Multer.File;

      await expect(
        service.importCsv('project-1', mockFile, mockUser)
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully import valid CSV with multiple leads', async () => {
      const csvData = [
        {
          email: 'john@example.com',
          first_name: 'John',
          last_name: 'Doe',
          company: 'Acme Corp',
          role: 'CEO'
        },
        {
          email: 'jane@example.com',
          first_name: 'Jane',
          last_name: 'Smith',
          company: 'Tech Inc',
          role: 'CTO'
        }
      ];

      vi.mocked(parse).mockReturnValue(csvData);
      mockPrisma.lead.findMany.mockResolvedValue([]);
      mockPrisma.lead.createMany.mockResolvedValue({ count: 2 });

      const mockFile = {
        buffer: Buffer.from('csv content')
      } as Express.Multer.File;

      const result = await service.importCsv('project-1', mockFile, mockUser);

      expect(result).toEqual({
        inserted: 2,
        skipped: 0,
        invalid: 0,
        rows: [
          { email: 'john@example.com', status: 'imported' },
          { email: 'jane@example.com', status: 'imported' }
        ]
      });

      expect(mockProjectAccess.ensureProjectAccess).toHaveBeenCalledWith('project-1', mockUser);
      expect(mockPrisma.lead.createMany).toHaveBeenCalledWith({
        data: [
          {
            projectId: 'project-1',
            email: 'john@example.com',
            firstName: 'John',
            lastName: 'Doe',
            company: 'Acme Corp',
            role: 'CEO',
            timezone: null,
            phone: null,
            address: null,
            customJson: undefined,
            status: LeadStatus.IMPORTED
          },
          {
            projectId: 'project-1',
            email: 'jane@example.com',
            firstName: 'Jane',
            lastName: 'Smith',
            company: 'Tech Inc',
            role: 'CTO',
            timezone: null,
            phone: null,
            address: null,
            customJson: undefined,
            status: LeadStatus.IMPORTED
          }
        ]
      });
    });

    it('should handle CSV with custom fields', async () => {
      const csvData = [
        {
          email: 'john@example.com',
          first_name: 'John',
          'Custom Field 1': 'Value 1',
          'LinkedIn URL': 'https://linkedin.com/in/john'
        }
      ];

      vi.mocked(parse).mockReturnValue(csvData);
      mockPrisma.lead.findMany.mockResolvedValue([]);
      mockPrisma.lead.createMany.mockResolvedValue({ count: 1 });

      const mockFile = {
        buffer: Buffer.from('csv content')
      } as Express.Multer.File;

      const result = await service.importCsv('project-1', mockFile, mockUser);

      expect(result.inserted).toBe(1);
      expect(mockPrisma.lead.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            email: 'john@example.com',
            firstName: 'John',
            customJson: {
              custom_field_1: 'Value 1',
              linkedin_url: 'https://linkedin.com/in/john'
            }
          })
        ]
      });
    });

    it('should skip leads with invalid email format', async () => {
      const csvData = [
        { email: 'valid@example.com', first_name: 'Valid' },
        { email: 'invalid-email', first_name: 'Invalid' },
        { email: 'missing@', first_name: 'Missing' },
        { email: '@nodomain.com', first_name: 'NoDomain' }
      ];

      vi.mocked(parse).mockReturnValue(csvData);
      mockPrisma.lead.findMany.mockResolvedValue([]);
      mockPrisma.lead.createMany.mockResolvedValue({ count: 1 });

      const mockFile = {
        buffer: Buffer.from('csv content')
      } as Express.Multer.File;

      const result = await service.importCsv('project-1', mockFile, mockUser);

      expect(result).toEqual({
        inserted: 1,
        skipped: 0,
        invalid: 3,
        rows: [
          { email: 'valid@example.com', status: 'imported' },
          { email: 'invalid-email', status: 'invalid', reason: 'Missing or invalid email' },
          { email: 'missing@', status: 'invalid', reason: 'Missing or invalid email' },
          { email: '@nodomain.com', status: 'invalid', reason: 'Missing or invalid email' }
        ]
      });
    });

    it('should skip leads with missing email', async () => {
      const csvData = [
        { first_name: 'No', last_name: 'Email' },
        { email: '', first_name: 'Empty' }
      ];

      vi.mocked(parse).mockReturnValue(csvData);

      const mockFile = {
        buffer: Buffer.from('csv content')
      } as Express.Multer.File;

      const result = await service.importCsv('project-1', mockFile, mockUser);

      expect(result.invalid).toBe(2);
      expect(result.inserted).toBe(0);
    });

    it('should detect and skip duplicate emails within the CSV', async () => {
      const csvData = [
        { email: 'john@example.com', first_name: 'John' },
        { email: 'jane@example.com', first_name: 'Jane' },
        { email: 'john@example.com', first_name: 'John Duplicate' }
      ];

      vi.mocked(parse).mockReturnValue(csvData);
      mockPrisma.lead.findMany.mockResolvedValue([]);
      mockPrisma.lead.createMany.mockResolvedValue({ count: 2 });

      const mockFile = {
        buffer: Buffer.from('csv content')
      } as Express.Multer.File;

      const result = await service.importCsv('project-1', mockFile, mockUser);

      expect(result).toEqual({
        inserted: 2,
        skipped: 1,
        invalid: 0,
        rows: [
          { email: 'john@example.com', status: 'imported' },
          { email: 'jane@example.com', status: 'imported' },
          { email: 'john@example.com', status: 'skipped', reason: 'Duplicate email in file' }
        ]
      });
    });

    it('should skip leads that already exist in the database', async () => {
      const csvData = [
        { email: 'john@example.com', first_name: 'John' },
        { email: 'jane@example.com', first_name: 'Jane' },
        { email: 'new@example.com', first_name: 'New' }
      ];

      vi.mocked(parse).mockReturnValue(csvData);
      mockPrisma.lead.findMany.mockResolvedValue([
        { email: 'john@example.com' },
        { email: 'jane@example.com' }
      ]);
      mockPrisma.lead.createMany.mockResolvedValue({ count: 1 });

      const mockFile = {
        buffer: Buffer.from('csv content')
      } as Express.Multer.File;

      const result = await service.importCsv('project-1', mockFile, mockUser);

      expect(result).toEqual({
        inserted: 1,
        skipped: 2,
        invalid: 0,
        rows: [
          { email: 'john@example.com', status: 'skipped', reason: 'Email already exists in project' },
          { email: 'jane@example.com', status: 'skipped', reason: 'Email already exists in project' },
          { email: 'new@example.com', status: 'imported' }
        ]
      });

      expect(mockPrisma.lead.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            email: 'new@example.com'
          })
        ]
      });
    });

    it('should throw BadRequestException for invalid CSV format', async () => {
      vi.mocked(parse).mockImplementation(() => {
        throw new Error('Invalid CSV format');
      });

      const mockFile = {
        buffer: Buffer.from('invalid csv')
      } as Express.Multer.File;

      await expect(
        service.importCsv('project-1', mockFile, mockUser)
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.importCsv('project-1', mockFile, mockUser)
      ).rejects.toThrow('Unable to parse CSV data: Invalid CSV format');
    });

    it('should throw BadRequestException for empty CSV', async () => {
      vi.mocked(parse).mockReturnValue([]);

      const mockFile = {
        buffer: Buffer.from('email\n')
      } as Express.Multer.File;

      await expect(
        service.importCsv('project-1', mockFile, mockUser)
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.importCsv('project-1', mockFile, mockUser)
      ).rejects.toThrow('The provided data does not contain any rows.');
    });

    it('should handle CSV with alternative column names', async () => {
      const csvData = [
        {
          'E-mail': 'john@example.com',
          'Given Name': 'John',
          'Surname': 'Doe',
          'Business Name': 'Acme',
          'Job Title': 'Manager',
          'Time Zone': 'America/New_York',
          'Phone Number': '123-456-7890',
          'Address Line': '123 Main St'
        }
      ];

      vi.mocked(parse).mockReturnValue(csvData);
      mockPrisma.lead.findMany.mockResolvedValue([]);
      mockPrisma.lead.createMany.mockResolvedValue({ count: 1 });

      const mockFile = {
        buffer: Buffer.from('csv content')
      } as Express.Multer.File;

      const result = await service.importCsv('project-1', mockFile, mockUser);

      expect(result.inserted).toBe(1);
      expect(mockPrisma.lead.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            email: 'john@example.com',
            firstName: 'John',
            lastName: 'Doe',
            company: 'Acme',
            role: 'Manager',
            timezone: 'America/New_York',
            phone: '123-456-7890',
            address: '123 Main St'
          })
        ]
      });
    });

    it('should handle large batch imports efficiently', async () => {
      const csvData = Array.from({ length: 1000 }, (_, i) => ({
        email: `user${i}@example.com`,
        first_name: `User${i}`,
        last_name: 'Test',
        company: 'Test Corp'
      }));

      vi.mocked(parse).mockReturnValue(csvData);
      mockPrisma.lead.findMany.mockResolvedValue([]);
      mockPrisma.lead.createMany.mockResolvedValue({ count: 1000 });

      const mockFile = {
        buffer: Buffer.from('csv content')
      } as Express.Multer.File;

      const result = await service.importCsv('project-1', mockFile, mockUser);

      expect(result.inserted).toBe(1000);
      expect(result.skipped).toBe(0);
      expect(result.invalid).toBe(0);
      expect(mockPrisma.lead.createMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.lead.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            email: 'user0@example.com'
          })
        ])
      });
    });

    it('should normalize email addresses to lowercase', async () => {
      const csvData = [
        { email: 'JOHN@EXAMPLE.COM', first_name: 'John' },
        { email: 'Jane@Example.Com', first_name: 'Jane' }
      ];

      vi.mocked(parse).mockReturnValue(csvData);
      mockPrisma.lead.findMany.mockResolvedValue([]);
      mockPrisma.lead.createMany.mockResolvedValue({ count: 2 });

      const mockFile = {
        buffer: Buffer.from('csv content')
      } as Express.Multer.File;

      await service.importCsv('project-1', mockFile, mockUser);

      expect(mockPrisma.lead.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ email: 'john@example.com' }),
          expect.objectContaining({ email: 'jane@example.com' })
        ]
      });
    });

    it('should handle empty/null values gracefully', async () => {
      const csvData = [
        {
          email: 'john@example.com',
          first_name: '',
          last_name: '   ',
          company: null,
          role: 'Developer'
        }
      ];

      vi.mocked(parse).mockReturnValue(csvData);
      mockPrisma.lead.findMany.mockResolvedValue([]);
      mockPrisma.lead.createMany.mockResolvedValue({ count: 1 });

      const mockFile = {
        buffer: Buffer.from('csv content')
      } as Express.Multer.File;

      const result = await service.importCsv('project-1', mockFile, mockUser);

      expect(result.inserted).toBe(1);
      expect(mockPrisma.lead.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            email: 'john@example.com',
            firstName: null,
            lastName: null,
            company: null,
            role: 'Developer'
          })
        ]
      });
    });

    it('should ensure project access before importing', async () => {
      mockProjectAccess.ensureProjectAccess.mockRejectedValue(
        new BadRequestException('Access denied')
      );

      const mockFile = {
        buffer: Buffer.from('csv content')
      } as Express.Multer.File;

      await expect(
        service.importCsv('project-1', mockFile, mockUser)
      ).rejects.toThrow('Access denied');

      expect(mockProjectAccess.ensureProjectAccess).toHaveBeenCalledWith('project-1', mockUser);
    });

    it('should return correct summary when all leads are invalid', async () => {
      const csvData = [
        { email: 'invalid1', first_name: 'Test1' },
        { email: 'invalid2', first_name: 'Test2' }
      ];

      vi.mocked(parse).mockReturnValue(csvData);

      const mockFile = {
        buffer: Buffer.from('csv content')
      } as Express.Multer.File;

      const result = await service.importCsv('project-1', mockFile, mockUser);

      // When all leads are invalid, the summary should show all as invalid
      // The implementation returns inserted: 0, but the skipped count will be
      // based on the logic in the service
      expect(result.inserted).toBe(0);
      expect(result.invalid).toBe(2);
      expect(result.rows).toEqual([
        { email: 'invalid1', status: 'invalid', reason: 'Missing or invalid email' },
        { email: 'invalid2', status: 'invalid', reason: 'Missing or invalid email' }
      ]);

      expect(mockPrisma.lead.createMany).not.toHaveBeenCalled();
    });
  });

  describe('importGoogleSheet', () => {
    const validSheetUrl = 'https://docs.google.com/spreadsheets/d/abc123/edit#gid=0';

    beforeEach(() => {
      vi.mocked(global.fetch).mockClear();
    });

    it('should successfully import from Google Sheets', async () => {
      const csvContent = 'email,first_name,last_name\njohn@example.com,John,Doe';
      const mockResponse = {
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(Buffer.from(csvContent).buffer)
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);
      vi.mocked(parse).mockReturnValue([
        { email: 'john@example.com', first_name: 'John', last_name: 'Doe' }
      ]);
      mockPrisma.lead.findMany.mockResolvedValue([]);
      mockPrisma.lead.createMany.mockResolvedValue({ count: 1 });

      const result = await service.importGoogleSheet('project-1', validSheetUrl, mockUser);

      expect(result.inserted).toBe(1);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://docs.google.com/spreadsheets/d/abc123/export?format=csv')
      );
      expect(mockProjectAccess.ensureProjectAccess).toHaveBeenCalledWith('project-1', mockUser);
    });

    it('should handle Google Sheets URL with gid parameter', async () => {
      const sheetUrl = 'https://docs.google.com/spreadsheets/d/abc123/edit?gid=456';
      const csvContent = 'email\ntest@example.com';
      const mockResponse = {
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(Buffer.from(csvContent).buffer)
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);
      vi.mocked(parse).mockReturnValue([{ email: 'test@example.com' }]);
      mockPrisma.lead.findMany.mockResolvedValue([]);
      mockPrisma.lead.createMany.mockResolvedValue({ count: 1 });

      await service.importGoogleSheet('project-1', sheetUrl, mockUser);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('gid=456')
      );
    });

    it('should handle Google Sheets export URL directly', async () => {
      const exportUrl = 'https://docs.google.com/spreadsheets/d/abc123/export?format=csv&gid=0';
      const csvContent = 'email\ntest@example.com';
      const mockResponse = {
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(Buffer.from(csvContent).buffer)
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);
      vi.mocked(parse).mockReturnValue([{ email: 'test@example.com' }]);
      mockPrisma.lead.findMany.mockResolvedValue([]);
      mockPrisma.lead.createMany.mockResolvedValue({ count: 1 });

      await service.importGoogleSheet('project-1', exportUrl, mockUser);

      expect(global.fetch).toHaveBeenCalledWith(exportUrl);
    });

    it('should throw BadRequestException for invalid Google Sheets URL format', async () => {
      const invalidUrl = 'not-a-url';

      await expect(
        service.importGoogleSheet('project-1', invalidUrl, mockUser)
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.importGoogleSheet('project-1', invalidUrl, mockUser)
      ).rejects.toThrow('Invalid Google Sheet URL.');
    });

    it('should throw BadRequestException for non-Google Sheets domain', async () => {
      const invalidUrl = 'https://example.com/spreadsheet';

      await expect(
        service.importGoogleSheet('project-1', invalidUrl, mockUser)
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.importGoogleSheet('project-1', invalidUrl, mockUser)
      ).rejects.toThrow('Google Sheets URL must come from docs.google.com.');
    });

    it('should throw BadRequestException when unable to determine sheet ID', async () => {
      const invalidUrl = 'https://docs.google.com/spreadsheets/invalid-path';

      await expect(
        service.importGoogleSheet('project-1', invalidUrl, mockUser)
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.importGoogleSheet('project-1', invalidUrl, mockUser)
      ).rejects.toThrow('Unable to determine Google Sheet ID from the provided URL.');
    });

    it('should throw BadRequestException when Google Sheets is not accessible', async () => {
      const mockResponse = {
        ok: false,
        status: 403
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      await expect(
        service.importGoogleSheet('project-1', validSheetUrl, mockUser)
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.importGoogleSheet('project-1', validSheetUrl, mockUser)
      ).rejects.toThrow('Unable to access Google Sheet. Ensure the link is shared publicly.');
    });

    it('should throw BadRequestException when fetch fails', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

      await expect(
        service.importGoogleSheet('project-1', validSheetUrl, mockUser)
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.importGoogleSheet('project-1', validSheetUrl, mockUser)
      ).rejects.toThrow('Failed to download Google Sheet.');
    });

    it('should handle Google Sheets URL with hash gid', async () => {
      const sheetUrl = 'https://docs.google.com/spreadsheets/d/abc123/edit#gid=789';
      const csvContent = 'email\ntest@example.com';
      const mockResponse = {
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(Buffer.from(csvContent).buffer)
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);
      vi.mocked(parse).mockReturnValue([{ email: 'test@example.com' }]);
      mockPrisma.lead.findMany.mockResolvedValue([]);
      mockPrisma.lead.createMany.mockResolvedValue({ count: 1 });

      await service.importGoogleSheet('project-1', sheetUrl, mockUser);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('gid=789')
      );
    });

    it('should ensure project access before importing from Google Sheets', async () => {
      mockProjectAccess.ensureProjectAccess.mockRejectedValue(
        new BadRequestException('Access denied')
      );

      await expect(
        service.importGoogleSheet('project-1', validSheetUrl, mockUser)
      ).rejects.toThrow('Access denied');

      expect(mockProjectAccess.ensureProjectAccess).toHaveBeenCalledWith('project-1', mockUser);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle database errors during lead lookup', async () => {
      const csvData = [
        { email: 'john@example.com', first_name: 'John' }
      ];

      vi.mocked(parse).mockReturnValue(csvData);
      mockPrisma.lead.findMany.mockRejectedValue(new Error('Database connection error'));

      const mockFile = {
        buffer: Buffer.from('csv content')
      } as Express.Multer.File;

      await expect(
        service.importCsv('project-1', mockFile, mockUser)
      ).rejects.toThrow('Database connection error');
    });

    it('should handle database errors during lead creation', async () => {
      const csvData = [
        { email: 'john@example.com', first_name: 'John' }
      ];

      vi.mocked(parse).mockReturnValue(csvData);
      mockPrisma.lead.findMany.mockResolvedValue([]);
      mockPrisma.lead.createMany.mockRejectedValue(new Error('Insert failed'));

      const mockFile = {
        buffer: Buffer.from('csv content')
      } as Express.Multer.File;

      await expect(
        service.importCsv('project-1', mockFile, mockUser)
      ).rejects.toThrow('Insert failed');
    });

    it('should handle CSV with only whitespace in required fields', async () => {
      const csvData = [
        { email: '   ', first_name: 'Test' },
        { email: '\t\t', first_name: 'Test2' }
      ];

      vi.mocked(parse).mockReturnValue(csvData);

      const mockFile = {
        buffer: Buffer.from('csv content')
      } as Express.Multer.File;

      const result = await service.importCsv('project-1', mockFile, mockUser);

      expect(result.invalid).toBe(2);
      expect(result.inserted).toBe(0);
    });

    it('should handle special characters in column names', async () => {
      const csvData = [
        {
          'email_address': 'test@example.com',
          'first_name_given': 'John',
          'last_name_surname': 'Doe',
          'company_business': 'Acme Corp'
        }
      ];

      vi.mocked(parse).mockReturnValue(csvData);
      mockPrisma.lead.findMany.mockResolvedValue([]);
      mockPrisma.lead.createMany.mockResolvedValue({ count: 1 });

      const mockFile = {
        buffer: Buffer.from('csv content')
      } as Express.Multer.File;

      const result = await service.importCsv('project-1', mockFile, mockUser);

      expect(result.inserted).toBe(1);
      expect(mockPrisma.lead.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            email: 'test@example.com'
          })
        ]
      });
    });

    it('should handle mixed valid and invalid leads correctly', async () => {
      const csvData = [
        { email: 'valid1@example.com', first_name: 'Valid1' },
        { email: 'invalid', first_name: 'Invalid' },
        { email: 'valid2@example.com', first_name: 'Valid2' },
        { email: '', first_name: 'Empty' },
        { email: 'valid3@example.com', first_name: 'Valid3' }
      ];

      vi.mocked(parse).mockReturnValue(csvData);
      mockPrisma.lead.findMany.mockResolvedValue([]);
      mockPrisma.lead.createMany.mockResolvedValue({ count: 3 });

      const mockFile = {
        buffer: Buffer.from('csv content')
      } as Express.Multer.File;

      const result = await service.importCsv('project-1', mockFile, mockUser);

      expect(result).toEqual({
        inserted: 3,
        skipped: 0,
        invalid: 2,
        rows: [
          { email: 'valid1@example.com', status: 'imported' },
          { email: 'invalid', status: 'invalid', reason: 'Missing or invalid email' },
          { email: 'valid2@example.com', status: 'imported' },
          { email: null, status: 'invalid', reason: 'Missing or invalid email' },
          { email: 'valid3@example.com', status: 'imported' }
        ]
      });
    });

    it('should handle CSV with no custom fields', async () => {
      const csvData = [
        {
          email: 'john@example.com',
          first_name: 'John',
          last_name: 'Doe'
        }
      ];

      vi.mocked(parse).mockReturnValue(csvData);
      mockPrisma.lead.findMany.mockResolvedValue([]);
      mockPrisma.lead.createMany.mockResolvedValue({ count: 1 });

      const mockFile = {
        buffer: Buffer.from('csv content')
      } as Express.Multer.File;

      await service.importCsv('project-1', mockFile, mockUser);

      expect(mockPrisma.lead.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            email: 'john@example.com',
            firstName: 'John',
            lastName: 'Doe',
            customJson: undefined
          })
        ]
      });
    });

    it('should preserve custom field order and handle empty custom values', async () => {
      const csvData = [
        {
          email: 'john@example.com',
          'Custom 1': 'Value 1',
          'Custom 2': '',
          'Custom 3': 'Value 3'
        }
      ];

      vi.mocked(parse).mockReturnValue(csvData);
      mockPrisma.lead.findMany.mockResolvedValue([]);
      mockPrisma.lead.createMany.mockResolvedValue({ count: 1 });

      const mockFile = {
        buffer: Buffer.from('csv content')
      } as Express.Multer.File;

      await service.importCsv('project-1', mockFile, mockUser);

      expect(mockPrisma.lead.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            customJson: {
              custom_1: 'Value 1',
              custom_2: null,
              custom_3: 'Value 3'
            }
          })
        ]
      });
    });
  });

  describe('Performance and Stress Tests', () => {
    it('should handle very large batch with mixed results', async () => {
      const csvData = Array.from({ length: 5000 }, (_, i) => {
        if (i % 10 === 0) return { email: 'invalid', first_name: `User${i}` };
        if (i % 7 === 0) return { email: `duplicate@example.com`, first_name: `User${i}` };
        return { email: `user${i}@example.com`, first_name: `User${i}` };
      });

      vi.mocked(parse).mockReturnValue(csvData);
      mockPrisma.lead.findMany.mockResolvedValue([]);
      mockPrisma.lead.createMany.mockResolvedValue({ count: 3858 });

      const mockFile = {
        buffer: Buffer.from('csv content')
      } as Express.Multer.File;

      const result = await service.importCsv('project-1', mockFile, mockUser);

      // With the deduplication logic, we expect fewer than 5000
      expect(result.inserted).toBeGreaterThan(3500);
      expect(result.invalid).toBeGreaterThan(400);
      expect(result.skipped).toBeGreaterThan(0);
    });
  });
});
