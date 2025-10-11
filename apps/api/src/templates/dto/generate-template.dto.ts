import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class GenerateTemplateDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  leadIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  sampleSize?: number;

  @IsOptional()
  @IsIn(['openrouter', 'openai', 'gemini'])
  provider?: 'openrouter' | 'openai' | 'gemini';

  @IsOptional()
  @IsString()
  model?: string;
}
