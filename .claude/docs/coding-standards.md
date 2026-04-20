---
name: coding-standards
description: Padrões de código (ESLint, Prettier, TypeScript, TypeORM, DI, DTOs). Use ao escrever ou revisar código, configurar lint ou formatar commits.
---
# Padrões de código — pedido-backend

## Ferramentas

- **ESLint** (`eslint.config.mjs`) + **Prettier** — zero warnings tolerados.
- **Commits**: Conventional Commits (`feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`).

## TypeScript

- `strict: true`. Evitar `any`; usar `unknown` com type guard.
- Funções exportadas têm tipo de retorno **explícito**.
- Alias `@/` para imports de `src/`.
- Aspas simples, vírgula final, fim de linha LF.

## ESLint

- Parser/plugin `@typescript-eslint`.
- Prettier integrado como regra.
- Variáveis não usadas: prefixo `_`.
- Ordem de imports: stdlib → externos → `@/...` → relativos.

## TypeORM

### Entidades (obrigatório)

```typescript
@Entity({ name: 'order', comment: 'Pedido de uma loja para uma coleção' })
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', comment: 'Tenant (franqueado) dono do pedido' })
  @Index()
  tenant_id!: string;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.DRAFT,
    comment: 'Estado do pedido no workflow',
  })
  status!: OrderStatus;
  // ...
}
```

Regras:
- **Toda coluna nova** tem `comment` no decorator `@Column`.
- **Toda entidade nova** tem `comment` no `@Entity`.
- Migrations correspondentes incluem `COMMENT ON COLUMN` / `COMMENT ON TABLE`.
- **Jamais editar migration existente** — toda correção é nova migration.
- Tabelas tenant-scoped: `tenant_id uuid NOT NULL REFERENCES tenant(id)` + índice composto `(tenant_id, <chave>)`.

### Queries

- `WHERE tenant_id = :tenantId` **explícito** em todo service tenant-scoped.
- Nunca `repository.find()` sem filtro de tenant em rota tenant-scoped — usar helper `tenantScoped(repo, tenantId).find(...)`.
- Uses de `QueryBuilder`: parametrizar tudo (`:param`), nunca concatenar string com dado de usuário.

## DTOs (class-validator + class-transformer)

```typescript
export class UpsertOrderItemInput {
  @IsUUID('4', { message: 'product_id deve ser UUID v4' })
  product_id!: string;

  @IsUUID('4', { message: 'grade_id deve ser UUID v4' })
  grade_id!: string;

  @IsInt({ message: 'multiplier deve ser inteiro' })
  @Min(0, { message: 'multiplier não pode ser negativo' })
  multiplier!: number;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => OverrideDto)
  overrides?: OverrideDto[];
}
```

- Mensagens em **português** (`message: '...'`).
- DTOs vivem em `src/modules/<dom>/dto/`. **Não compartilhar** entre módulos — promover para `types/` se realmente transversal.
- Transform `@Type(() => Class)` em todo nested object (senão class-validator não desce).

## DI (tsyringe)

- Tokens de repositório via string: `@Inject('OrderRepository')`. Registrados em loop no `utils/di.ts` a partir de `entities/index.ts`.
- Providers externos via token: `@Inject('AnthropicProvider')`. Fakes para teste via decorator `@FakeProvider`.
- **Nunca** `container.resolve()` dentro de `execute()` — injetar no construtor.
- **Nunca** `new RepositoryX()` — sempre via container.

## Task pattern

- Um arquivo por Task em `src/modules/<dom>/tasks/<verbo>-<recurso>.task.ts`.
- Nome do arquivo = nome da classe kebab-case: `UpsertOrderItemTask` → `upsert-order-item.task.ts`.
- Rota consome via `AlgumaTask.handler()`; **nunca** lógica na rota.
- Workers (BullMQ) reusam via `task.runAsJobBase({ body: job.data })`.

## Variáveis de ambiente

- **Jamais** `process.env.FOO` direto em módulo de negócio.
- `src/config/env.ts` — env do app (validado no boot com class-validator ou Zod).
- `src/config/migration-env.ts` — env específico de CLI de migration.
- Adicionar env novo: declarar em `env.ts` + `.env.example` + docs no pai se for contrato externo.

## Logs (Pino)

```typescript
const log = logger.child({ trace_id: req.requestId, tenant_id: req.tenantId });
log.info({ order_id: orderId }, 'order_upserted');
```

- **Nunca** logar PII em claro: CPF, email, password, token, `password_hash`, `refresh_token`.
- Chaves em snake_case.
- Sampling em endpoints hot (dashboard, health) — `pino.pinoHttp` com `autoLogging: false` e log manual.

## Erros

- `HttpError.NotFound('order_not_found')` — thin class com `status`, `code`, `message`, `details`.
- `error-handler.middleware.ts` converte para o envelope `{ error: { code, message, details } }`.
- **Nunca** `throw new Error('string')` em execute — usar `HttpError.*`.
- Erros de domínio que não tem HTTP óbvio: 422 com `code` específico.

## Mocks e providers externos

- Todo provider externo (Anthropic, S3, SMTP) tem **interface** em `providers/<name>/index.ts` + implementação real + fake.
- Fake registrado via `@FakeProvider` quando `NODE_ENV === 'test'` ou flag `USE_FAKES=true`.
- Mocks refletem o contrato real — mudou o provider, atualiza o mock **no mesmo commit**.

## Convenções gerais

- Código em **inglês** (identificadores, comentários técnicos); mensagens de erro para usuário em **português**.
- Arquivos: kebab-case (`order-expansion.service.ts`).
- Classes/Tipos: PascalCase.
- Funções/variáveis: camelCase.
- Constantes de módulo: SCREAMING_SNAKE_CASE.
- Uma responsabilidade por arquivo/classe/função.
- Evitar funções > 50 linhas; extrair.
- Evitar arquivos > 300 linhas; partir em sub-módulos.

## Comentários de código

- Comentários explicam **por que**, não **o que**. O código mostra o que.
- Comentário obrigatório quando há regra de negócio não óbvia no corpo da função (`// qty zero nunca exporta — veja business-rules.md §7.3`).

## Após qualquer mudança

```bash
npm run format
npm run lint        # zero warnings
npm run test:e2e
```

Atualizar `src/docs/openapi.ts` se alterou contrato.
Atualizar `../../../.claude/docs/backend.md` se alterou contrato (para o frontend).
