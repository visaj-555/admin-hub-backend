import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from 'src/modules/auth/interfaces/auth.interface';

export const GetUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<{ user?: JwtPayload }>();

    if (!request.user) {
      throw new Error('GetUser decorator used without JwtAuthGuard');
    }

    return request.user;
  },
);
