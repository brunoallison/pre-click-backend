---
name: testing
description: Estratégia de testes do pedido-backend — Vitest + Testcontainers, padrões de seed, anti-padrões. Use ao escrever ou revisar testes.
---
# Testes — pedido-backend

## Tipos de teste

| Tipo | Runner | Infra | Config |
|------|--------|-------|--------|
| E2E (integração) | Vitest + supertest | PostgreSQL real via Testcontainers | `vitest.e2e.config.ts` |
| Unitário | Vitest | mocks em memória | `vitest.unit.config.ts` |

**Regra geral**: prefira E2E. Teste unitário é reservado para lógica algorítmica pura (parsers, calculadores de grade, formatadores de export) onde subir um banco seria overkill. Toda Task com lógica de negócio tem cobertura E2E.

---

## E2E — setup e estrutura

### Infraestrutura

- PostgreSQL isolado via `@testcontainers/postgresql` — banco real, não SQLite, não mock.
- App Express iniciado uma vez em `tests/e2e/setup/global-setup.ts` antes de todos os testes.
- Cada arquivo de teste chama `clearDatabase()` no `beforeEach` — nunca compartilhar estado entre testes.

### Estrutura de arquivo

```typescript
// tests/e2e/<módulo>/<recurso>.test.ts
import { getApp } from '../setup/app'
import { clearDatabase } from '../setup/db'
import { VALID_TENANT_ID, seedTenant, seedUser } from '../setup/'
import request from 'supertest'

describe('[Módulo] — [Recurso]', () => {
  const app = getApp()

  beforeEach(async () => {
    await clearDatabase()
  })

  it('deve retornar os pedidos com status 200', async () => {
    const { headers } = await seedUser({ role: 'user', tenantId: VALID_TENANT_ID })

    const response = await request(app)
      .get('/api/v1/orders')
      .set(headers)

    expect(response.status).toBe(200)
    expect(response.body.data).toBeInstanceOf(Array)
  })
})
```

### Autenticação nos testes

Diferente do taya-credit-engine (que usava `x-tenant-id` de header), aqui toda rota tenant-scoped exige JWT real:

```typescript
// tests/e2e/setup/auth.ts — helper recomendado
export async function seedUser(opts: {
  role: 'user' | 'super_admin';
  tenantId?: string;
}): Promise<{
  user: UserEntity;
  headers: Record<string, string>;
}> {
  // cria user + tenant no banco + emite JWT real
  // retorna { user, headers: { Authorization: 'Bearer <token>' } }
}
```

**NUNCA** usar `x-tenant-id` como header — este backend não tem esse padrão. O `tenant_id` vem exclusivamente do JWT.

---

## Casos obrigatórios por endpoint

Para cada novo endpoint, a cobertura mínima é:

1. **Caminho feliz** — input válido → status esperado + shape da resposta.
2. **Token ausente** → 401.
3. **Role errado** (ex: user chamando rota de admin) → 403.
4. **DTO inválido** → 422 com mensagem em português.
5. **Isolamento de tenant** — tenant A não consegue acessar dados do tenant B (retorna 404, não 403 — jamais revelar existência).
6. **Regra de negócio** — ao menos 1 caso testando a restrição principal (ex: pedido `closed` bloqueando upsert).

---

## Fixtures e helpers

### Seeds disponíveis (criar em `tests/e2e/setup/seeds/`)

| Helper | O que cria |
|--------|-----------|
| `seedTenant()` | Linha em `tenant` + retorna `tenantId` |
| `seedUser({ role, tenantId })` | User + JWT assinado com o secret do env de teste |
| `seedCollection({ code })` | Coleção (`SS27`, `FW26`) |
| `seedProduct({ collectionId, division })` | Produto com sizes e cluster availability |
| `seedStore({ tenantId, cluster })` | Loja com `customer_id_sap` preenchido |
| `seedGrade({ collectionId, tenantId? })` | Grade global (tenantId NULL) ou tenant-scoped |
| `seedOrder({ tenantId, storeId, collectionId })` | Pedido em `draft` |

**Nunca redefinir constantes** já exportadas de `tests/e2e/setup/` — importar.

---

## Anti-padrões (proibidos)

| Anti-padrão | Problema | Alternativa |
|-------------|---------|-------------|
| Compartilhar estado entre testes | Testes flaky (ordem-dependentes) | `clearDatabase()` em `beforeEach` |
| Usar `x-tenant-id` header | Esse header não existe neste backend | JWT via `seedUser()` |
| `mockReturnValue` em async | Ignora a promise | `mockResolvedValue()` |
| `jest.*` em qualquer lugar | Não é Jest — é Vitest | `vi.fn()`, `vi.spyOn()` |
| Redefinir `VALID_TENANT_ID` no test file | Desvio silencioso de fixture | Importar de `tests/e2e/setup/` |
| Iniciar o Express dentro de um teste | Lifecycle fora de controle | Global-setup cuida disso |
| Testar só o caminho feliz | Falsa confiança | 6 casos obrigatórios acima |
| `sleep()` para aguardar async | Flaky em CI lento | `await` + helpers de polling determinístico |
| Chamar S3 / Anthropic real em teste | Custo + flakiness | Fake providers via `USE_FAKES=true` |

---

## Testes unitários — quando usar

Reserve para:
- **Parsers Excel** (`base-parser.provider.ts`) — testar filas de dados com buffers de fixtures.
- **Calculadores de grade** — dado grade + multiplier, valida expansão por tamanho.
- **Formatadores de export** — dado `OrderItemOutput[]`, valida as 24 colunas do CLICK.
- **Resolução de `restriction_scope`** — dado cluster + loja, retorna `required | optional | forbidden`.
- **`cluster-restriction.service.ts`** — lógica de matching de alias (`IPA` → `LIKE '%IPANEMA%'`).

Não use unitários para Tasks — elas dependem de TypeORM e têm lógica de domínio que precisa de banco real.

---

## Comandos

```bash
npm run test:e2e             # todos os testes E2E (Vitest + Testcontainers)
npm run test:e2e -- --watch  # watch mode
npm run test:unit            # unitários
npm run test:unit -- --watch # watch mode
```

---

## CI

- E2E roda com `NODE_ENV=test` e `USE_FAKES=true` (providers externos usando fakes).
- Testcontainers sobe Postgres 16 automaticamente — sem `docker-compose up` manual.
- Timeout por teste: 30s. Se ultrapassar, provavelmente tem `await` faltando.
