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
  },
} as const;
