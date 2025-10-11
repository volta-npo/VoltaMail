import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { SignUpDto } from './dto/signup.dto.js';
import { SessionResponse } from './dto/session-response.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { GoogleAuthDto } from './dto/google.dto.js';

@Controller('v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  async signUp(@Body() body: SignUpDto): Promise<SessionResponse> {
    return this.authService.signUp(body);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: LoginDto): Promise<SessionResponse> {
    return this.authService.login(body);
  }

  @Post('google')
  @HttpCode(HttpStatus.ACCEPTED)
  async googleAuth(@Body() body: GoogleAuthDto): Promise<SessionResponse> {
    return this.authService.googleAuth(body);
  }
}
