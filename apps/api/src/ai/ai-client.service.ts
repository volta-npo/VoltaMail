import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type Provider = 'openrouter' | 'openai' | 'gemini';

interface AiGenerateOptions {
  provider?: Provider;
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  apiKey?: string | null;
  timeoutMs?: number;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

export const DEFAULT_MODELS: Record<Provider, string> = {
  openrouter: 'z-ai/glm-4.5-air:free',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-1.5-flash'
};

// Default fetch timeouts per provider (in milliseconds)
const PROVIDER_FETCH_TIMEOUTS: Record<Provider, number> = {
  openrouter: 60000, // 60s for free models
  openai: 45000,     // 45s for paid models
  gemini: 45000      // 45s for Gemini
};

@Injectable()
export class AiClientService {
  constructor(private readonly configService: ConfigService) {}

  async generate(options: AiGenerateOptions): Promise<string> {
    const provider = options.provider ?? 'openrouter';

    switch (provider) {
      case 'openrouter':
        return this.generateWithOpenRouter(options);
      case 'openai':
        return this.generateWithOpenAI(options);
      case 'gemini':
        return this.generateWithGemini(options);
      default:
        throw new BadRequestException(`Unsupported provider: ${provider}`);
    }
  }

  async *streamGenerate(options: AiGenerateOptions): AsyncGenerator<string> {
    const provider = options.provider ?? 'openrouter';

    switch (provider) {
      case 'gemini':
        yield* this.streamGenerateWithGemini(options);
        break;
      case 'openrouter':
      case 'openai': {
        const result = await this.generate(options);
        if (result) {
          yield result;
        }
        break;
      }
      default:
        throw new BadRequestException(`Unsupported provider: ${provider}`);
    }
  }

  private async generateWithOpenRouter(options: AiGenerateOptions): Promise<string> {
    const apiKey =
      options.apiKey?.trim() ||
      this.configService.get<string>('OPENROUTER_API_KEY') ||
      process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new BadRequestException(
        'OpenRouter API key is not configured. Add one in AI settings or set OPENROUTER_API_KEY.'
      );
    }

    const timeoutMs = options.timeoutMs ?? PROVIDER_FETCH_TIMEOUTS.openrouter;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': this.configService.get<string>('APP_BASE_URL') ?? 'http://localhost:3000',
          'X-Title': 'VoltaMail'
        },
        body: JSON.stringify({
          model: this.normalizeOpenRouterModel(options.model),
          messages: [
            { role: 'system', content: options.systemPrompt },
            { role: 'user', content: options.userPrompt }
          ]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 404 && errorText.includes('Free model publication')) {
          throw new BadRequestException(
            'OpenRouter free models require enabling "Free model publication" in your privacy settings. Visit https://openrouter.ai/settings/privacy to update the policy or switch to another provider.'
          );
        }
        if (response.status === 429) {
          throw new BadRequestException(
            'OpenRouter rate limit exceeded. Please try again in a moment or switch to another AI provider.'
          );
        }
        throw new InternalServerErrorException(
          `OpenRouter API error: ${response.status} - ${errorText}`
        );
      }

      const json = (await response.json()) as ChatCompletionResponse;
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        throw new InternalServerErrorException('OpenRouter returned an empty response.');
      }
      return content as string;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new BadRequestException(
            `OpenRouter request timed out after ${Math.round(timeoutMs / 1000)}s. The AI provider is taking too long. Try reducing the number of leads or switching to a faster model.`
          );
        }
        if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
          throw error;
        }
        throw new InternalServerErrorException(`OpenRouter error: ${error.message}`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async generateWithOpenAI(options: AiGenerateOptions): Promise<string> {
    const apiKey = options.apiKey?.trim() || this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new BadRequestException(
        'OpenAI API key is not configured. Add one in AI settings or set OPENAI_API_KEY.'
      );
    }

    const timeoutMs = options.timeoutMs ?? PROVIDER_FETCH_TIMEOUTS.openai;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: options.model ?? DEFAULT_MODELS.openai,
          messages: [
            { role: 'system', content: options.systemPrompt },
            { role: 'user', content: options.userPrompt }
          ]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429) {
          throw new BadRequestException(
            'OpenAI rate limit exceeded. Please try again in a moment.'
          );
        }
        throw new InternalServerErrorException(
          `OpenAI API error: ${response.status} - ${errorText}`
        );
      }

      const json = (await response.json()) as ChatCompletionResponse;
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        throw new InternalServerErrorException('OpenAI returned an empty response.');
      }
      return content as string;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new BadRequestException(
            `OpenAI request timed out after ${Math.round(timeoutMs / 1000)}s. The API is taking too long. Try reducing the number of leads.`
          );
        }
        if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
          throw error;
        }
        throw new InternalServerErrorException(`OpenAI error: ${error.message}`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async generateWithGemini(options: AiGenerateOptions): Promise<string> {
    const apiKey = options.apiKey?.trim() || this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new BadRequestException(
        'Gemini API key is not configured. Add one in AI settings or set GEMINI_API_KEY.'
      );
    }

    const timeoutMs = options.timeoutMs ?? PROVIDER_FETCH_TIMEOUTS.gemini;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${
          options.model ?? DEFAULT_MODELS.gemini
        }:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: options.systemPrompt },
                  { text: options.userPrompt }
                ]
              }
            ]
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429) {
          throw new BadRequestException(
            'Gemini rate limit exceeded. Please try again in a moment.'
          );
        }
        throw new InternalServerErrorException(
          `Gemini API error: ${response.status} - ${errorText}`
        );
      }

      const json = (await response.json()) as GeminiResponse;
      const content = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) {
        throw new InternalServerErrorException('Gemini returned an empty response.');
      }
      return content as string;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new BadRequestException(
            `Gemini request timed out after ${Math.round(timeoutMs / 1000)}s. The API is taking too long. Try reducing the number of leads.`
          );
        }
        if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
          throw error;
        }
        throw new InternalServerErrorException(`Gemini error: ${error.message}`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async *streamGenerateWithGemini(options: AiGenerateOptions): AsyncGenerator<string> {
    const apiKey = options.apiKey?.trim() || this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new BadRequestException(
        'Gemini API key is not configured. Add one in AI settings or set GEMINI_API_KEY.'
      );
    }

    const timeoutMs = options.timeoutMs ?? PROVIDER_FETCH_TIMEOUTS.gemini;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${
          options.model ?? DEFAULT_MODELS.gemini
        }:streamGenerateContent?key=${apiKey}`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: options.systemPrompt },
                  { text: options.userPrompt }
                ]
              }
            ]
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429) {
          throw new BadRequestException(
            'Gemini rate limit exceeded. Please try again in a moment.'
          );
        }
        throw new InternalServerErrorException(
          `Gemini API error: ${response.status} - ${errorText}`
        );
      }

      if (!response.body) {
        throw new InternalServerErrorException('Gemini streaming response had no body.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let previousText = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (!line) {
            continue;
          }

          let parsed: any;
          try {
            parsed = JSON.parse(line);
          } catch {
            continue;
          }

          const parts = parsed?.candidates?.[0]?.content?.parts ?? [];
          const text = parts
            .map((part: { text?: string }) => part?.text ?? '')
            .join('');

          if (!text) {
            continue;
          }

          if (text.length > previousText.length) {
            const diff = text.slice(previousText.length);
            previousText = text;
            if (diff) {
              yield diff;
            }
          }
        }
      }

      if (buffer.trim().length > 0) {
        try {
          const parsed = JSON.parse(buffer.trim());
          const parts = parsed?.candidates?.[0]?.content?.parts ?? [];
          const text = parts
            .map((part: { text?: string }) => part?.text ?? '')
            .join('');
          if (text.length > previousText.length) {
            const diff = text.slice(previousText.length);
            if (diff) {
              yield diff;
            }
          }
        } catch {
          // ignore trailing parse errors
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new BadRequestException(
            `Gemini request timed out after ${Math.round(timeoutMs / 1000)}s. The API is taking too long. Try reducing the number of leads.`
          );
        }
        if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
          throw error;
        }
        throw new InternalServerErrorException(`Gemini error: ${error.message}`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private normalizeOpenRouterModel(model?: string): string {
    const candidate = model ?? DEFAULT_MODELS.openrouter;
    return candidate.replace(/^openrouter\//i, '');
  }
}
