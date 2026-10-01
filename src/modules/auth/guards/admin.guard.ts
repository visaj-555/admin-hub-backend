import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole, UserStatus } from '../../../generated/prisma/client.js';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator.js';
import type { AuthenticatedRequest } from '../../../common/interfaces/authenticated-request.js';
import { PrismaService } from '../../../prisma/prisma.service.js';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.isPublic(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Bearer token required');
    }

    if (request.user?.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Administrator access required');
    }

    const admin = await this.prisma.user.findFirst({
      where: {
        id: userId,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!admin) {
      throw new ForbiddenException('Administrator access required');
    }

    return true;
  }

  private isPublic(context: ExecutionContext): boolean {
    return this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
  }
}
