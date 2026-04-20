/**
 * Setup global para testes E2E.
 * Executado antes de qualquer arquivo de teste via setupFiles.
 * Define variáveis de ambiente placeholder para satisfazer env.ts durante a importação.
 * O helper app.helper.ts sobrescreve os valores reais após subir o Testcontainers.
 */

// Variáveis placeholder — satisfazem a validação de env.ts no momento do import.
// Os valores de POSTGRES_* são substituídos pelo helper após subir o container.
process.env['NODE_ENV'] = 'test';
process.env['POSTGRES_USERNAME'] = 'pedido';
process.env['POSTGRES_PASSWORD'] = 'pedido';
process.env['POSTGRES_DATABASE'] = 'pedido_test';
process.env['POSTGRES_HOST'] = '127.0.0.1';
process.env['REDIS_HOST'] = '127.0.0.1';
process.env['JWT_SECRET'] = 'test-secret-for-e2e-tests-min-16';
process.env['GCS_BUCKET_NAME'] = 'fake-bucket-e2e';
process.env['COOKIE_DOMAIN'] = 'localhost';

// Garante que reflect-metadata é carregado antes de qualquer decorador
import 'reflect-metadata';
