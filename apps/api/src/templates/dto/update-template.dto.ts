import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  body?: string;
}
