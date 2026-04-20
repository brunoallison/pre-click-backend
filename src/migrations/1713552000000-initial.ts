import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Initial1713552000000 implements MigrationInterface {
  name = 'Initial1713552000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`
      CREATE TABLE "tenant" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "slug" text NOT NULL UNIQUE,
        "display_name" text NOT NULL,
        "status" text NOT NULL DEFAULT 'active',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      COMMENT ON TABLE "tenant" IS 'Grupo de franqueados (rede). Unidade de isolamento e venda.';
    `);

    await queryRunner.query(`
      CREATE TABLE "user" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid REFERENCES "tenant"("id") ON DELETE RESTRICT,
        "email" text NOT NULL,
        "password_hash" text NOT NULL,
        "display_name" text NOT NULL,
        "role" text NOT NULL DEFAULT 'user',
        "is_active" boolean NOT NULL DEFAULT true,
        "last_login_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT user_role_tenant_check CHECK (
          (role = 'super_admin' AND tenant_id IS NULL)
          OR (role = 'user' AND tenant_id IS NOT NULL)
        )
      );
      CREATE UNIQUE INDEX "user_email_unique" ON "user" ("email");
      CREATE INDEX "user_tenant_role" ON "user" ("tenant_id", "role");
      COMMENT ON TABLE "user" IS 'Operadores (tenant-scoped) e super_admins (global).';
    `);

    await queryRunner.query(`
      CREATE TABLE "refresh_token" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "tenant_id" uuid REFERENCES "tenant"("id") ON DELETE SET NULL,
        "expires_at" timestamptz NOT NULL,
        "revoked_at" timestamptz,
        "user_agent" text,
        "ip" inet,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "refresh_token_user_active" ON "refresh_token" ("user_id") WHERE "revoked_at" IS NULL;
      CREATE INDEX "refresh_token_expires" ON "refresh_token" ("expires_at");
      COMMENT ON TABLE "refresh_token" IS 'Refresh tokens persistidos para revogação (source of truth); Redis é fast-path.';
    `);

    await queryRunner.query(`
      CREATE TABLE "collection" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "code" text NOT NULL,
        "country" text NOT NULL,
        "name" text NOT NULL,
        "status" text NOT NULL DEFAULT 'draft',
        "order_start_at" timestamptz,
        "order_end_at" timestamptz,
        "delivery_start_at" timestamptz,
        "delivery_end_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX "collection_code_country_unique" ON "collection" ("code", "country");
      COMMENT ON TABLE "collection" IS 'Coleção Adidas (ex: SS27 BR). GLOBAL — todos os tenants compartilham.';
    `);

    await queryRunner.query(`
      CREATE TABLE "store" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE RESTRICT,
        "customer_id_sap" bigint,
        "legal_name" text NOT NULL,
        "display_name" text NOT NULL,
        "store_number" int,
        "country" text NOT NULL DEFAULT 'BR',
        "store_concept" text NOT NULL,
        "cluster" text,
        "city" text,
        "state" text,
        "status_comp" text NOT NULL DEFAULT 'COMP',
        "is_dummy" boolean NOT NULL DEFAULT false,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "store_tenant_active_dummy" ON "store" ("tenant_id", "is_active", "is_dummy");
      CREATE UNIQUE INDEX "store_tenant_customer_unique" ON "store" ("tenant_id", "customer_id_sap") WHERE "customer_id_sap" IS NOT NULL;
      CREATE INDEX "store_tenant_status" ON "store" ("tenant_id", "status_comp");
      COMMENT ON TABLE "store" IS 'Loja física de um tenant (franqueado).';
    `);

    await queryRunner.query(`
      CREATE TABLE "store_profile" (
        "store_id" uuid PRIMARY KEY REFERENCES "store"("id") ON DELETE CASCADE,
        "address" text,
        "city" text,
        "state" text,
        "manager_name" text,
        "manager_phone" text,
        "notes" text,
        "custom_fields" jsonb NOT NULL DEFAULT '{}',
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      COMMENT ON TABLE "store_profile" IS 'Camada editável pelo franqueado.';
    `);

    await queryRunner.query(`
      CREATE TABLE "tenant_budget" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
        "collection_id" uuid NOT NULL REFERENCES "collection"("id") ON DELETE RESTRICT,
        "amount_brl" numeric(14,2) NOT NULL,
        "updated_by" uuid REFERENCES "user"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX "tenant_budget_unique" ON "tenant_budget" ("tenant_id", "collection_id");
      COMMENT ON TABLE "tenant_budget" IS 'Budget consolidado do tenant por coleção.';
    `);

    await queryRunner.query(`
      CREATE TABLE "store_budget" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
        "store_id" uuid NOT NULL REFERENCES "store"("id") ON DELETE CASCADE,
        "collection_id" uuid NOT NULL REFERENCES "collection"("id") ON DELETE RESTRICT,
        "amount_brl" numeric(14,2) NOT NULL,
        "updated_by" uuid REFERENCES "user"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX "store_budget_unique" ON "store_budget" ("store_id", "collection_id");
      CREATE INDEX "store_budget_tenant_collection" ON "store_budget" ("tenant_id", "collection_id");
      COMMENT ON TABLE "store_budget" IS 'Budget por (store, collection).';
    `);

    await queryRunner.query(`
      CREATE TABLE "import_base" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "collection_id" uuid NOT NULL REFERENCES "collection"("id") ON DELETE RESTRICT,
        "country" text NOT NULL,
        "version_tag" text NOT NULL,
        "is_initial" boolean NOT NULL DEFAULT false,
        "file_name" text NOT NULL,
        "s3_key" text NOT NULL,
        "status" text NOT NULL DEFAULT 'pending',
        "rows_total" int,
        "rows_new" int,
        "rows_updated" int,
        "rows_removed" int,
        "error_message" text,
        "uploaded_by" uuid NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
        "uploaded_at" timestamptz NOT NULL DEFAULT now(),
        "completed_at" timestamptz
      );
      CREATE UNIQUE INDEX "import_base_collection_version_unique" ON "import_base" ("collection_id", "version_tag");
      CREATE INDEX "import_base_collection_created" ON "import_base" ("collection_id", "uploaded_at");
      COMMENT ON TABLE "import_base" IS 'Histórico de importações de BASE da Adidas. GLOBAL.';
    `);

    await queryRunner.query(`
      CREATE TABLE "import_base_diff" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "import_base_id" uuid NOT NULL REFERENCES "import_base"("id") ON DELETE CASCADE,
        "article_sku" text NOT NULL,
        "change_type" text NOT NULL,
        "fields_changed" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "import_base_diff_import_change" ON "import_base_diff" ("import_base_id", "change_type");
      COMMENT ON TABLE "import_base_diff" IS 'Diff linha-a-linha de um import vs versão anterior.';
    `);

    await queryRunner.query(`
      CREATE TABLE "product" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "collection_id" uuid NOT NULL REFERENCES "collection"("id") ON DELETE CASCADE,
        "article_sku" text NOT NULL,
        "model" text,
        "local_description" text NOT NULL,
        "key_category" text,
        "category" text,
        "business_segment" text,
        "sales_line" text,
        "division" text NOT NULL,
        "prod_group" text,
        "prod_type" text,
        "gender" text,
        "age_group" text,
        "color" text,
        "local_rid" date NOT NULL,
        "local_red" date,
        "campaign" text,
        "hero_halo" text,
        "pack" text,
        "building_blocks" text,
        "develop_type" text,
        "exclusive" boolean NOT NULL DEFAULT false,
        "clients" text,
        "sourcing_type" text,
        "origin_vendor" text,
        "rrp" numeric(10,2) NOT NULL,
        "markup" numeric(6,3),
        "vol_minimo" int NOT NULL,
        "removed_at" timestamptz,
        "raw" jsonb NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX "product_collection_sku_unique" ON "product" ("collection_id", "article_sku");
      CREATE INDEX "product_collection_category" ON "product" ("collection_id", "category");
      CREATE INDEX "product_collection_division" ON "product" ("collection_id", "division");
      COMMENT ON TABLE "product" IS 'SKU da coleção — GLOBAL, vem da BASE Adidas.';
    `);

    await queryRunner.query(`
      CREATE TABLE "product_size_list" (
        "product_id" uuid PRIMARY KEY REFERENCES "product"("id") ON DELETE CASCADE,
        "sizes" text[] NOT NULL
      );
      COMMENT ON TABLE "product_size_list" IS 'Lista de tamanhos do produto.';
    `);

    await queryRunner.query(`
      CREATE TABLE "product_cluster_availability" (
        "product_id" uuid NOT NULL REFERENCES "product"("id") ON DELETE CASCADE,
        "cluster" text NOT NULL,
        "availability" text NOT NULL,
        "restriction_scope" text,
        "raw_value" text NOT NULL,
        "imported_from" uuid NOT NULL REFERENCES "import_base"("id") ON DELETE RESTRICT,
        PRIMARY KEY ("product_id", "cluster")
      );
      CREATE INDEX "pca_cluster_availability" ON "product_cluster_availability" ("cluster", "availability");
      CREATE INDEX "pca_restriction_scope" ON "product_cluster_availability" ("restriction_scope") WHERE "restriction_scope" IS NOT NULL;
      COMMENT ON TABLE "product_cluster_availability" IS 'Classificação (0/1/OP) do produto por cluster.';
    `);

    await queryRunner.query(`
      CREATE TABLE "product_image" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "product_id" uuid NOT NULL REFERENCES "product"("id") ON DELETE CASCADE,
        "tenant_id" uuid REFERENCES "tenant"("id") ON DELETE CASCADE,
        "url" text NOT NULL,
        "position" int NOT NULL DEFAULT 0,
        "is_primary" boolean NOT NULL DEFAULT false,
        "source" text NOT NULL,
        "uploaded_by" uuid REFERENCES "user"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "product_image_product_tenant" ON "product_image" ("product_id", "tenant_id");
      COMMENT ON TABLE "product_image" IS 'Imagens do produto (feed oficial ou upload tenant).';
    `);

    await queryRunner.query(`
      CREATE TABLE "grade" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "collection_id" uuid NOT NULL REFERENCES "collection"("id") ON DELETE CASCADE,
        "tenant_id" uuid REFERENCES "tenant"("id") ON DELETE CASCADE,
        "code" text NOT NULL,
        "total_pieces" int NOT NULL,
        "is_system" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX "grade_collection_tenant_code_unique" ON "grade" ("collection_id", "tenant_id", "code");
      COMMENT ON TABLE "grade" IS 'Grade (distribuição por tamanho).';
    `);

    await queryRunner.query(`
      CREATE TABLE "grade_size_qty" (
        "grade_id" uuid NOT NULL REFERENCES "grade"("id") ON DELETE CASCADE,
        "size" text NOT NULL,
        "qty" int NOT NULL CHECK (qty > 0),
        PRIMARY KEY ("grade_id", "size")
      );
      COMMENT ON TABLE "grade_size_qty" IS 'Qty por tamanho dentro de uma grade.';
    `);

    await queryRunner.query(`
      CREATE TABLE "rdd" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "collection_id" uuid NOT NULL REFERENCES "collection"("id") ON DELETE CASCADE,
        "serial" int NOT NULL,
        "date" date NOT NULL,
        "label" text
      );
      CREATE UNIQUE INDEX "rdd_collection_serial_unique" ON "rdd" ("collection_id", "serial");
      COMMENT ON TABLE "rdd" IS 'Códigos de data de entrega por coleção.';
    `);

    await queryRunner.query(`
      CREATE TABLE "order" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE RESTRICT,
        "collection_id" uuid NOT NULL REFERENCES "collection"("id") ON DELETE RESTRICT,
        "store_id" uuid NOT NULL REFERENCES "store"("id") ON DELETE RESTRICT,
        "status" text NOT NULL DEFAULT 'draft',
        "created_by" uuid NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX "order_collection_store_unique" ON "order" ("collection_id", "store_id");
      CREATE INDEX "order_tenant_collection_status" ON "order" ("tenant_id", "collection_id", "status");
      COMMENT ON TABLE "order" IS 'Pedido de 1 loja × 1 coleção.';
    `);

    await queryRunner.query(`
      CREATE TABLE "order_item" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
        "order_id" uuid NOT NULL REFERENCES "order"("id") ON DELETE CASCADE,
        "product_id" uuid NOT NULL REFERENCES "product"("id") ON DELETE RESTRICT,
        "grade_id" uuid NOT NULL REFERENCES "grade"("id") ON DELETE RESTRICT,
        "multiplier" int NOT NULL DEFAULT 1 CHECK (multiplier >= 0),
        "rdd_override_serial" int,
        "override_forbidden" boolean NOT NULL DEFAULT false,
        "override_reason" text,
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX "order_item_uniq"
        ON "order_item" ("order_id", "product_id", "grade_id", COALESCE("rdd_override_serial", -1));
      CREATE INDEX "order_item_tenant_order" ON "order_item" ("tenant_id", "order_id");
      COMMENT ON TABLE "order_item" IS 'Linha do pedido (produto × grade × multiplier × RDD opcional).';
    `);

    await queryRunner.query(`
      CREATE TABLE "export_batch" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
        "order_id" uuid NOT NULL REFERENCES "order"("id") ON DELETE CASCADE,
        "parent_batch_id" uuid REFERENCES "export_batch"("id") ON DELETE SET NULL,
        "strategy" text NOT NULL,
        "chunk_size_limit" int NOT NULL DEFAULT 400,
        "total_rows" int NOT NULL,
        "total_files" int NOT NULL,
        "triggered_by" uuid NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "export_batch_tenant_order" ON "export_batch" ("tenant_id", "order_id");
      COMMENT ON TABLE "export_batch" IS 'Batch de exportação de um pedido para o Click.';
    `);

    await queryRunner.query(`
      CREATE TABLE "export_batch_file" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "batch_id" uuid NOT NULL REFERENCES "export_batch"("id") ON DELETE CASCADE,
        "sequence" int NOT NULL,
        "file_name" text NOT NULL,
        "s3_key" text NOT NULL,
        "row_count" int NOT NULL,
        "rdd" int,
        "store_id" uuid REFERENCES "store"("id") ON DELETE SET NULL,
        "status" text NOT NULL DEFAULT 'ready',
        "downloaded_at" timestamptz,
        "sent_at" timestamptz,
        "error_file_id" uuid
      );
      CREATE UNIQUE INDEX "export_batch_file_batch_seq_unique" ON "export_batch_file" ("batch_id", "sequence");
      COMMENT ON TABLE "export_batch_file" IS 'Arquivo .xlsx individual gerado no batch.';
    `);

    await queryRunner.query(`
      CREATE TABLE "click_error_file" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "export_batch_file_id" uuid NOT NULL REFERENCES "export_batch_file"("id") ON DELETE CASCADE,
        "s3_key" text NOT NULL,
        "uploaded_by" uuid NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
        "total_errors" int NOT NULL,
        "uploaded_at" timestamptz NOT NULL DEFAULT now()
      );
      COMMENT ON TABLE "click_error_file" IS 'Planilha de erros devolvida pelo Click.';
    `);

    await queryRunner.query(`
      ALTER TABLE "export_batch_file"
      ADD CONSTRAINT "export_batch_file_error_file_fk"
      FOREIGN KEY ("error_file_id") REFERENCES "click_error_file"("id") ON DELETE SET NULL;
    `);

    await queryRunner.query(`
      CREATE TABLE "click_error_row" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "click_error_file_id" uuid NOT NULL REFERENCES "click_error_file"("id") ON DELETE CASCADE,
        "article_sku" text NOT NULL,
        "size" text NOT NULL,
        "error_code" text,
        "error_message" text NOT NULL,
        "raw_row" jsonb NOT NULL,
        "linked_order_item_id" uuid REFERENCES "order_item"("id") ON DELETE SET NULL,
        "resolution" text NOT NULL DEFAULT 'open'
      );
      CREATE INDEX "click_error_row_file_resolution" ON "click_error_row" ("click_error_file_id", "resolution");
      COMMENT ON TABLE "click_error_row" IS 'Linha individual de erro retornada pelo Click.';
    `);

    await queryRunner.query(`
      CREATE TABLE "ai_context" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
        "source" text NOT NULL,
        "collection_ref" text,
        "payload" jsonb NOT NULL,
        "row_count" int NOT NULL,
        "uploaded_by" uuid REFERENCES "user"("id") ON DELETE SET NULL,
        "uploaded_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "ai_context_tenant_source_ref" ON "ai_context" ("tenant_id", "source", "collection_ref");
      COMMENT ON TABLE "ai_context" IS 'Contexto carregado pelo tenant para alimentar o LLM.';
    `);

    await queryRunner.query(`
      CREATE TABLE "ai_call" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
        "user_id" uuid REFERENCES "user"("id") ON DELETE SET NULL,
        "kind" text NOT NULL,
        "order_id" uuid REFERENCES "order"("id") ON DELETE SET NULL,
        "input_tokens" int,
        "output_tokens" int,
        "latency_ms" int,
        "cached" boolean NOT NULL DEFAULT false,
        "error" text,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "ai_call_tenant_created" ON "ai_call" ("tenant_id", "created_at");
      COMMENT ON TABLE "ai_call" IS 'Observabilidade/custo de chamadas ao LLM por tenant.';
    `);

    await queryRunner.query(`
      CREATE TABLE "cluster_restriction_alias" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "alias" text NOT NULL,
        "match_kind" text NOT NULL,
        "patterns" jsonb NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX "cluster_restriction_alias_unique" ON "cluster_restriction_alias" ("alias");
      COMMENT ON TABLE "cluster_restriction_alias" IS 'Aliases de restriction_scope (ex: IPA → %IPANEMA%).';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'cluster_restriction_alias',
      'ai_call',
      'ai_context',
      'click_error_row',
      'click_error_file',
      'export_batch_file',
      'export_batch',
      'order_item',
      'order',
      'rdd',
      'grade_size_qty',
      'grade',
      'product_image',
      'product_cluster_availability',
      'product_size_list',
      'product',
      'import_base_diff',
      'import_base',
      'store_budget',
      'tenant_budget',
      'store_profile',
      'store',
      'collection',
      'refresh_token',
      'user',
      'tenant',
    ];
    for (const t of tables) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${t}" CASCADE`);
    }
  }
}
