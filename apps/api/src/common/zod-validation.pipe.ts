import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Validiert Request-Bodies mit einem Zod-Schema aus @nexa/shared.
 * Zusätzliche Felder des Original-Bodies (z. B. captchaToken) bleiben
 * erhalten, damit sie separat verarbeitet werden können.
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown): Record<string, unknown> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const issues = result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Die Eingaben sind ungültig.',
        issues,
      });
    }
    const original = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
    return { ...original, ...(result.data as Record<string, unknown>) };
  }
}
