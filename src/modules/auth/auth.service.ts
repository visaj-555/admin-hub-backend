import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { UserRole, UserStatus } from '../../generated/prisma/client.js';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthUserDto, LoginDto, LoginResponseDto } from './dto/auth.dto.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(input: LoginDto): Promise<LoginResponseDto> {
    const auth = await this.prisma.auth.findUnique({
      where: { email: input.email.toLowerCase() },
      include: { user: true },
    });

    const passwordMatches = auth
      ? await compare(input.password, auth.passwordHash)
      : false;

    if (
      !auth ||
      !passwordMatches ||
      auth.user.role !== UserRole.ADMIN ||
      auth.user.status !== UserStatus.ACTIVE ||
      auth.user.deletedAt
    ) {
      this.logger.warn(`Failed login attempt for ${input.email.toLowerCase()}`);
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.prisma.auth.update({
      where: { id: auth.id },
      data: { lastLoginAt: new Date() },
    });

    const payload: JwtPayload = {
      sub: auth.user.id,
      role: auth.user.role,
    };

    return {
      data: {
        accessToken: await this.jwtService.signAsync(payload),
        id: auth.user.id,
        firstName: auth.user.firstName,
        lastName: auth.user.lastName,
        profileImage: auth.user.profileImage,
        email: auth.email,
        role: auth.user.role,
      },
    };
  }

  async me(userId: string): Promise<{ data: AuthUserDto }> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
        status: UserStatus.ACTIVE,
      },
      include: { auth: { select: { email: true } } },
    });

    if (!user?.auth) {
      throw new UnauthorizedException('Account is unavailable');
    }

    return {
      data: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImage: user.profileImage,
        email: user.auth.email,
        role: user.role,
        status: user.status,
      },
    };
  }
}
