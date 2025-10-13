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
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : defaultOrigins;

  app.enableCors({
    origin: allowedOrigins,
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
