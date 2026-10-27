import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';

/**
 * Einheitliches Fehlerformat: { statusCode, error (Code), message (DE) }.
 * HttpExceptions mit { code, message } im Body werden durchgereicht.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'Ein interner Fehler ist aufgetreten.';
    let extra: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        code = typeof b.code === 'string' ? b.code : exception.name.toUpperCase().replace(/\s+/g, '_');
        message = typeof b.message === 'string' ? b.message : exception.message;
        if (Array.isArray(b.issues)) extra = { issues: b.issues };
      } else if (typeof body === 'string') {
        message = body;
      }
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    res.status(status).json({ statusCode: status, error: code, message, ...extra });
  }
}
