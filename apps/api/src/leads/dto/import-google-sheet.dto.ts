import { IsString, IsUrl } from 'class-validator';

export class ImportGoogleSheetDto {
  @IsString()
  @IsUrl({ protocols: ['https'] })
  url!: string;
}
