import type { IGcsProvider } from '../gcs.provider.interface.js';

/**
 * Provider GCS em memória para testes E2E.
 * Não bate no GCS real nem no fake-gcs-server — armazena em Map.
 * Registrar via FakeProvider('GcsProvider', new FakeGcsProvider()).
 */
export class FakeGcsProvider implements IGcsProvider {
  private readonly store = new Map<string, { buffer: Buffer; contentType: string }>();

  async upload(key: string, buffer: Buffer, contentType: string): Promise<void> {
    this.store.set(key, { buffer, contentType });
  }

  async download(key: string): Promise<Buffer> {
    const entry = this.store.get(key);
    if (!entry) throw new Error(`FakeGcsProvider: chave não encontrada: ${key}`);
    return entry.buffer;
  }

  async getSignedUrl(key: string, _ttlSec: number): Promise<string> {
    if (!this.store.has(key)) throw new Error(`FakeGcsProvider: chave não encontrada: ${key}`);
    return `https://fake-gcs.local/${key}?signed=1`;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  /** Utilitário de teste: lista todas as chaves armazenadas. */
  keys(): string[] {
    return [...this.store.keys()];
  }

  /** Utilitário de teste: limpa o storage. */
  clear(): void {
    this.store.clear();
  }
}
