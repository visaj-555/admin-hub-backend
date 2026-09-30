import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { UserRole, UserStatus } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import type { Request } from 'express';
import type { JwtPayload } from '../../../common/interfaces/jwt-payload.js';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    const userId = request.user?.sub;
    if (!userId || request.user?.role !== UserRole.ADMIN) return false;
    const admin = await this.prisma.user.findFirst({
      where: {
        id: userId,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
      select: { id: true },
    });
    return admin !== null;
  }
}
