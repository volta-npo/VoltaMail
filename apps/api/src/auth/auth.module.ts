import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../prisma.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SessionService } from './session.service.js';
import { SessionGuard } from './session.guard.js';

@Module({
  imports: [ConfigModule],
  controllers: [AuthController],
  providers: [AuthService, SessionService, PrismaService, SessionGuard],
  exports: [AuthService, SessionService, PrismaService, SessionGuard]
})
export class AuthModule {}
