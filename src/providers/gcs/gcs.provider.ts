import { Storage } from '@google-cloud/storage';
import { env } from '../../config/env.js';
import { Injectable } from '../../utils/di.js';
import { logger } from '../../utils/logger.js';
import type { IGcsProvider } from './gcs.provider.interface.js';

/**
 * Provider de Google Cloud Storage.
 *
 * Autenticação via ADC (Application Default Credentials):
 * - Cloud Run: usa automaticamente a Service Account do container.
 * - Local: requer `gcloud auth application-default login`.
 *
 * Env vars necessárias:
 * - GCS_BUCKET_NAME (obrigatória)
 * - GCP_PROJECT_ID  (opcional — o SDK infere do ambiente)
 */
@Injectable()
export class GcsProvider implements IGcsProvider {
  private readonly storage: Storage;
  private readonly bucketName: string;

  constructor() {
    this.bucketName = env.GCS_BUCKET_NAME;
    this.storage = new Storage(env.GCP_PROJECT_ID ? { projectId: env.GCP_PROJECT_ID } : {});
  }

  async upload(key: string, buffer: Buffer, contentType: string): Promise<void> {
    const file = this.storage.bucket(this.bucketName).file(key);
    await file.save(buffer, { contentType, resumable: false });
    logger.debug({ key, size: buffer.length, contentType }, 'gcs: upload ok');
  }

  async download(key: string): Promise<Buffer> {
    const file = this.storage.bucket(this.bucketName).file(key);
    const [contents] = await file.download();
    logger.debug({ key, size: contents.length }, 'gcs: download ok');
    return contents;
  }

  async getSignedUrl(key: string, ttlSec: number): Promise<string> {
    const file = this.storage.bucket(this.bucketName).file(key);
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + ttlSec * 1000,
    });
    return url;
  }

  async delete(key: string): Promise<void> {
    const file = this.storage.bucket(this.bucketName).file(key);
    await file.delete({ ignoreNotFound: true });
    logger.debug({ key }, 'gcs: delete ok');
  }

  async exists(key: string): Promise<boolean> {
    const file = this.storage.bucket(this.bucketName).file(key);
    const [ex] = await file.exists();
    return ex;
  }
}
