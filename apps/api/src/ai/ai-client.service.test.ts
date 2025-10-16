import { describe, expect, it, beforeEach, vi } from 'vitest';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiClientService, DEFAULT_MODELS } from './ai-client.service';

// Mock fetch globally
global.fetch = vi.fn();

describe('AiClientService', () => {
  let service: AiClientService;
  let configService: ConfigService;

  beforeEach(() => {
    vi.clearAllMocks();

    configService = {
      get: vi.fn()
    } as any;

    service = new AiClientService(configService);
  });

  describe('generate - Provider Routing', () => {
    it('should route to OpenRouter when provider is openrouter', async () => {
      vi.spyOn(configService, 'get')
        .mockReturnValueOnce('test-openrouter-key') // OPENROUTER_API_KEY
        .mockReturnValueOnce('http://localhost:3000'); // APP_BASE_URL

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'OpenRouter response' } }]
        })
      });

      const result = await service.generate({
        provider: 'openrouter',
        systemPrompt: 'You are a helpful assistant',
        userPrompt: 'Hello'
      });

      expect(result).toBe('OpenRouter response');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-openrouter-key',
            'X-Title': 'VoltaMail'
          })
        })
      );
    });

    it('should route to OpenAI when provider is openai', async () => {
      vi.spyOn(configService, 'get').mockReturnValue('test-openai-key');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'OpenAI response' } }]
        })
      });

      const result = await service.generate({
        provider: 'openai',
        systemPrompt: 'You are a helpful assistant',
        userPrompt: 'Hello'
      });

      expect(result).toBe('OpenAI response');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-openai-key'
          })
        })
      );
    });

    it('should route to Gemini when provider is gemini', async () => {
      vi.spyOn(configService, 'get').mockReturnValue('test-gemini-key');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Gemini response' }] } }]
        })
      });

      const result = await service.generate({
        provider: 'gemini',
        systemPrompt: 'You are a helpful assistant',
        userPrompt: 'Hello'
      });

      expect(result).toBe('Gemini response');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://generativelanguage.googleapis.com'),
        expect.objectContaining({
          method: 'POST'
        })
      );
    });

    it('should default to openrouter when no provider is specified', async () => {
      vi.spyOn(configService, 'get')
        .mockReturnValueOnce('test-key')
        .mockReturnValueOnce('http://localhost:3000');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Default response' } }]
        })
      });

      await service.generate({
        systemPrompt: 'System',
        userPrompt: 'User'
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.any(Object)
      );
    });

    it('should throw error for unsupported provider', async () => {
      await expect(
        service.generate({
          provider: 'unsupported-provider' as any,
          systemPrompt: 'System',
          userPrompt: 'User'
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('OpenRouter - API Key Handling', () => {
    it('should use provided API key over environment variable', async () => {
      vi.spyOn(configService, 'get').mockReturnValue('http://localhost:3000');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }]
        })
      });

      await service.generate({
        provider: 'openrouter',
        systemPrompt: 'System',
        userPrompt: 'User',
        apiKey: 'custom-api-key'
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer custom-api-key'
          })
        })
      );
    });

    it('should trim whitespace from provided API key', async () => {
      vi.spyOn(configService, 'get').mockReturnValue('http://localhost:3000');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }]
        })
      });

      await service.generate({
        provider: 'openrouter',
        systemPrompt: 'System',
        userPrompt: 'User',
        apiKey: '  whitespace-key  '
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer whitespace-key'
          })
        })
      );
    });

    it('should throw error when no API key is configured', async () => {
      vi.spyOn(configService, 'get').mockReturnValue(undefined);

      await expect(
        service.generate({
          provider: 'openrouter',
          systemPrompt: 'System',
          userPrompt: 'User'
        })
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.generate({
          provider: 'openrouter',
          systemPrompt: 'System',
          userPrompt: 'User'
        })
      ).rejects.toThrow('OpenRouter API key is not configured');
    });

    it('should use ConfigService before process.env', async () => {
      process.env.OPENROUTER_API_KEY = 'env-key';
      vi.spyOn(configService, 'get')
        .mockReturnValueOnce('config-key')
        .mockReturnValueOnce('http://localhost:3000');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }]
        })
      });

      await service.generate({
        provider: 'openrouter',
        systemPrompt: 'System',
        userPrompt: 'User'
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer config-key'
          })
        })
      );

      delete process.env.OPENROUTER_API_KEY;
    });
  });

  describe('OpenRouter - Model Normalization', () => {
    it('should use default model when none is provided', async () => {
      vi.spyOn(configService, 'get')
        .mockReturnValueOnce('test-key')
        .mockReturnValueOnce('http://localhost:3000');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }]
        })
      });

      await service.generate({
        provider: 'openrouter',
        systemPrompt: 'System',
        userPrompt: 'User'
      });

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      expect(body.model).toBe(DEFAULT_MODELS.openrouter);
    });

    it('should remove openrouter/ prefix from model name', async () => {
      vi.spyOn(configService, 'get')
        .mockReturnValueOnce('test-key')
        .mockReturnValueOnce('http://localhost:3000');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }]
        })
      });

      await service.generate({
        provider: 'openrouter',
        systemPrompt: 'System',
        userPrompt: 'User',
        model: 'openrouter/meta-llama/llama-3'
      });

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      expect(body.model).toBe('meta-llama/llama-3');
    });

    it('should handle case-insensitive openrouter/ prefix removal', async () => {
      vi.spyOn(configService, 'get')
        .mockReturnValueOnce('test-key')
        .mockReturnValueOnce('http://localhost:3000');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }]
        })
      });

      await service.generate({
        provider: 'openrouter',
        systemPrompt: 'System',
        userPrompt: 'User',
        model: 'OPENROUTER/some-model'
      });

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      expect(body.model).toBe('some-model');
    });
  });

  describe('OpenRouter - Error Handling', () => {
    it('should throw InternalServerErrorException on API error', async () => {
      vi.spyOn(configService, 'get')
        .mockReturnValueOnce('test-key')
        .mockReturnValueOnce('http://localhost:3000');

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error'
      });

      await expect(
        service.generate({
          provider: 'openrouter',
          systemPrompt: 'System',
          userPrompt: 'User'
        })
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw specific error for free model publication requirement', async () => {
      vi.spyOn(configService, 'get')
        .mockReturnValueOnce('test-key')
        .mockReturnValueOnce('http://localhost:3000')
        .mockReturnValueOnce('test-key')
        .mockReturnValueOnce('http://localhost:3000');

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          text: async () => 'Free model publication is required'
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          text: async () => 'Free model publication is required'
        });

      await expect(
        service.generate({
          provider: 'openrouter',
          systemPrompt: 'System',
          userPrompt: 'User'
        })
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.generate({
          provider: 'openrouter',
          systemPrompt: 'System',
          userPrompt: 'User'
        })
      ).rejects.toThrow('Free model publication');
    });

    it('should throw error when response has no content', async () => {
      vi.spyOn(configService, 'get')
        .mockReturnValueOnce('test-key')
        .mockReturnValueOnce('http://localhost:3000')
        .mockReturnValueOnce('test-key')
        .mockReturnValueOnce('http://localhost:3000');

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: []
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: []
          })
        });

      await expect(
        service.generate({
          provider: 'openrouter',
          systemPrompt: 'System',
          userPrompt: 'User'
        })
      ).rejects.toThrow(InternalServerErrorException);

      await expect(
        service.generate({
          provider: 'openrouter',
          systemPrompt: 'System',
          userPrompt: 'User'
        })
      ).rejects.toThrow('empty response');
    });

    it('should throw error when message content is null', async () => {
      vi.spyOn(configService, 'get')
        .mockReturnValueOnce('test-key')
        .mockReturnValueOnce('http://localhost:3000');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: null } }]
        })
      });

      await expect(
        service.generate({
          provider: 'openrouter',
          systemPrompt: 'System',
          userPrompt: 'User'
        })
      ).rejects.toThrow('empty response');
    });
  });

  describe('OpenAI - API Integration', () => {
    it('should use provided API key', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }]
        })
      });

      await service.generate({
        provider: 'openai',
        systemPrompt: 'System',
        userPrompt: 'User',
        apiKey: 'sk-test123'
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer sk-test123'
          })
        })
      );
    });

    it('should throw error when no API key is configured', async () => {
      vi.spyOn(configService, 'get').mockReturnValue(undefined);

      await expect(
        service.generate({
          provider: 'openai',
          systemPrompt: 'System',
          userPrompt: 'User'
        })
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.generate({
          provider: 'openai',
          systemPrompt: 'System',
          userPrompt: 'User'
        })
      ).rejects.toThrow('OpenAI API key is not configured');
    });

    it('should use default model when none is provided', async () => {
      vi.spyOn(configService, 'get').mockReturnValue('test-key');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }]
        })
      });

      await service.generate({
        provider: 'openai',
        systemPrompt: 'System',
        userPrompt: 'User'
      });

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      expect(body.model).toBe(DEFAULT_MODELS.openai);
    });

    it('should use custom model when provided', async () => {
      vi.spyOn(configService, 'get').mockReturnValue('test-key');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }]
        })
      });

      await service.generate({
        provider: 'openai',
        systemPrompt: 'System',
        userPrompt: 'User',
        model: 'gpt-4-turbo'
      });

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      expect(body.model).toBe('gpt-4-turbo');
    });

    it('should throw error on API failure', async () => {
      vi.spyOn(configService, 'get').mockReturnValue('test-key');

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Invalid API key'
      });

      await expect(
        service.generate({
          provider: 'openai',
          systemPrompt: 'System',
          userPrompt: 'User'
        })
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw error when response has no content', async () => {
      vi.spyOn(configService, 'get').mockReturnValue('test-key');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: {} }]
        })
      });

      await expect(
        service.generate({
          provider: 'openai',
          systemPrompt: 'System',
          userPrompt: 'User'
        })
      ).rejects.toThrow('empty response');
    });

    it('should include both system and user messages', async () => {
      vi.spyOn(configService, 'get').mockReturnValue('test-key');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }]
        })
      });

      await service.generate({
        provider: 'openai',
        systemPrompt: 'You are helpful',
        userPrompt: 'Hello world'
      });

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      expect(body.messages).toEqual([
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello world' }
      ]);
    });
  });

  describe('Gemini - API Integration', () => {
    it('should use provided API key in URL', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Response' }] } }]
        })
      });

      await service.generate({
        provider: 'gemini',
        systemPrompt: 'System',
        userPrompt: 'User',
        apiKey: 'gemini-key-123'
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('key=gemini-key-123'),
        expect.any(Object)
      );
    });

    it('should throw error when no API key is configured', async () => {
      vi.spyOn(configService, 'get').mockReturnValue(undefined);

      await expect(
        service.generate({
          provider: 'gemini',
          systemPrompt: 'System',
          userPrompt: 'User'
        })
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.generate({
          provider: 'gemini',
          systemPrompt: 'System',
          userPrompt: 'User'
        })
      ).rejects.toThrow('Gemini API key is not configured');
    });

    it('should use default model when none is provided', async () => {
      vi.spyOn(configService, 'get').mockReturnValue('test-key');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Response' }] } }]
        })
      });

      await service.generate({
        provider: 'gemini',
        systemPrompt: 'System',
        userPrompt: 'User'
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`models/${DEFAULT_MODELS.gemini}`),
        expect.any(Object)
      );
    });

    it('should use custom model when provided', async () => {
      vi.spyOn(configService, 'get').mockReturnValue('test-key');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Response' }] } }]
        })
      });

      await service.generate({
        provider: 'gemini',
        systemPrompt: 'System',
        userPrompt: 'User',
        model: 'gemini-pro'
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('models/gemini-pro'),
        expect.any(Object)
      );
    });

    it('should include both prompts in content parts', async () => {
      vi.spyOn(configService, 'get').mockReturnValue('test-key');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Response' }] } }]
        })
      });

      await service.generate({
        provider: 'gemini',
        systemPrompt: 'System prompt',
        userPrompt: 'User prompt'
      });

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      expect(body.contents[0].parts).toEqual([
        { text: 'System prompt' },
        { text: 'User prompt' }
      ]);
    });

    it('should throw error on API failure', async () => {
      vi.spyOn(configService, 'get').mockReturnValue('test-key');

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Bad Request'
      });

      await expect(
        service.generate({
          provider: 'gemini',
          systemPrompt: 'System',
          userPrompt: 'User'
        })
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw error when response has no candidates', async () => {
      vi.spyOn(configService, 'get').mockReturnValue('test-key');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: []
        })
      });

      await expect(
        service.generate({
          provider: 'gemini',
          systemPrompt: 'System',
          userPrompt: 'User'
        })
      ).rejects.toThrow('empty response');
    });

    it('should throw error when text content is missing', async () => {
      vi.spyOn(configService, 'get').mockReturnValue('test-key');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [] } }]
        })
      });

      await expect(
        service.generate({
          provider: 'gemini',
          systemPrompt: 'System',
          userPrompt: 'User'
        })
      ).rejects.toThrow('empty response');
    });
  });

  describe('Rate Limiting and Timeouts', () => {
    it('should handle network timeout', async () => {
      vi.spyOn(configService, 'get').mockReturnValue('test-key');

      (global.fetch as any).mockImplementationOnce(
        () => new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Network timeout')), 100)
        )
      );

      await expect(
        service.generate({
          provider: 'openai',
          systemPrompt: 'System',
          userPrompt: 'User'
        })
      ).rejects.toThrow('Network timeout');
    });

    it('should handle rate limit errors', async () => {
      vi.spyOn(configService, 'get').mockReturnValue('test-key');

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded'
      });

      await expect(
        service.generate({
          provider: 'openai',
          systemPrompt: 'System',
          userPrompt: 'User'
        })
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should handle connection errors', async () => {
      vi.spyOn(configService, 'get').mockReturnValue('test-key');

      (global.fetch as any).mockRejectedValueOnce(new Error('Connection refused'));

      await expect(
        service.generate({
          provider: 'openai',
          systemPrompt: 'System',
          userPrompt: 'User'
        })
      ).rejects.toThrow('Connection refused');
    });
  });

  describe('Message Formatting', () => {
    it('should correctly format messages for OpenRouter', async () => {
      vi.spyOn(configService, 'get')
        .mockReturnValueOnce('test-key')
        .mockReturnValueOnce('http://localhost:3000');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }]
        })
      });

      await service.generate({
        provider: 'openrouter',
        systemPrompt: 'You are a coding assistant',
        userPrompt: 'Write a function'
      });

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[1].role).toBe('user');
    });

    it('should include HTTP-Referer header for OpenRouter', async () => {
      vi.spyOn(configService, 'get')
        .mockReturnValueOnce('test-key')
        .mockReturnValueOnce('https://myapp.com');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }]
        })
      });

      await service.generate({
        provider: 'openrouter',
        systemPrompt: 'System',
        userPrompt: 'User'
      });

      const fetchCall = (global.fetch as any).mock.calls[0];
      const headers = fetchCall[1].headers;

      expect(headers['HTTP-Referer']).toBe('https://myapp.com');
      expect(headers['X-Title']).toBe('VoltaMail');
    });
  });
});
