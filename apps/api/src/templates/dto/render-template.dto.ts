import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class RenderTemplateDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  sampleSize?: number;
}
