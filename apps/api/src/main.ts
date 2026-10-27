import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // CORS: Web-App + Desktop-App (file:// liefert Origin "null") mit Credentials.
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin || origin === 'null' || origin === appUrl) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  });

  app.use(cookieParser());
  app.useGlobalFilters(new HttpExceptionFilter());

  // Globales Rate-Limit + strengeres Limit für /auth/*.
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
  app.use(
    rateLimit({
      windowMs,
      limit: Number(process.env.RATE_LIMIT_MAX || 300),
      standardHeaders: true,
      legacyHeaders: false,
      message: { statusCode: 429, error: 'RATE_LIMITED', message: 'Zu viele Anfragen. Bitte warte einen Moment.' },
    }),
  );
  app.use(
    '/auth',
    rateLimit({
      windowMs,
      limit: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),
      standardHeaders: true,
      legacyHeaders: false,
      message: { statusCode: 429, error: 'RATE_LIMITED', message: 'Zu viele Anmeldeversuche. Bitte warte einen Moment.' },
    }),
  );

  const port = Number(process.env.PORT || 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Nexa API läuft auf Port ${port}`);
}

void bootstrap();
