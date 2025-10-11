import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';

export async function createApp() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());

  const rawPrefix = (process.env.NEST_GLOBAL_PREFIX ?? 'api').trim();
  if (rawPrefix && rawPrefix !== '/') {
    app.setGlobalPrefix(rawPrefix.replace(/^\/+/, ''));
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
