import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject!: string;

  @IsString()
  @IsNotEmpty()
  body!: string;
}
