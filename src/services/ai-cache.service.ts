import { createHash } from 'node:crypto';
import { Injectable } from '../utils/di.js';

// Stub em memória — substituir por Redis na produção.
@Injectable()
export class AiCacheService {
  private store = new Map<string, { value: unknown; expiresAt: number }>();

  hashKey(parts: Record<string, unknown>): string {
    return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32);
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  set(key: string, value: unknown, ttlSec = 60 * 60 * 24): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
  }
}
