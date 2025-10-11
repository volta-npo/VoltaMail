import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
  MaxLength
} from 'class-validator';

class DraftEntryDto {
  @IsString()
  leadId!: string;

  @IsString()
  @MaxLength(200)
  subject!: string;

  @IsString()
  body!: string;

  @IsOptional()
  @IsString()
  html?: string;

  @IsOptional()
  @IsString()
  templateVersionId?: string;
}

export class SendBulkDraftsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DraftEntryDto)
  drafts!: DraftEntryDto[];

  @IsOptional()
  @IsString()
  gmailConnectionId?: string;

  @IsOptional()
  @IsIn(['openrouter', 'openai', 'gemini'])
  provider?: 'openrouter' | 'openai' | 'gemini';
}
