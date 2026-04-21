import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GradeSizeInput {
  @IsString()
  @Length(1, 20)
  size!: string;

  @IsInt()
  @Min(1)
  qty!: number;
}

export class CreateGradeInput {
  @IsUUID() collection_id!: string;

  @IsString()
  @Length(1, 64)
  code!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GradeSizeInput)
  sizes!: GradeSizeInput[];
}

export class ListGradesQuery {
  @IsOptional() @IsUUID() collection_id?: string;
}

export interface GradeOutput {
  id: string;
  collection_id: string;
  code: string;
  tenant_id: string | null;
  is_system: boolean;
  total_pieces: number;
  sizes: Array<{ size: string; qty: number }>;
}
