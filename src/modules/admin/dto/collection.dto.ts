import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';

const CODE_REGEX = /^[A-Z0-9-]+$/;

export class CreateCollectionInput {
  @IsString()
  @Length(2, 32)
  @Matches(CODE_REGEX, {
    message: 'code deve conter apenas letras maiúsculas, dígitos e hífens (ex: SS27, PACK-NATAL-26)',
  })
  code!: string;

  @IsString()
  @Length(2, 8)
  country!: string;

  @IsString()
  @Length(1, 120)
  name!: string;

  @IsDateString()
  order_start_at!: string;

  @IsDateString()
  order_end_at!: string;

  @IsDateString()
  delivery_start_at!: string;

  @IsDateString()
  delivery_end_at!: string;
}

export class UpdateCollectionInput {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsDateString()
  order_start_at?: string;

  @IsOptional()
  @IsDateString()
  order_end_at?: string;

  @IsOptional()
  @IsDateString()
  delivery_start_at?: string;

  @IsOptional()
  @IsDateString()
  delivery_end_at?: string;
}

export class CollectionIdParams {
  @IsUUID()
  id!: string;
}
