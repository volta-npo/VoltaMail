import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import type { NextFunction, Request, Response } from 'express';

export async function createApp() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());

  const rawPrefix = (process.env.NEST_GLOBAL_PREFIX ?? 'api').trim();
  const normalizedPrefix = rawPrefix.replace(/^\/+/, '').replace(/\/+$/, '');
  if (normalizedPrefix && normalizedPrefix !== '.') {
    app.setGlobalPrefix(normalizedPrefix);

    app.use((req: Request, _res: Response, next: NextFunction) => {
      if (
        typeof req.url === 'string' &&
        req.url.startsWith('/v1') &&
        !req.url.startsWith(`/${normalizedPrefix}/`)
      ) {
        req.url = `/${normalizedPrefix}${req.url}`;
      }
      next();
    });
  }

  const defaultOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001'
  ];

  const normalizeOrigin = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (trimmed === '*') {
      return '*';
    }
    try {
      const url = new URL(trimmed);
      return url.origin;
    } catch {
      try {
        const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
        return url.origin;
      } catch {
        return trimmed;
      }
    }
  };

  const collectOrigins = (inputs: Array<string | null | undefined>) => {
    const results = new Set<string>();
    for (const input of inputs) {
      if (!input) {
        continue;
      }
      const normalized = normalizeOrigin(input);
      if (!normalized) {
        continue;
      }
      if (normalized === '*') {
        return new Set<string>(['*']);
      }
      results.add(normalized);
    }
    return results;
  };

  const configuredOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
    : defaultOrigins;

  const baseOrigins = collectOrigins(configuredOrigins);
  const extraOrigins = collectOrigins([
    process.env.APP_BASE_URL ?? null,
    process.env.API_PUBLIC_BASE_URL ?? null,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null
  ]);

  let allowAllOrigins = baseOrigins.has('*') || extraOrigins.has('*');
  const allowedOrigins = allowAllOrigins
    ? new Set<string>(['*'])
    : new Set<string>([...baseOrigins, ...extraOrigins]);

  const appBaseHost = (() => {
    const appBase = process.env.APP_BASE_URL;
    if (!appBase) {
      return null;
    }
    try {
      return new URL(appBase).hostname;
    } catch {
      return null;
    }
  })();

  const escapeRegExp = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const vercelPattern =
    appBaseHost && appBaseHost.endsWith('.vercel.app')
      ? new RegExp(
          `^https://${escapeRegExp(appBaseHost.replace(/\.vercel\.app$/i, ''))}(?:-[\\w-]+)?\\.vercel\\.app$`,
          'i'
        )
      : null;

  app.enableCors({
    origin: allowAllOrigins
      ? true
      : (origin, callback) => {
          if (!origin) {
            callback(null, true);
            return;
          }

          const normalized = normalizeOrigin(origin);
          if (normalized && allowedOrigins.has(normalized)) {
            callback(null, true);
            return;
          }

          if (vercelPattern && vercelPattern.test(origin)) {
            callback(null, true);
            return;
          }

          callback(new Error(`Origin ${origin} not allowed by CORS`));
        },
    credentials: true
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true
    })
  );

  return app;
}
