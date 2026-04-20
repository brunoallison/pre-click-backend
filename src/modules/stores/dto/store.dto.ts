import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';
import { CLUSTERS } from '../../../entities/store.entity.js';

const STORE_CONCEPTS = ['BCS', 'OCS', 'YACS', 'FTWS'] as const;
const STATUS_COMP = ['COMP', 'NEW_2026', 'NEW_2025', 'NON_COMP'] as const;

export class CreateStoreInput {
  @IsOptional()
  @Matches(/^70000\d{5}$/, { message: 'CUSTOMER deve ter formato 70000XXXXX' })
  customer_id_sap?: string;

  @IsString()
  @Length(2, 120)
  legal_name!: string;

  @IsString()
  @Length(2, 80)
  display_name!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  store_number?: number;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;

  @IsIn([...STORE_CONCEPTS])
  store_concept!: (typeof STORE_CONCEPTS)[number];

  @IsOptional()
  @IsIn([...CLUSTERS])
  cluster?: (typeof CLUSTERS)[number];

  @IsOptional() @IsString() @Length(2, 80) city?: string;
  @IsOptional() @IsString() @Length(2, 2) state?: string;

  @IsOptional()
  @IsIn([...STATUS_COMP])
  status_comp?: (typeof STATUS_COMP)[number];

  @IsOptional()
  @IsBoolean()
  is_dummy?: boolean;
}

export class UpdateStoreProfileInput {
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() manager_name?: string;
  @IsOptional() @IsString() manager_phone?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsObject() custom_fields?: Record<string, unknown>;
}

export interface StoreOutput {
  id: string;
  customer_id_sap: string | null;
  legal_name: string;
  display_name: string;
  store_number: number | null;
  country: string;
  store_concept: string;
  cluster: string | null;
  city: string | null;
  state: string | null;
  status_comp: string;
  is_dummy: boolean;
  is_active: boolean;
}
