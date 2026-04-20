import { IsString, Length, Matches } from 'class-validator';

export class ImportBaseInput {
  @IsString()
  @Matches(/^[A-Z]{2}\d{2}$/, { message: "season_code formato 'SS27' | 'FW26'" })
  season_code!: string;

  @IsString()
  @Length(2, 2)
  country!: string;
}

export interface ImportBaseOutput {
  import_id: string;
  job_id: string;
  status: 'queued';
}
