import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SuggestHtmlTemplateDto {
  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  variations?: number;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsString()
  templateVersionId?: string;

  @IsOptional()
  @IsString()
  presetId?: string;

  @IsOptional()
  @IsIn(['openrouter', 'openai', 'gemini'])
  provider?: 'openrouter' | 'openai' | 'gemini';

  @IsOptional()
  @IsString()
  model?: string;
}
