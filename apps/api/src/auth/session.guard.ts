import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { SessionService } from './session.service.js';
import { AuthenticatedRequest } from './authenticated-request.js';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessionService: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token =
      request.header('x-session-token') ??
      this.extractBearerToken(request.header('authorization') ?? '');

    if (!token) {
      throw new UnauthorizedException('Missing session token');
    }

    const session = await this.sessionService.getSessionWithUser(token);

    if (!session) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    request.auth = {
      session,
      user: session.user
    };

    return true;
  }

  private extractBearerToken(authorizationHeader: string): string | undefined {
    if (!authorizationHeader) {
      return undefined;
    }

    const [scheme, value] = authorizationHeader.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !value) {
      return undefined;
    }

    return value;
  }
}
