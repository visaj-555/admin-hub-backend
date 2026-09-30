import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { Prisma, UserRole, UserStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.js';
import type {
  LoginDto,
  AuthUserDto,
  LoginResponseDto,
} from './dto/auth.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) { }

  async login(input: LoginDto): Promise<LoginResponseDto> {
    try {
      const auth = await this.prisma.auth.findUnique({
        where: { email: input.email.toLowerCase() },
        include: { user: true },
      });

      const passwordMatches = auth
        ? await compare(input.password, auth.passwordHash)
        : false;

      // Generic message to avoid user enumeration
      if (
        !auth ||
        !passwordMatches ||
        auth.user.role !== UserRole.ADMIN ||
        auth.user.status !== UserStatus.ACTIVE ||
        auth.user.deletedAt
      ) {
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

      const accessToken = await this.jwtService.signAsync(payload);

      return {
        data: {
          accessToken,
          id: auth.user.id,
          firstName: auth.user.firstName,
          lastName: auth.user.lastName,
          profileImage: auth.user.profileImage,
          email: auth.email,
          role: auth.user.role,
        },
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  async me(userId: string): Promise<{ data: AuthUserDto }> {
    try {
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

      return { data: this.toAuthUser(user, user.auth.email) };
    } catch (error) {
      this.handleError(error);
    }
  }

  private toAuthUser(
    user: {
      id: string;
      firstName: string;
      lastName: string | null;
      profileImage: string | null;
      role: UserRole;
      status: UserStatus;
    },
    email: string,
  ): AuthUserDto {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImage: user.profileImage,
      email,
      role: user.role,
      status: user.status,
    };
  }

  /**
   * Centralized error handler – maps Prisma errors to NestJS HTTP exceptions
   * and ensures no internal details are leaked.
   */
  private handleError(error: unknown): never {
    // Re-throw NestJS HTTP exceptions as-is
    if (error instanceof UnauthorizedException) {
      throw error;
    }

    // Handle Prisma known request errors
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error.code) {
        case 'P2025': // Record not found
          throw new UnauthorizedException('Account is unavailable');
        case 'P2003': // Foreign key constraint failed
          throw new UnauthorizedException('Account is unavailable');
        default:
          throw new InternalServerErrorException('Database operation failed');
      }
    }

    // Fallback for unexpected errors
    throw new InternalServerErrorException('An unexpected error occurred');
  }
}