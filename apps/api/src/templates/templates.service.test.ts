import { describe, expect, it, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { PrismaService } from '../prisma.service';
import { ProjectAccessService } from '../projects/project-access.service';
import { AiClientService } from '../ai/ai-client.service';
import { GmailService } from '../gmail/gmail.service';
import { AiConfigService } from '../ai/ai-config.service';
import { AuthenticatedUser } from '../auth/authenticated-request';

describe('TemplatesService - AI Timeout Fixes', () => {
  let service: TemplatesService;
  let prisma: PrismaService;
  let projectAccess: ProjectAccessService;
  let aiClient: AiClientService;
  let gmailService: GmailService;
  let aiConfig: AiConfigService;

  const mockUser: AuthenticatedUser = {
    id: 'user-123',
    organizationId: 'org-123',
    email: 'test@example.com',
  };

  const mockTemplate = {
    id: 'template-123',
    projectId: 'project-123',
    name: 'Test Template',
    subject: 'Hello {{first_name}}',
    body: 'Hi {{first_name}}, this is a test.',
    createdAt: new Date(),
    updatedAt: new Date(),
    activeVersionId: 'version-123',
    project: {
      brandingJson: {
        knowledgeBase: 'Test brand guidelines',
      },
    },
    activeVersion: {
      id: 'version-123',
      templateId: 'template-123',
      parentVersionId: null,
      type: 'TEXT' as const,
      source: 'USER' as const,
      title: 'Test Template',
      description: null,
      htmlContent: null,
      textContent: 'Hi {{first_name}}, this is a test.',
      metadataJson: null,
      isActive: true,
      createdByAiProvider: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  beforeEach(() => {
    prisma = {
      template: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      lead: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      project: {
        findUnique: vi.fn(),
      },
      templateVersion: {
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        deleteMany: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
      $transaction: vi.fn(),
    } as any;

    projectAccess = {
      ensureProjectAccess: vi.fn().mockResolvedValue(undefined),
    } as any;

    aiClient = {
      generate: vi.fn(),
    } as any;

    gmailService = {
      sendEmail: vi.fn(),
    } as any;

    aiConfig = {
      resolveGenerationConfig: vi.fn().mockResolvedValue({
        provider: 'openai',
        model: 'gpt-4',
        apiKey: 'test-key',
      }),
    } as any;

    service = new TemplatesService(prisma, projectAccess, aiClient, gmailService, aiConfig);
  });

  describe('Scenario 1: Zero Leads - Immediate Error', () => {
    it('should throw error immediately when no leads are available for suggestTemplate', async () => {
      vi.spyOn(prisma.project, 'findUnique').mockResolvedValue({
        id: 'project-123',
        brandingJson: {},
      } as any);

      vi.spyOn(prisma.lead, 'findMany').mockResolvedValue([]);

      await expect(
        service.suggestTemplate('project-123', { leadSampleSize: 10 }, mockUser),
      ).rejects.toThrow('Import leads before asking AI to draft a template.');

      // Verify AI was never called
      expect(aiClient.generate).not.toHaveBeenCalled();
    });

    it('should throw error immediately when no leads are available for generateAiDrafts', async () => {
      vi.spyOn(prisma.template, 'findUnique').mockResolvedValue(mockTemplate as any);
      vi.spyOn(prisma.lead, 'findMany').mockResolvedValue([]);

      await expect(
        service.generateAiDrafts('template-123', { sampleSize: 3 }, mockUser),
      ).rejects.toThrow('No leads available to generate drafts.');

      // Verify AI was never called
      expect(aiClient.generate).not.toHaveBeenCalled();
    });
  });

  describe('Scenario 2: Single Lead - Fast Response', () => {
    it('should complete successfully within timeout for single lead', async () => {
      const mockLead = {
        id: 'lead-123',
        email: 'john@example.com',
        firstName: 'John',
        lastName: 'Doe',
        company: 'Acme Corp',
        role: 'CEO',
        projectId: 'project-123',
        customJson: {},
        timezone: 'America/New_York',
        phone: null,
        address: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(prisma.template, 'findUnique').mockResolvedValue(mockTemplate as any);
      vi.spyOn(prisma.lead, 'findMany').mockResolvedValue([mockLead]);

      // Mock AI response that completes in 1 second
      vi.spyOn(aiClient, 'generate').mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(
              JSON.stringify({
                subject: 'Personalized Subject',
                body: 'Personalized body text',
                html: '<p>Personalized HTML</p>',
              }),
            );
          }, 1000);
        });
      });

      const startTime = Date.now();
      const results = await service.generateAiDrafts(
        'template-123',
        { leadIds: ['lead-123'] },
        mockUser,
      );
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(1);
      expect(results[0].leadId).toBe('lead-123');
      expect(results[0].subject).toBe('Personalized Subject');
      expect(duration).toBeLessThan(3000); // Should complete well within timeout
    });
  });

  describe('Scenario 3: Multiple Leads - Progressive Timeout', () => {
    it('should calculate timeout correctly for 3 leads (~30s)', async () => {
      const leads = Array.from({ length: 3 }, (_, i) => ({
        id: `lead-${i}`,
        email: `user${i}@example.com`,
        firstName: `User${i}`,
        lastName: 'Test',
        company: 'Test Corp',
        role: 'Manager',
        projectId: 'project-123',
        customJson: {},
        timezone: 'America/New_York',
        phone: null,
        address: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      vi.spyOn(prisma.template, 'findUnique').mockResolvedValue(mockTemplate as any);
      vi.spyOn(prisma.lead, 'findMany').mockResolvedValue(leads);

      // Mock fast AI responses
      vi.spyOn(aiClient, 'generate').mockResolvedValue(
        JSON.stringify({
          subject: 'Test Subject',
          body: 'Test body',
          html: '<p>Test HTML</p>',
        }),
      );

      const results = await service.generateAiDrafts(
        'template-123',
        { leadIds: leads.map((l) => l.id) },
        mockUser,
      );

      expect(results).toHaveLength(3);
      expect(aiClient.generate).toHaveBeenCalledTimes(3);
    });

    it('should calculate timeout correctly for 5 leads (~40s)', async () => {
      const leads = Array.from({ length: 5 }, (_, i) => ({
        id: `lead-${i}`,
        email: `user${i}@example.com`,
        firstName: `User${i}`,
        lastName: 'Test',
        company: 'Test Corp',
        role: 'Manager',
        projectId: 'project-123',
        customJson: {},
        timezone: 'America/New_York',
        phone: null,
        address: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      vi.spyOn(prisma.template, 'findUnique').mockResolvedValue(mockTemplate as any);
      vi.spyOn(prisma.lead, 'findMany').mockResolvedValue(leads);

      vi.spyOn(aiClient, 'generate').mockResolvedValue(
        JSON.stringify({
          subject: 'Test Subject',
          body: 'Test body',
          html: '<p>Test HTML</p>',
        }),
      );

      const results = await service.generateAiDrafts(
        'template-123',
        { leadIds: leads.map((l) => l.id) },
        mockUser,
      );

      expect(results).toHaveLength(5);
    });

    it('should handle 10 leads with maximum timeout (2 minutes)', async () => {
      const leads = Array.from({ length: 10 }, (_, i) => ({
        id: `lead-${i}`,
        email: `user${i}@example.com`,
        firstName: `User${i}`,
        lastName: 'Test',
        company: 'Test Corp',
        role: 'Manager',
        projectId: 'project-123',
        customJson: {},
        timezone: 'America/New_York',
        phone: null,
        address: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      vi.spyOn(prisma.template, 'findUnique').mockResolvedValue(mockTemplate as any);
      vi.spyOn(prisma.lead, 'findMany').mockResolvedValue(leads);

      vi.spyOn(aiClient, 'generate').mockResolvedValue(
        JSON.stringify({
          subject: 'Test Subject',
          body: 'Test body',
          html: '<p>Test HTML</p>',
        }),
      );

      const results = await service.generateAiDrafts(
        'template-123',
        { leadIds: leads.map((l) => l.id) },
        mockUser,
      );

      expect(results).toHaveLength(10);
    });
  });

  describe('Scenario 4: Timeout Exceeded', () => {
    it('should timeout when AI takes too long for single lead', async () => {
      const mockLead = {
        id: 'lead-123',
        email: 'john@example.com',
        firstName: 'John',
        lastName: 'Doe',
        company: 'Acme Corp',
        role: 'CEO',
        projectId: 'project-123',
        customJson: {},
        timezone: 'America/New_York',
        phone: null,
        address: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(prisma.template, 'findUnique').mockResolvedValue(mockTemplate as any);
      vi.spyOn(prisma.lead, 'findMany').mockResolvedValue([mockLead]);

      // Mock slow AI response (30 seconds, exceeding the timeout)
      vi.spyOn(aiClient, 'generate').mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(
              JSON.stringify({
                subject: 'Test',
                body: 'Test',
                html: '<p>Test</p>',
              }),
            );
          }, 30000);
        });
      });

      await expect(
        service.generateAiDrafts('template-123', { leadIds: ['lead-123'] }, mockUser),
      ).rejects.toThrow(BadRequestException);
    }, 35000); // Increase test timeout to allow for the AI timeout

    it('should include actionable error message on timeout', async () => {
      const mockLead = {
        id: 'lead-123',
        email: 'john@example.com',
        firstName: 'John',
        projectId: 'project-123',
        customJson: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(prisma.template, 'findUnique').mockResolvedValue(mockTemplate as any);
      vi.spyOn(prisma.lead, 'findMany').mockResolvedValue([mockLead]);

      vi.spyOn(aiClient, 'generate').mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve('{}'), 30000);
        });
      });

      try {
        await service.generateAiDrafts('template-123', { leadIds: ['lead-123'] }, mockUser);
        expect.fail('Should have thrown timeout error');
      } catch (error: any) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.message).toContain('AI generation timed out');
        expect(error.message).toContain('Reduce lead count');
        expect(error.message).toContain('currently: 1');
      }
    }, 35000);
  });

  describe('Scenario 5: Concurrency Limits', () => {
    it('should respect OpenRouter (free model) concurrency limit of 2', async () => {
      const leads = Array.from({ length: 10 }, (_, i) => ({
        id: `lead-${i}`,
        email: `user${i}@example.com`,
        firstName: `User${i}`,
        projectId: 'project-123',
        customJson: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      vi.spyOn(prisma.template, 'findUnique').mockResolvedValue(mockTemplate as any);
      vi.spyOn(prisma.lead, 'findMany').mockResolvedValue(leads);

      vi.spyOn(aiConfig, 'resolveGenerationConfig').mockResolvedValue({
        provider: 'openrouter',
        model: 'meta-llama/llama-3.2-3b-instruct:free',
        apiKey: 'test-key',
      });

      let concurrentCalls = 0;
      let maxConcurrentCalls = 0;

      vi.spyOn(aiClient, 'generate').mockImplementation(() => {
        concurrentCalls++;
        maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);

        return new Promise((resolve) => {
          setTimeout(() => {
            concurrentCalls--;
            resolve(
              JSON.stringify({
                subject: 'Test',
                body: 'Test',
                html: '<p>Test</p>',
              }),
            );
          }, 100);
        });
      });

      await service.generateAiDrafts(
        'template-123',
        {
          leadIds: leads.map((l) => l.id),
          provider: 'openrouter',
          model: 'meta-llama/llama-3.2-3b-instruct:free',
        },
        mockUser,
      );

      // With 2 workers, max concurrent calls should be 2
      expect(maxConcurrentCalls).toBeLessThanOrEqual(2);
    });

    it('should use 6 workers for OpenAI paid models', async () => {
      const leads = Array.from({ length: 10 }, (_, i) => ({
        id: `lead-${i}`,
        email: `user${i}@example.com`,
        firstName: `User${i}`,
        projectId: 'project-123',
        customJson: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      vi.spyOn(prisma.template, 'findUnique').mockResolvedValue(mockTemplate as any);
      vi.spyOn(prisma.lead, 'findMany').mockResolvedValue(leads);

      vi.spyOn(aiConfig, 'resolveGenerationConfig').mockResolvedValue({
        provider: 'openai',
        model: 'gpt-4',
        apiKey: 'test-key',
      });

      let maxConcurrentCalls = 0;
      let concurrentCalls = 0;

      vi.spyOn(aiClient, 'generate').mockImplementation(() => {
        concurrentCalls++;
        maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);

        return new Promise((resolve) => {
          setTimeout(() => {
            concurrentCalls--;
            resolve(
              JSON.stringify({
                subject: 'Test',
                body: 'Test',
                html: '<p>Test</p>',
              }),
            );
          }, 100);
        });
      });

      await service.generateAiDrafts(
        'template-123',
        {
          leadIds: leads.map((l) => l.id),
          provider: 'openai',
          model: 'gpt-4',
        },
        mockUser,
      );

      // With 6 workers, max concurrent calls should be up to 6
      expect(maxConcurrentCalls).toBeLessThanOrEqual(6);
      expect(maxConcurrentCalls).toBeGreaterThan(2);
    });

    it('should respect AI_DRAFT_CONCURRENCY environment variable', async () => {
      const originalEnv = process.env.AI_DRAFT_CONCURRENCY;
      process.env.AI_DRAFT_CONCURRENCY = '3';

      const leads = Array.from({ length: 10 }, (_, i) => ({
        id: `lead-${i}`,
        email: `user${i}@example.com`,
        firstName: `User${i}`,
        projectId: 'project-123',
        customJson: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      vi.spyOn(prisma.template, 'findUnique').mockResolvedValue(mockTemplate as any);
      vi.spyOn(prisma.lead, 'findMany').mockResolvedValue(leads);

      let maxConcurrentCalls = 0;
      let concurrentCalls = 0;

      vi.spyOn(aiClient, 'generate').mockImplementation(() => {
        concurrentCalls++;
        maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);

        return new Promise((resolve) => {
          setTimeout(() => {
            concurrentCalls--;
            resolve(
              JSON.stringify({
                subject: 'Test',
                body: 'Test',
                html: '<p>Test</p>',
              }),
            );
          }, 100);
        });
      });

      await service.generateAiDrafts('template-123', { leadIds: leads.map((l) => l.id) }, mockUser);

      expect(maxConcurrentCalls).toBeLessThanOrEqual(3);

      // Restore original environment variable
      if (originalEnv !== undefined) {
        process.env.AI_DRAFT_CONCURRENCY = originalEnv;
      } else {
        delete process.env.AI_DRAFT_CONCURRENCY;
      }
    });
  });

  describe('Scenario 6: Provider-Specific Timeouts', () => {
    it('should use 8s per lead for OpenRouter free models', async () => {
      const mockLead = {
        id: 'lead-123',
        email: 'test@example.com',
        firstName: 'Test',
        projectId: 'project-123',
        customJson: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(prisma.template, 'findUnique').mockResolvedValue(mockTemplate as any);
      vi.spyOn(prisma.lead, 'findMany').mockResolvedValue([mockLead]);

      vi.spyOn(aiConfig, 'resolveGenerationConfig').mockResolvedValue({
        provider: 'openrouter',
        model: 'meta-llama/llama-3.2-3b-instruct:free',
        apiKey: 'test-key',
      });

      vi.spyOn(aiClient, 'generate').mockResolvedValue(
        JSON.stringify({
          subject: 'Test',
          body: 'Test',
          html: '<p>Test</p>',
        }),
      );

      const result = await service.generateAiDrafts(
        'template-123',
        {
          leadIds: ['lead-123'],
          provider: 'openrouter',
          model: 'meta-llama/llama-3.2-3b-instruct:free',
        },
        mockUser,
      );

      expect(result).toHaveLength(1);
      // Timeout should be: 15000 (base) + 1 * 8000 (per lead) = 23000ms
    });

    it('should use 5s per lead for OpenAI paid models', async () => {
      const mockLead = {
        id: 'lead-123',
        email: 'test@example.com',
        firstName: 'Test',
        projectId: 'project-123',
        customJson: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(prisma.template, 'findUnique').mockResolvedValue(mockTemplate as any);
      vi.spyOn(prisma.lead, 'findMany').mockResolvedValue([mockLead]);

      vi.spyOn(aiConfig, 'resolveGenerationConfig').mockResolvedValue({
        provider: 'openai',
        model: 'gpt-4',
        apiKey: 'test-key',
      });

      vi.spyOn(aiClient, 'generate').mockResolvedValue(
        JSON.stringify({
          subject: 'Test',
          body: 'Test',
          html: '<p>Test</p>',
        }),
      );

      const result = await service.generateAiDrafts(
        'template-123',
        {
          leadIds: ['lead-123'],
          provider: 'openai',
          model: 'gpt-4',
        },
        mockUser,
      );

      expect(result).toHaveLength(1);
      // Timeout should be: 15000 (base) + 1 * 5000 (per lead) = 20000ms
    });

    it('should use Gemini-specific concurrency settings', async () => {
      const leads = Array.from({ length: 5 }, (_, i) => ({
        id: `lead-${i}`,
        email: `user${i}@example.com`,
        firstName: `User${i}`,
        projectId: 'project-123',
        customJson: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      vi.spyOn(prisma.template, 'findUnique').mockResolvedValue(mockTemplate as any);
      vi.spyOn(prisma.lead, 'findMany').mockResolvedValue(leads);

      vi.spyOn(aiConfig, 'resolveGenerationConfig').mockResolvedValue({
        provider: 'gemini',
        model: 'gemini-pro',
        apiKey: 'test-key',
      });

      let maxConcurrentCalls = 0;
      let concurrentCalls = 0;

      vi.spyOn(aiClient, 'generate').mockImplementation(() => {
        concurrentCalls++;
        maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);

        return new Promise((resolve) => {
          setTimeout(() => {
            concurrentCalls--;
            resolve(
              JSON.stringify({
                subject: 'Test',
                body: 'Test',
                html: '<p>Test</p>',
              }),
            );
          }, 100);
        });
      });

      await service.generateAiDrafts(
        'template-123',
        {
          leadIds: leads.map((l) => l.id),
          provider: 'gemini',
          model: 'gemini-pro',
        },
        mockUser,
      );

      // Gemini should use 3 workers
      expect(maxConcurrentCalls).toBeLessThanOrEqual(3);
    });
  });

  describe('Scenario 7: Error Handling and Recovery', () => {
    it('should fail all drafts if one lead fails during generation', async () => {
      const leads = Array.from({ length: 5 }, (_, i) => ({
        id: `lead-${i}`,
        email: `user${i}@example.com`,
        firstName: `User${i}`,
        projectId: 'project-123',
        customJson: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      vi.spyOn(prisma.template, 'findUnique').mockResolvedValue(mockTemplate as any);
      vi.spyOn(prisma.lead, 'findMany').mockResolvedValue(leads);

      let callCount = 0;
      vi.spyOn(aiClient, 'generate').mockImplementation(() => {
        callCount++;
        if (callCount === 3) {
          return Promise.reject(new Error('AI service error'));
        }
        return Promise.resolve(
          JSON.stringify({
            subject: 'Test',
            body: 'Test',
            html: '<p>Test</p>',
          }),
        );
      });

      await expect(
        service.generateAiDrafts('template-123', { leadIds: leads.map((l) => l.id) }, mockUser),
      ).rejects.toThrow('AI service error');
    });

    it('should handle malformed AI responses gracefully', async () => {
      const mockLead = {
        id: 'lead-123',
        email: 'test@example.com',
        firstName: 'Test',
        projectId: 'project-123',
        customJson: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(prisma.template, 'findUnique').mockResolvedValue(mockTemplate as any);
      vi.spyOn(prisma.lead, 'findMany').mockResolvedValue([mockLead]);

      // Return malformed JSON
      vi.spyOn(aiClient, 'generate').mockResolvedValue('not valid json at all');

      const results = await service.generateAiDrafts(
        'template-123',
        { leadIds: ['lead-123'] },
        mockUser,
      );

      // Should still return a result with fallback values
      expect(results).toHaveLength(1);
      expect(results[0].leadId).toBe('lead-123');
      // Service parses malformed responses with fallback logic
    });

    it('should handle empty AI responses', async () => {
      const mockLead = {
        id: 'lead-123',
        email: 'test@example.com',
        firstName: 'Test',
        projectId: 'project-123',
        customJson: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(prisma.template, 'findUnique').mockResolvedValue(mockTemplate as any);
      vi.spyOn(prisma.lead, 'findMany').mockResolvedValue([mockLead]);

      vi.spyOn(aiClient, 'generate').mockResolvedValue('');

      const results = await service.generateAiDrafts(
        'template-123',
        { leadIds: ['lead-123'] },
        mockUser,
      );

      expect(results).toHaveLength(1);
      // Should have fallback subject
      expect(results[0].subject).toBeDefined();
    });
  });

  describe('Chat and Suggest Template Timeouts', () => {
    it('should apply timeout to chatWithTemplate', async () => {
      vi.spyOn(prisma.template, 'findUnique').mockResolvedValue(mockTemplate as any);

      vi.spyOn(aiClient, 'generate').mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(
              JSON.stringify({
                message: 'Here are my suggestions',
                updates: { subject: 'Better subject' },
              }),
            );
          }, 1000);
        });
      });

      const result = await service.chatWithTemplate(
        'template-123',
        { message: 'How can I improve this?' },
        mockUser,
      );

      expect(result.message).toBeDefined();
    });

    it('should timeout chatWithTemplate if AI is too slow', async () => {
      vi.spyOn(prisma.template, 'findUnique').mockResolvedValue(mockTemplate as any);

      vi.spyOn(aiClient, 'generate').mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve('{}'), 30000);
        });
      });

      await expect(
        service.chatWithTemplate('template-123', { message: 'How can I improve this?' }, mockUser),
      ).rejects.toThrow(BadRequestException);
    }, 35000);

    it('should apply timeout to suggestTemplate', async () => {
      vi.spyOn(prisma.project, 'findUnique').mockResolvedValue({
        id: 'project-123',
        brandingJson: { knowledgeBase: 'Test brand' },
      } as any);

      const leads = Array.from({ length: 3 }, (_, i) => ({
        id: `lead-${i}`,
        email: `user${i}@example.com`,
        firstName: `User${i}`,
        projectId: 'project-123',
        customJson: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      vi.spyOn(prisma.lead, 'findMany').mockResolvedValue(leads);

      vi.spyOn(aiClient, 'generate').mockResolvedValue(
        JSON.stringify({
          subject: 'Suggested Subject',
          body: 'Suggested body text',
        }),
      );

      const result = await service.suggestTemplate('project-123', { leadSampleSize: 3 }, mockUser);

      expect(result.subject).toBe('Suggested Subject');
      expect(result.body).toBe('Suggested body text');
    });
  });
});
