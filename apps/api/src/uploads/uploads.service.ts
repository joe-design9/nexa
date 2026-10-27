import { Injectable, BadRequestException } from '@nestjs/common';
import { StorageService } from '../common/storage.service';
import { isAllowedContentType, maxUploadBytes } from './upload.constants';

/* eslint-disable @typescript-eslint/no-explicit-any */

@Injectable()
export class UploadsService {
  constructor(private readonly storage: StorageService) {}

  /**
   * Presigned-Upload anlegen. Der Speicher-Key liegt immer unter
   * uploads/<userId>/… – Nachrichten-Anhänge werden serverseitig dagegen
   * geprüft, damit niemand fremde Dateien anhängen kann.
   */
  async presign(userId: string, dto: any): Promise<{ uploadUrl: string; storageKey: string; publicUrl: string }> {
    const fileName = String(dto.fileName ?? '');
    const contentType = String(dto.contentType ?? '');
    const size = Number(dto.size ?? 0);
    if (!fileName) throw new BadRequestException({ code: 'FILE_NAME_REQUIRED', message: 'Dateiname fehlt.' });
    if (!isAllowedContentType(contentType)) {
      throw new BadRequestException({ code: 'FILE_TYPE_NOT_ALLOWED', message: 'Dieser Dateityp ist nicht erlaubt.' });
    }
    if (!Number.isFinite(size) || size <= 0 || size > maxUploadBytes()) {
      throw new BadRequestException({
        code: 'FILE_TOO_LARGE',
        message: `Die Datei ist zu groß (max. ${process.env.MAX_UPLOAD_MB || 25} MB).`,
      });
    }
    const storageKey = this.storage.buildKey(userId, fileName);
    const uploadUrl = await this.storage.presignPut(storageKey, contentType);
    return { uploadUrl, storageKey, publicUrl: this.storage.publicUrl(storageKey) };
  }
}
