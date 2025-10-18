import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SuggestTemplateDto {
  @IsOptional()
  @IsIn(['openrouter', 'openai', 'gemini'])
  provider?: 'openrouter' | 'openai' | 'gemini';

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsString()
  presetId?: string;

  @IsOptional()
  @IsString()
  knowledgeBase?: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  leadSampleSize?: number;
}
