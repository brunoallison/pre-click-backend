import type { Request, Response } from 'express';

export function handleEtag(req: Request, res: Response, updatedAt: Date): boolean {
  const etag = `"${updatedAt.getTime()}"`;
  if (req.header('if-none-match') === etag) {
    res.status(304).end();
    return true;
  }
  res.setHeader('ETag', etag);
  return false;
}
