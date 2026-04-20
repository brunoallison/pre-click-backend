import type { Request, RequestHandler } from 'express';
import { HttpError } from '../utils/error.js';

interface Bucket {
  tokens: number;
  updatedAt: number;
}

interface Options {
  capacity: number;
  refillPerSec: number;
  keyFn?: (req: Request) => string;
}

export function rateLimit(opts: Options): RequestHandler {
  const buckets = new Map<string, Bucket>();
  const keyFn = opts.keyFn ?? ((req) => req.ip ?? 'unknown');

  return (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    const bucket = buckets.get(key) ?? { tokens: opts.capacity, updatedAt: now };
    const elapsed = (now - bucket.updatedAt) / 1000;
    bucket.tokens = Math.min(opts.capacity, bucket.tokens + elapsed * opts.refillPerSec);
    bucket.updatedAt = now;

    if (bucket.tokens < 1) {
      const resetSec = Math.ceil((1 - bucket.tokens) / opts.refillPerSec);
      res.setHeader('X-RateLimit-Reset', String(resetSec));
      throw HttpError.TooMany('rate_limited', 'Muitas requisições — aguarde e tente novamente');
    }
    bucket.tokens -= 1;
    buckets.set(key, bucket);
    next();
  };
}
