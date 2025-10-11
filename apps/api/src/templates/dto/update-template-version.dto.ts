import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateTemplateVersionDto {
  @IsOptional()
  @IsIn(['TEXT', 'HTML'])
  type?: 'TEXT' | 'HTML';

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  htmlContent?: string;

  @IsOptional()
  @IsString()
  textContent?: string;
}
