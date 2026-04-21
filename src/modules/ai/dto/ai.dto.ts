import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';

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
}

export interface ChatOutput {
  session_id: string;
  reply: string;
  actions?: Array<{ label: string; type: string; payload: Record<string, unknown> }>;
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
