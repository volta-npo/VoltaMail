import { Type } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';

class DraftIterationTarget {
  @IsString()
  leadId!: string;

  @IsOptional()
  @IsString()
  lastDraftHtml?: string;

  @IsOptional()
  @IsString()
  lastDraftText?: string;
}

export class IterateDraftsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DraftIterationTarget)
  targets!: DraftIterationTarget[];

  @IsOptional()
  @IsString()
  templateVersionId?: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsIn(['openrouter', 'openai', 'gemini'])
  provider?: 'openrouter' | 'openai' | 'gemini';

  @IsOptional()
  @IsString()
  model?: string;
}
