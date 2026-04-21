import { IsNumber, IsPositive, IsUUID } from 'class-validator';

export class GetTenantBudgetQuery {
  @IsUUID()
  collection_id!: string;
}

export class PutTenantBudgetInput {
  @IsUUID()
  collection_id!: string;

  @IsNumber()
  @IsPositive()
  amount_brl!: number;
}

export class PutStoreBudgetInput {
  @IsUUID()
  collection_id!: string;

  @IsNumber()
  @IsPositive()
  amount_brl!: number;
}

export interface TenantBudgetOutput {
  collection_id: string;
  amount_brl: number;
  used_brl: number;
  updated_at: string | null;
}

export interface StoreBudgetOutput {
  store_id: string;
  collection_id: string;
  amount_brl: number;
  used_brl: number;
  updated_at: string | null;
}
