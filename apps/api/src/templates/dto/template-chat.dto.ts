import { Type } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
import { AiChatMessage } from '@email-automation/shared';

class ChatMessageUpdatesDto {
  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  html?: string | null;
}

class ChatMessageDto implements AiChatMessage {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  content!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ChatMessageUpdatesDto)
  updates?: ChatMessageUpdatesDto;
}

export class TemplateChatDto {
  @IsString()
  message!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  history?: ChatMessageDto[];
}
