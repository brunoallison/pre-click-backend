// Esqueleto do OpenAPI. Atualizar a cada mudança de DTO/endpoint (regra do CLAUDE.md).
export const openapiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Pedido Adidas API',
    version: '0.1.0',
    description: 'API do Pedido Adidas — importa BASE, gerencia pedidos, exporta Click.',
  },
  servers: [{ url: '/api/v1' }],
  paths: {
    '/auth/login': {
      post: {
        summary: 'Login com email e senha',
        responses: { '200': { description: 'ok' } },
      },
    },
    '/auth/me': {
      get: {
        summary: 'Retorna user + tenant do token',
        responses: { '200': { description: 'ok' } },
      },
    },
    '/health': {
      get: {
        summary: 'Liveness',
        responses: { '200': { description: 'ok' } },
      },
    },
    '/ai/chat': {
      post: {
        summary: 'Chat com assistente de IA (pt-BR)',
        responses: { '200': { description: 'ok' } },
      },
    },
    '/ai/suggest-grade': {
      post: {
        summary: 'Sugerir grade + multiplicador para um SKU',
        responses: { '200': { description: 'ok' } },
      },
    },
    '/ai/context': {
      get: {
        summary: 'Listar contextos carregados pelo tenant',
        responses: { '200': { description: 'ok' } },
      },
    },
    '/ai/context/upload': {
      post: {
        summary: 'Upload de contexto (xlsx multipart)',
        responses: { '200': { description: 'ok' } },
      },
    },
    '/ai/context/{id}': {
      delete: {
        summary: 'Remover contexto por id',
        responses: { '204': { description: 'ok' } },
      },
    },
    '/tenant-budget': {
      get: {
        summary: 'Obter budget consolidado do tenant por coleção',
        responses: { '200': { description: 'ok' } },
      },
      put: {
        summary: 'Definir budget consolidado do tenant',
        responses: { '200': { description: 'ok' } },
      },
    },
    '/tenant-budget/stores/{id}': {
      put: {
        summary: 'Definir budget de uma loja na coleção',
        responses: { '200': { description: 'ok' } },
      },
    },
    '/batches': {
      get: {
        summary: 'Listar pedidos (OrderBatch) do tenant com agregados',
        description:
          'Filtros: collection_id (UUID), status (draft|baixado). Retorna { items: OrderBatchSummaryOutput[] }.',
        parameters: [
          { in: 'query', name: 'collection_id', schema: { type: 'string', format: 'uuid' } },
          { in: 'query', name: 'status', schema: { type: 'string', enum: ['draft', 'baixado'] } },
        ],
        responses: {
          '200': {
            description: 'Lista de batches com store_count, item_count, total_pieces',
          },
        },
      },
      post: {
        summary: 'Criar pedido nomeado (OrderBatch) + N Orders (1 por loja)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'collection_id', 'store_ids'],
                properties: {
                  name: { type: 'string', minLength: 2, maxLength: 120 },
                  collection_id: { type: 'string', format: 'uuid' },
                  store_ids: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 200,
                    items: { type: 'string', format: 'uuid' },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'OrderBatchDetailOutput — batch criado com store_ids' },
          '409': { description: 'batch_name_conflict — nome já existe na (tenant, collection)' },
        },
      },
    },
    '/batches/{id}': {
      get: {
        summary: 'Detalhe do batch com store_ids e contadores',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'OrderBatchDetailOutput' },
          '404': { description: 'batch_not_found' },
        },
      },
      patch: {
        summary: 'Renomear batch',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: { name: { type: 'string', minLength: 2, maxLength: 120 } },
              },
            },
          },
        },
        responses: {
          '200': { description: '{ id, name, updated_at }' },
          '409': { description: 'batch_name_conflict' },
        },
      },
      delete: {
        summary: 'Remover batch e orders cascata',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '204': { description: 'Removido' },
          '404': { description: 'batch_not_found' },
        },
      },
    },
    '/batches/{id}/duplicate': {
      post: {
        summary: 'Clonar estrutura do batch (mesmas lojas, sem itens)',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: { name: { type: 'string', minLength: 2, maxLength: 120 } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'OrderBatchDetailOutput — novo batch' },
          '409': { description: 'batch_name_conflict' },
        },
      },
    },
    '/batches/{id}/export': {
      post: {
        summary: 'Exportar todas as orders do batch; atualiza export_count e status=baixado',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description:
              'OrderBatchExportOutput — { batch_id, export_count, last_exported_at, total_files, total_rows, export_batch_ids, zip_ready }',
          },
          '422': { description: 'empty_batch ou all_orders_failed' },
        },
      },
    },
    '/batches/{id}/zip': {
      get: {
        summary: 'Download ZIP com todos os arquivos da última exportação do batch',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'application/zip — arquivo ZIP para download' },
          '404': { description: 'not_exported | no_export | no_files' },
        },
      },
    },
  },
} as const;
