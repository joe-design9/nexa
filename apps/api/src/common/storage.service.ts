import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { S3Client, PutObjectCommand, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

/**
 * S3-kompatibler Dateispeicher (lokal MinIO). Uploads laufen über
 * Presigned-PUT-URLs direkt vom Client in den Speicher.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client;
  readonly bucket: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET || 'nexa-uploads';
    this.s3 = new S3Client({
      region: process.env.S3_REGION || 'us-east-1',
      endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || 'nexa_minio',
        secretAccessKey: process.env.S3_SECRET_KEY || 'nexa_minio_password',
      },
    });
  }

  /** Bucket beim Boot sicherstellen (best effort – Fehler nur loggen). */
  async onModuleInit(): Promise<void> {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`Bucket "${this.bucket}" angelegt.`);
      } catch (err) {
        this.logger.warn(`Bucket konnte nicht sichergestellt werden: ${(err as Error).message}`);
      }
    }
  }

  sanitizeFileName(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'datei';
  }

  buildKey(userId: string, fileName: string): string {
    return `uploads/${userId}/${randomUUID()}-${this.sanitizeFileName(fileName)}`;
  }

  publicUrl(storageKey: string): string {
    const base = (process.env.S3_PUBLIC_URL || '').replace(/\/$/, '');
    if (base) return `${base}/${storageKey}`;
    const endpoint = (process.env.S3_ENDPOINT || 'http://localhost:9000').replace(/\/$/, '');
    return `${endpoint}/${this.bucket}/${storageKey}`;
  }

  async presignPut(storageKey: string, contentType: string): Promise<string> {
    const cmd = new PutObjectCommand({ Bucket: this.bucket, Key: storageKey, ContentType: contentType });
    return getSignedUrl(this.s3, cmd, { expiresIn: 60 * 15 });
  }
}
