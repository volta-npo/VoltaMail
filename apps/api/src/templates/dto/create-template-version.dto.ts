import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateTemplateVersionDto {
  @IsOptional()
  @IsIn(['TEXT', 'HTML'])
  type?: 'TEXT' | 'HTML';

  @IsOptional()
  @IsIn(['AI', 'USER'])
  source?: 'AI' | 'USER';

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  htmlContent?: string;

  @IsOptional()
  @IsString()
  textContent?: string;

  @IsOptional()
  @IsString()
  createdByAiProvider?: string;

  @IsOptional()
  @IsString()
  parentVersionId?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  activate?: boolean;
}
