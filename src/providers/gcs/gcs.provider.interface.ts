export interface IGcsProvider {
  upload(key: string, buffer: Buffer, contentType: string): Promise<void>;
  download(key: string): Promise<Buffer>;
  getSignedUrl(key: string, ttlSec: number): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
