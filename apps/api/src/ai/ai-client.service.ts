import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type Provider = 'openrouter' | 'openai' | 'gemini';

interface AiGenerateOptions {
  provider?: Provider;
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  apiKey?: string | null;
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

const DEFAULT_MODELS: Record<Provider, string> = {
  openrouter: 'openrouter/llama-3.1-8b-instruct',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-1.5-flash'
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

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': this.configService.get<string>('APP_BASE_URL') ?? 'http://localhost:3000',
        'X-Title': 'VoltaMail'
      },
      body: JSON.stringify({
        model: options.model ?? DEFAULT_MODELS.openrouter,
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
          'OpenRouter free models require enabling “Free model publication” in your privacy settings. Visit https://openrouter.ai/settings/privacy to update the policy or switch to another provider.'
        );
      }
      throw new InternalServerErrorException(errorText);
    }

    const json = (await response.json()) as ChatCompletionResponse;
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new InternalServerErrorException('OpenRouter returned an empty response.');
    }
    return content as string;
  }

  private async generateWithOpenAI(options: AiGenerateOptions): Promise<string> {
    const apiKey = options.apiKey?.trim() || this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new BadRequestException(
        'OpenAI API key is not configured. Add one in AI settings or set OPENAI_API_KEY.'
      );
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
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
      throw new InternalServerErrorException(await response.text());
    }

    const json = (await response.json()) as ChatCompletionResponse;
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new InternalServerErrorException('OpenAI returned an empty response.');
    }
    return content as string;
  }

  private async generateWithGemini(options: AiGenerateOptions): Promise<string> {
    const apiKey = options.apiKey?.trim() || this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new BadRequestException(
        'Gemini API key is not configured. Add one in AI settings or set GEMINI_API_KEY.'
      );
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${
        options.model ?? DEFAULT_MODELS.gemini
      }:generateContent?key=${apiKey}`,
      {
        method: 'POST',
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
      throw new InternalServerErrorException(await response.text());
    }

    const json = (await response.json()) as GeminiResponse;
    const content = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) {
      throw new InternalServerErrorException('Gemini returned an empty response.');
    }
    return content as string;
  }
}
