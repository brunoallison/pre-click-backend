import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cria as tabelas ai_conversation e ai_message para o sistema de conversas
 * persistentes com o assistente IA (skill-based, com tool_use Anthropic).
 *
 * Mudanças:
 *   - Cria tabela ai_conversation (conversa persistente por tenant/user).
 *   - Cria tabela ai_message (mensagens com blocos de conteúdo jsonb).
 *   - Índices para queries de listagem e histórico.
 */
export class CreateAiConversations1778000000000 implements MigrationInterface {
  name = 'CreateAiConversations1778000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Cria tabela ai_conversation
    await queryRunner.query(`
      CREATE TABLE "ai_conversation" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "created_by" uuid NOT NULL,
        "visibility" text NOT NULL DEFAULT 'tenant',
        "title" text,
        "archived_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_ai_conversation" PRIMARY KEY ("id"),
        CONSTRAINT "fk_ai_conversation_tenant"
          FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_ai_conversation_created_by"
          FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "ai_conversation_tenant_created" ON "ai_conversation" ("tenant_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ai_conversation_tenant_user" ON "ai_conversation" ("tenant_id", "created_by")`,
    );

    await queryRunner.query(
      `COMMENT ON TABLE "ai_conversation" IS 'Conversa persistente com o assistente IA.'`,
    );
    await queryRunner.query(`COMMENT ON COLUMN "ai_conversation"."tenant_id" IS 'FK tenant'`);
    await queryRunner.query(
      `COMMENT ON COLUMN "ai_conversation"."created_by" IS 'FK user criador'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "ai_conversation"."visibility" IS 'tenant = visível a todos do tenant | private = só o criador'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "ai_conversation"."title" IS 'Título auto-gerado da primeira mensagem (primeiros 60 chars)'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "ai_conversation"."archived_at" IS 'Preenchido quando arquivada'`,
    );

    // 2) Cria tabela ai_message
    await queryRunner.query(`
      CREATE TABLE "ai_message" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "conversation_id" uuid NOT NULL,
        "user_id" uuid,
        "role" text NOT NULL,
        "content" jsonb NOT NULL,
        "tokens_input" integer,
        "tokens_output" integer,
        "model" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_ai_message" PRIMARY KEY ("id"),
        CONSTRAINT "fk_ai_message_conversation"
          FOREIGN KEY ("conversation_id") REFERENCES "ai_conversation"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_ai_message_user"
          FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "ai_message_conversation_created" ON "ai_message" ("conversation_id", "created_at")`,
    );

    await queryRunner.query(
      `COMMENT ON TABLE "ai_message" IS 'Mensagem individual dentro de uma conversa IA.'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "ai_message"."conversation_id" IS 'FK ai_conversation'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "ai_message"."user_id" IS 'FK user — NULL para mensagens de assistente/tool'`,
    );
    await queryRunner.query(`COMMENT ON COLUMN "ai_message"."role" IS 'user | assistant | tool'`);
    await queryRunner.query(
      `COMMENT ON COLUMN "ai_message"."content" IS 'Array de blocos de conteúdo (text, tool_use, tool_result)'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "ai_message"."tokens_input" IS 'Tokens de entrada (só mensagens de assistente)'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "ai_message"."tokens_output" IS 'Tokens de saída (só mensagens de assistente)'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "ai_message"."model" IS 'Modelo usado (ex: claude-sonnet-4-6)'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "ai_message_conversation_created"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_message"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "ai_conversation_tenant_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "ai_conversation_tenant_created"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_conversation"`);
  }
}
