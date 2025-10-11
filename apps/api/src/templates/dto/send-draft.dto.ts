import { IsOptional, IsString } from 'class-validator';

export class SendDraftDto {
  @IsString()
  leadId!: string;

  @IsString()
  subject!: string;

  @IsString()
  body!: string;

  @IsOptional()
  @IsString()
  html?: string;

  @IsOptional()
  @IsString()
  templateVersionId?: string;

  @IsOptional()
  @IsString()
  gmailConnectionId?: string;
}
