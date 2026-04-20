import { container } from '../utils/di.js';

// Utilitário simples para registrar fakes de providers em testes.
export function FakeProvider<T extends object>(token: string, fake: T): () => void {
  const prev = container.isRegistered(token) ? container.resolve(token) : null;
  container.register(token, { useValue: fake });
  return () => {
    if (prev !== null) container.register(token, { useValue: prev });
    else container.clearInstances();
  };
}
