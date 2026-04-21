import { IsIn, IsObject, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class ChatInput {
  @IsString()
  @Length(1, 4000)
  message!: string;

  @IsOptional()
  @IsUUID()
  session_id?: string;

  @IsOptional()
  @IsUUID()
  order_id?: string;

  @IsOptional()
  @IsUUID()
  conversation_id?: string;

  @IsOptional()
  @IsObject()
  ui_context?: {
    collection_id?: string;
    store_id?: string;
    order_id?: string;
  };
}

export interface ChatOutput {
  session_id: string;
  reply: string;
  conversation_id?: string;
  tool_calls?: Array<{ name: string; result: unknown }>;
  actions?: Array<{ label: string; type: string; payload: Record<string, unknown> }>;
}

export interface AiConversationOutput {
  id: string;
  visibility: 'tenant' | 'private';
  title: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AiConversationDetailOutput extends AiConversationOutput {
  messages: AiMessageOutput[];
}

export interface AiMessageOutput {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: unknown[];
  user_id: string | null;
  tokens_input: number | null;
  tokens_output: number | null;
  model: string | null;
  created_at: string;
}

export class SuggestGradeInput {
  @IsUUID() order_id!: string;
  @IsUUID() product_id!: string;
  @IsUUID() store_id!: string;
}

export interface SuggestGradeOutput {
  grade_id: string;
  multiplier: number;
  rationale: string;
  confidence: number;
}

export class UploadContextInput {
  @IsIn(['sales_history', 'fw26_portfolio'])
  source!: 'sales_history' | 'fw26_portfolio';

  @IsOptional()
  @IsString()
  @Length(1, 32)
  collection_ref?: string;
}

export interface AiContextOutput {
  id: string;
  source: 'sales_history' | 'fw26_portfolio';
  filename: string;
  collection_ref: string | null;
  row_count: number;
  uploaded_at: string;
}
