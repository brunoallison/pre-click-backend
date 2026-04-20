import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Renomeia colunas s3_key → gcs_key nas tabelas que armazenam caminhos de arquivo.
 * Storage migrado de S3-compatível para Google Cloud Storage (ADC, sem keyfile).
 */
export class RenameS3KeyToGcsKey1745200000000 implements MigrationInterface {
  name = 'RenameS3KeyToGcsKey1745200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "export_batch_file" RENAME COLUMN "s3_key" TO "gcs_key"`);
    await queryRunner.query(
      `COMMENT ON COLUMN "export_batch_file"."gcs_key" IS 'Chave GCS do arquivo (bucket configurado em GCS_BUCKET_NAME)'`,
    );

    await queryRunner.query(`ALTER TABLE "import_base" RENAME COLUMN "s3_key" TO "gcs_key"`);
    await queryRunner.query(
      `COMMENT ON COLUMN "import_base"."gcs_key" IS 'Chave GCS do arquivo (bucket configurado em GCS_BUCKET_NAME)'`,
    );

    await queryRunner.query(`ALTER TABLE "click_error_file" RENAME COLUMN "s3_key" TO "gcs_key"`);
    await queryRunner.query(
      `COMMENT ON COLUMN "click_error_file"."gcs_key" IS 'Chave GCS do arquivo de erro (bucket configurado em GCS_BUCKET_NAME)'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "click_error_file" RENAME COLUMN "gcs_key" TO "s3_key"`);
    await queryRunner.query(
      `COMMENT ON COLUMN "click_error_file"."s3_key" IS 'Chave S3 do arquivo de erro'`,
    );

    await queryRunner.query(`ALTER TABLE "import_base" RENAME COLUMN "gcs_key" TO "s3_key"`);
    await queryRunner.query(`COMMENT ON COLUMN "import_base"."s3_key" IS 'Chave S3 do arquivo'`);

    await queryRunner.query(`ALTER TABLE "export_batch_file" RENAME COLUMN "gcs_key" TO "s3_key"`);
    await queryRunner.query(
      `COMMENT ON COLUMN "export_batch_file"."s3_key" IS 'Chave S3 do arquivo'`,
    );
  }
}
