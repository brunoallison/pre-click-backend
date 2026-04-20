# CLAUDE.md

## Projeto

**pedido-backend** — API do sistema **Pedido Adidas** (Express, não NestJS). Importa a BASE da Adidas (`.xlsx` multi-aba), gerencia pedidos de franquias multi-tenant e gera o export no formato Click (sheet `CLICK`, 24 colunas A-X).

Este repositório é **filho** de `../` (orquestrador `Pedido`). A verdade canônica de domínio e regras vive no pai. Leia sempre a partir daqui:

- [../CLAUDE.md](../CLAUDE.md) — papel do orquestrador e panorama
- [../.claude/docs/base-adidas.md](../.claude/docs/base-adidas.md) — estrutura real da BASE (AMD + FRA_STORES)
- [../.claude/docs/click-export.md](../.claude/docs/click-export.md) — contrato do export (sheet CLICK, 24 cols)
- [../.claude/docs/arquitetura.md](../.claude/docs/arquitetura.md) — schema Postgres multi-tenant, fases
- [../.claude/docs/backend.md](../.claude/docs/backend.md) — contrato HTTP completo, DTOs, endpoints
- [../.claude/rules/negocio.md](../.claude/rules/negocio.md) — regras de negócio (enforced aqui)
- [../mockup.html](../mockup.html) — referência de UX que o frontend consumirá; este backend serve os endpoints que ele espera

Quando mudar algo que afeta o contrato (DTO, endpoint, regra), atualize primeiro o doc no pai e referencie daqui.

- **Stack**: Node.js ≥ 22, Express 5, TypeScript 5.7+, TypeORM 0.3, PostgreSQL 16, tsyringe (DI), Pino, class-validator + class-transformer, Argon2id, JWT + refresh, Redis (fast-path de revogação + BullMQ), exceljs, Vitest + Testcontainers.

## Convenções

- **Commits**: Conventional Commits (`feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`).
- **Lint/formatação**: ESLint + Prettier em `src`. Variáveis não usadas: prefixo `_`. Zero warnings tolerados.
- **Testes**: E2E com Vitest + Testcontainers (Postgres real): `npm run test:e2e`. Unitários: `npm run test:unit`.
- **Banco**: TypeORM + migrations em `src/migrations/`. **Nunca editar migrations existentes** — sempre criar uma nova migration para qualquer correção de schema.
- **Comentários de banco (OBRIGATÓRIO)**: Toda coluna nova em entidade TypeORM inclui `comment` no decorator `@Column` descrevendo o propósito. Toda entidade nova tem `comment` no `@Entity`. As migrations correspondentes incluem `COMMENT ON COLUMN` e `COMMENT ON TABLE`.
- **Multi-tenant**: toda tabela tenant-scoped tem `tenant_id uuid NOT NULL REFERENCES tenant(id)` + índice composto `(tenant_id, <chave>)`. Toda query de serviço filtra por `tenant_id` explicitamente. `super_admin` (`tenant_id = NULL`) só acessa via rotas `/api/v1/admin/*`.
- **Validação**: DTOs com class-validator/class-transformer; mensagens para usuário em **português**.
- **Variáveis de ambiente**: definidas e validadas centralmente em `src/config/env.ts` (app) e `src/config/migration-env.ts` (banco + NODE_ENV). Nunca usar `process.env` diretamente fora desses arquivos.
- **Auth própria**: diferente do `taya-credit-engine` (que roda atrás do Apigee), este backend **implementa auth próprio** — `POST /auth/login` + refresh token em cookie httpOnly + revogação via Redis. `tenant_id` é derivado do JWT, não de header de gateway.
- **Task pattern**: cada endpoint é uma classe `@Injectable()` estendendo `Task<Output>`. Rotas são finas — só chamam `AlgumaTask.handler()`. Lógica de negócio vive no `execute()`. Ver [../.claude/docs/arquitetura.md](../.claude/docs/arquitetura.md) §Estrutura da API.

## Após implementar qualquer feature ou teste

Sempre executar os três comandos abaixo e corrigir **todos** os erros e warnings antes de considerar a tarefa concluída:

```bash
npm run format      # formata o código com Prettier
npm run lint        # verifica ESLint (zero warnings tolerados)
npm run test:e2e    # todos os testes devem passar
```

Após qualquer alteração em endpoints, DTOs, respostas ou regras de negócio:

1. Atualizar `src/docs/openapi.ts` — a spec tem que ficar em sync com os DTOs reais.
2. Se a mudança afeta o contrato HTTP, atualizar também [../.claude/docs/backend.md](../.claude/docs/backend.md) no orquestrador (pai) e sincronizar com o frontend.

## Referências

Para documentação detalhada, personas e regras locais deste subprojeto: [.claude/.context.md](.claude/.context.md).
