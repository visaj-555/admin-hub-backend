import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from 'src/common/mail/mail.service';
import { PrismaService } from 'src/common/database/prisma.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  TooManyRequestsException,
  UnauthorizedException,
} from 'src/common/exceptions';
import { generateOtp, hashOtp, verifyOtpHash } from 'src/common/helpers/otp';
import {
  ResendOtpDto,
  VerifyForgotOtpDto,
  VerifyOtpDto,
} from './dto/payloads/otp.dto';
import { TokenService } from './token.service';
import { LoginDto } from './dto/payloads/login.dto';
import { AuthPublic } from './interfaces/auth.interface';
import { LoginDataDto } from './dto/responses/login-data.dto';
import {
  ChangePasswordDto,
  ResetPasswordDto,
} from './dto/payloads/password.dto';
import { RedisService } from '../redis/redis.service';
import { RegisterDto } from './dto/payloads/register.dto';
import { GoogleSignInDto } from './dto/payloads/google-sign-in.dto';
import { GoogleAuthService } from './google-auth.service';
import {
  AuthProvider,
  Role,
  Prisma,
  NotificationType,
} from 'generated/prisma/client';
import * as bcrypt from 'bcrypt';
import { UpdateSettingsDto } from './dto/payloads/settings.dto';
import { S3Service } from 'src/common/aws/s3.service';
import { ReminderScheduleService } from 'src/common/reminder/reminder-schedule.service';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private static readonly AUTH_PUBLIC_SELECT = {
    id: true,
    email: true,
    role: true,
    isActive: true,
    isEmailVerified: true,
    refreshToken: true,
    refreshTokenExp: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly tokenService: TokenService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly s3Service: S3Service,
    private readonly reminderScheduleService: ReminderScheduleService,
    private readonly notificationService: NotificationService, // add this
  ) {}

  // ============== REGISTER ============== //

  async create(dto: RegisterDto): Promise<AuthPublic> {
    const normalizedEmail = dto.email.toLowerCase();

    // ------------ CHECK EXISTING AUTH ------------ //

    const existingAuth = await this.prisma.auth.findUnique({
      where: { email: normalizedEmail },
      select: AuthService.AUTH_PUBLIC_SELECT,
    });

    // ------------ verify AUTH ------------ //
    if (existingAuth?.isEmailVerified) {
      throw new ConflictException(
        'EMAIL_ALREADY_EXISTS',
        'auth.errors.emailAlreadyExists',
      );
    }

    // -----------3. UNVERIFIED ACCOUNT → REPLACE DATA & RESEND OTP (rate-limited) -------------- //

    if (existingAuth && !existingAuth.isEmailVerified) {
      await this.checkRecentOtp(existingAuth.id);

      const hashedPassword = await bcrypt.hash(dto.password, 12);
      const otp = generateOtp();
      const otpHash = await hashOtp(otp);

      const auth = await this.prisma.$transaction(async (tx) => {
        const countryId = await this.getOrCreateCountryId(tx, dto.countryId);

        // Update auth record
        const updatedAuth = await tx.auth.update({
          where: { id: existingAuth.id },
          data: {
            password: hashedPassword,
            role: dto.role ?? Role.USER,
          },
          select: AuthService.AUTH_PUBLIC_SELECT,
        });

        // Upsert user profile
        const user = await tx.user.upsert({
          where: { authId: existingAuth.id },
          update: {
            firstName: dto.firstName,
            lastName: dto.lastName,
            countryId,
          },
          create: {
            authId: existingAuth.id,
            firstName: dto.firstName,
            lastName: dto.lastName,
            countryId,
          },
          select: { id: true, timezone: true },
        });

        // Clean up old verification OTPs and create new one
        await this.createVerificationOtp(
          tx,
          existingAuth.id,
          normalizedEmail,
          otpHash,
        );

        return { auth: updatedAuth, user };
      });

      await this.syncReminderSchedules(auth.user.id, auth.user.timezone);
      await this.mailService.sendOtp(auth.auth.email, otp);

      return auth.auth;
    }

    // -----------4. FRESH REGISTRATION -------------- //

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const otp = generateOtp();
    const otpHash = await hashOtp(otp);

    const auth = await this.prisma.$transaction(async (tx) => {
      const countryId = await this.getOrCreateCountryId(tx, dto.countryId);

      // Create auth record
      const authRecord = await tx.auth.create({
        data: {
          email: normalizedEmail,
          password: hashedPassword,
          role: dto.role ?? Role.USER,
          isActive: true,
          isEmailVerified: false,
        },
        select: AuthService.AUTH_PUBLIC_SELECT,
      });

      // Create user profile
      const user = await tx.user.create({
        data: {
          authId: authRecord.id,
          firstName: dto.firstName,
          lastName: dto.lastName,
          countryId,
        },
        select: { id: true, timezone: true },
      });

      // Persist OTP hash only — plain OTP never stored
      await this.createVerificationOtp(
        tx,
        authRecord.id,
        normalizedEmail,
        otpHash,
      );

      return { auth: authRecord, user };
    });

    await this.syncReminderSchedules(auth.user.id, auth.user.timezone);
    await this.mailService.sendOtp(auth.auth.email, otp);

    return auth.auth;
  }

  // ============== VERIFY OTP ============== //

  async verifyOtp(dto: VerifyOtpDto): Promise<void> {
    const normalizedEmail = dto.email.toLowerCase();

    // ------------ FIND AUTH ------------ //
    const auth = await this.prisma.auth.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        isEmailVerified: true,
        refreshToken: true,
        refreshTokenExp: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!auth) {
      throw new NotFoundException(
        'ACCOUNT_NOT_FOUND',
        'common.errors.notFound',
      );
    }

    // ------------ FIND OTP ------------ //
    const otpRecord = await this.prisma.otp.findFirst({
      where: {
        email: normalizedEmail,
        otpType: 'EMAIL_VERIFICATION',
        verifiedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      throw new BadRequestException('INVALID_OTP', 'auth.otp.invalid');
    }

    // ------------ CHECK EXPIRY ------------ //
    if (otpRecord.expiresAt < new Date()) {
      throw new BadRequestException('OTP_EXPIRED', 'auth.otp.expired');
    }

    // ------------ CHECK ATTEMPTS ------------ //
    if (otpRecord.attempts >= 5) {
      throw new BadRequestException(
        'OTP_ATTEMPTS_EXCEEDED',
        'auth.errors.otpTooManyAttempts',
      );
    }

    // ------------ VERIFY OTP ------------ //
    const isValidOtp = await verifyOtpHash(dto.otp, otpRecord.codeHash);

    if (!isValidOtp) {
      await this.prisma.otp.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } },
      });

      throw new BadRequestException('INVALID_OTP', 'auth.otp.invalid');
    }

    // ------------ MARK OTP VERIFIED ------------ //
    await this.prisma.otp.update({
      where: { id: otpRecord.id },
      data: { verifiedAt: new Date() },
    });

    // ------------ ACTIVATE ACCOUNT ------------ //
    await this.prisma.auth.update({
      where: { id: auth.id },
      data: {
        isActive: true,
        isEmailVerified: true,
      },
    });
  }

  // ============== RESEND OTP ============== //

  async resendOtp(dto: ResendOtpDto): Promise<void> {
    const normalizedEmail = dto.email.toLowerCase();

    // ------------ FIND AUTH ------------ //
    const auth = await this.prisma.auth.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true },
    });

    if (!auth) {
      throw new NotFoundException(
        'ACCOUNT_NOT_FOUND',
        'common.errors.notFound',
      );
    }

    // ------------ GENERATE OTP ------------ //
    const otp = generateOtp();
    console.log(
      `[RESEND OTP GENERATED] Email: ${normalizedEmail}, OTP: ${otp}, Type: ${dto.otpType}`,
    );
    const otpHash = await hashOtp(otp);

    await this.prisma.$transaction(async (tx) => {
      await tx.otp.deleteMany({
        where: {
          email: normalizedEmail,
          otpType: dto.otpType,
        },
      });

      await tx.otp.create({
        data: {
          email: normalizedEmail,
          authId: auth.id,
          codeHash: otpHash,
          otpType: dto.otpType,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });
    });

    // ------------ SEND OTP EMAIL ------------ //
    if (dto.otpType === 'EMAIL_VERIFICATION') {
      await this.mailService.sendOtp(normalizedEmail, otp);
    } else if (dto.otpType === 'FORGOT_PASSWORD') {
      await this.mailService.sendForgotPasswordOtp(normalizedEmail, otp);
    }
  }

  // ============== LOGIN ============== //

  async login(dto: LoginDto): Promise<LoginDataDto> {
    // ------------ FIND USER BY EMAIL ------------ //
    const normalizedEmail = dto.email.toLowerCase();

    const auth = await this.prisma.auth.findUnique({
      where: { email: normalizedEmail },

      include: {
        user: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!auth) {
      throw new NotFoundException(
        'ACCOUNT_NOT_FOUND',
        'common.errors.notFound',
      );
    }

    if (!auth?.user) {
      throw new NotFoundException('USER_NOT_FOUND', 'common.errors.notFound');
    }

    // ------------ CHECK ACCOUNT ACTIVE ------------ //
    if (!auth.isEmailVerified) {
      throw new UnauthorizedException(
        'EMAIL_NOT_VERIFIED',
        'auth.errors.verifyYourEmail',
      );
    }

    // ------------ CHECK ACCOUNT ACTIVE ------------ //
    if (!auth.isActive) {
      throw new UnauthorizedException(
        'ACCOUNT_NOT_ACTIVE',
        'auth.errors.inactive',
      );
    }

    // ------------ RESTRICT ADMIN SIGN IN ------------ //
    if (auth.role === Role.ADMIN) {
      throw new ForbiddenException(
        'ADMIN_LOGIN_RESTRICTED',
        'auth.errors.adminLoginRestricted',
      );
    }

    // ------------ VERIFY PASSWORD ------------ //
    const isPasswordValid = await verifyOtpHash(
      dto.password,
      auth.password || '',
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException(
        'INVALID_CREDENTIALS',
        'auth.errors.invalidCredentials',
      );
    }

    return this.issueLoginTokens(auth);
  }

  // ============== GOOGLE SIGN IN ============== //

  async signInWithGoogle(dto: GoogleSignInDto): Promise<LoginDataDto> {
    const googleProfile = await this.googleAuthService.verifyIdToken(
      dto.idToken,
      dto.platform,
    );

    const normalizedEmail = googleProfile.email!.toLowerCase();
    const googleId = googleProfile.sub;

    const existingGoogleAccount =
      await this.prisma.authProviderAccount.findUnique({
        where: {
          provider_providerId: {
            provider: AuthProvider.GOOGLE,
            providerId: googleId,
          },
        },
        include: {
          auth: {
            include: {
              user: {
                select: { id: true },
              },
            },
          },
        },
      });

    if (existingGoogleAccount) {
      return this.issueLoginTokens(existingGoogleAccount.auth);
    }

    const existingAuth = await this.prisma.auth.findUnique({
      where: { email: normalizedEmail },
      include: {
        user: {
          select: { id: true },
        },
        providers: true,
      },
    });

    if (existingAuth) {
      const hasGoogleProvider = existingAuth.providers.some(
        (provider) => provider.provider === AuthProvider.GOOGLE,
      );

      if (!hasGoogleProvider) {
        await this.prisma.authProviderAccount.create({
          data: {
            provider: AuthProvider.GOOGLE,
            providerId: googleId,
            authId: existingAuth.id,
          },
        });
      }

      if (googleProfile.email_verified) {
        await this.prisma.auth.update({
          where: { id: existingAuth.id },
          data: {
            isEmailVerified: true,
            isActive: true,
          },
        });
      }

      return this.issueLoginTokens({
        ...existingAuth,
        isActive: googleProfile.email_verified ? true : existingAuth.isActive,
      });
    }

    const firstName =
      googleProfile.given_name?.trim() ||
      googleProfile.name?.split(' ')[0]?.trim() ||
      'User';
    const lastName =
      googleProfile.family_name?.trim() ||
      googleProfile.name?.split(' ').slice(1).join(' ').trim() ||
      '';

    const auth = await this.prisma.$transaction(async (tx) => {
      const authRecord = await tx.auth.create({
        data: {
          email: normalizedEmail,
          role: Role.USER,
          isActive: true,
          isEmailVerified: Boolean(googleProfile.email_verified),
        },
      });

      const user = await tx.user.create({
        data: {
          authId: authRecord.id,
          firstName,
          lastName,
          profileImage: googleProfile.picture ?? null,
        },
        select: { id: true, timezone: true },
      });

      await tx.authProviderAccount.create({
        data: {
          provider: AuthProvider.GOOGLE,
          providerId: googleId,
          authId: authRecord.id,
        },
      });

      return {
        auth: await tx.auth.findUniqueOrThrow({
          where: { id: authRecord.id },
          include: {
            user: {
              select: { id: true },
            },
          },
        }),
        user,
      };
    });

    await this.syncReminderSchedules(auth.user.id, auth.user.timezone);
    return this.issueLoginTokens(auth.auth);
  }

  private async issueLoginTokens(auth: {
    id: string;
    role: Role;
    isActive: boolean;
    user: { id: string } | null;
  }): Promise<LoginDataDto> {
    if (!auth.user) {
      throw new NotFoundException('USER_NOT_FOUND', 'common.errors.notFound');
    }

    if (!auth.isActive) {
      throw new UnauthorizedException(
        'ACCOUNT_NOT_ACTIVE',
        'auth.errors.inactive',
      );
    }

    if (auth.role === Role.ADMIN) {
      throw new ForbiddenException(
        'ADMIN_LOGIN_RESTRICTED',
        'auth.errors.adminLoginRestricted',
      );
    }

    const accessToken = this.tokenService.generateAccessToken({
      authId: auth.id,
      role: auth.role,
      userId: auth.user.id,
    });

    const refreshToken = this.tokenService.generateRefreshToken({
      authId: auth.id,
      role: auth.role,
      userId: auth.user.id,
    });

    const refreshTokenKey = `refreshToken:${auth.id}`;
    const refreshTokenTTL = this.configService.get<number>(
      'JWT_REFRESH_TTL_SECONDS',
    );

    await this.redisService.set(
      refreshTokenKey,
      refreshToken,
      Number(refreshTokenTTL),
    );

    return {
      accessToken,
      refreshToken,
      id: auth.id,
      role: auth.role,
      userId: auth.user.id,
    };
  }

  // ============== REFRESH ACCESS TOKEN ============== //

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    if (!refreshToken) {
      throw new UnauthorizedException(
        'INVALID_REFRESH_TOKEN',
        'auth.errors.invalidRefreshToken',
      );
    }

    // ------------ VERIFY REFRESH TOKEN ------------ //
    let payload: { authId: string; role: string };

    try {
      payload = this.tokenService.verifyRefreshToken(refreshToken);
    } catch (_error) {
      throw new UnauthorizedException(
        'INVALID_REFRESH_TOKEN',
        'auth.errors.invalidRefreshToken',
      );
    }

    if (!payload?.authId) {
      throw new UnauthorizedException(
        'INVALID_REFRESH_TOKEN',
        'auth.errors.invalidRefreshToken',
      );
    }

    // ------------ FIND AUTH ------------ //
    const auth = await this.prisma.auth.findUnique({
      where: {
        id: payload.authId,
        isActive: true,
      },

      include: {
        user: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!auth || !auth.user) {
      throw new UnauthorizedException(
        'INVALID_REFRESH_TOKEN',
        'auth.errors.invalidRefreshToken',
      );
    }

    const userId = auth.user.id;

    // ------------ VALIDATE AGAINST REDIS ------------ //
    const refreshTokenKey = `refreshToken:${payload.authId}`;
    const storedToken = await this.redisService.get(refreshTokenKey);

    if (!storedToken || storedToken !== refreshToken) {
      throw new UnauthorizedException(
        'INVALID_REFRESH_TOKEN',
        'auth.errors.invalidRefreshToken',
      );
    }

    // ------------ GENERATE NEW TOKENS ------------ //
    const newAccessToken = this.tokenService.generateAccessToken({
      authId: auth.id,
      role: auth.role,
      userId,
    });

    const newRefreshToken = this.tokenService.generateRefreshToken({
      authId: auth.id,
      role: auth.role,
      userId,
    });

    const refreshTokenTTL = this.configService.get<number>(
      'JWT_REFRESH_TTL_SECONDS',
    );

    await this.redisService.set(
      refreshTokenKey,
      newRefreshToken,
      Number(refreshTokenTTL),
    );

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  // ============== FORGOT PASSWORD ============== //

  async forgotPassword(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase();

    const auth = await this.prisma.auth.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true },
    });

    if (!auth) {
      throw new NotFoundException(
        'ACCOUNT_NOT_FOUND',
        'auth.errors.accountNotFound',
      );
    }

    const otp = generateOtp();
    const otpHash = await hashOtp(otp);

    await this.prisma.$transaction(async (tx) => {
      // Invalidate all previous forgot password OTPs
      await tx.otp.deleteMany({
        where: {
          email: normalizedEmail,
          otpType: 'FORGOT_PASSWORD',
        },
      });

      await tx.otp.create({
        data: {
          email: normalizedEmail,
          authId: auth.id,
          codeHash: otpHash,
          otpType: 'FORGOT_PASSWORD',
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });
    });

    await this.mailService.sendForgotPasswordOtp(normalizedEmail, otp);
  }

  // ============== VERIFY FORGOT PASSWORD OTP ============== //

  async verifyForgotPasswordOtp(
    dto: VerifyForgotOtpDto,
  ): Promise<{ resetToken: string }> {
    const normalizedEmail = dto.email.toLowerCase();
    console.log(
      `[FORGOT PASSWORD VERIFY] Email: ${normalizedEmail}, OTP: ${dto.otp}`,
    );

    // ------------ FIND OTP RECORD ------------ //
    const otpRecord = await this.prisma.otp.findFirst({
      where: {
        email: normalizedEmail,
        otpType: 'FORGOT_PASSWORD',
        verifiedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      throw new BadRequestException('INVALID_OTP', 'auth.otp.invalid');
    }

    // ------------ CHECK OTP EXPIRY ------------ //
    if (otpRecord.expiresAt < new Date()) {
      throw new BadRequestException('OTP_EXPIRED', 'auth.otp.expired');
    }

    // ------------ CHECK ATTEMPTS ------------ //
    if (otpRecord.attempts >= 5) {
      throw new BadRequestException(
        'OTP_ATTEMPTS_EXCEEDED',
        'auth.errors.otpTooManyAttempts',
      );
    }

    // ------------ VERIFY OTP ------------ //
    const isValidOtp = await verifyOtpHash(dto.otp, otpRecord.codeHash);
    console.log(
      `[FORGOT PASSWORD VERIFY] Hash comparison result: ${isValidOtp}`,
    );

    if (!isValidOtp) {
      await this.prisma.otp.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } },
      });

      throw new BadRequestException('INVALID_OTP', 'auth.otp.invalid');
    }

    // ------------ MARK OTP AS VERIFIED ------------ //
    await this.prisma.otp.update({
      where: { id: otpRecord.id },
      data: { verifiedAt: new Date() },
    });

    // ------------ FIND AUTH ACCOUNT ------------ //
    const auth = await this.prisma.auth.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (!auth) {
      throw new NotFoundException(
        'ACCOUNT_NOT_FOUND',
        'common.errors.notFound',
      );
    }

    // ------------ GENERATE RESET TOKEN ------------ //
    const resetToken = this.tokenService.generateResetPasswordToken({
      id: auth.id,
      type: 'RESET_PASSWORD',
    });

    return { resetToken };
  }

  // ============== RESET PASSWORD ============== //

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    let tokenPayload: { id: string; type: string };
    try {
      tokenPayload = this.tokenService.verifyResetPasswordToken(dto.resetToken);
    } catch (_error) {
      throw new UnauthorizedException(
        'INVALID_RESET_TOKEN',
        'auth.errors.invalidResetToken',
      );
    }

    // ------------ FIND ACCOUNT ------------ //
    const auth = await this.prisma.auth.findUnique({
      where: { id: tokenPayload.id },
      select: { id: true, email: true },
    });

    if (!auth) {
      throw new NotFoundException(
        'ACCOUNT_NOT_FOUND',
        'common.errors.notFound',
      );
    }

    // ------------ HASH & UPDATE PASSWORD ------------ //
    const hashedPassword = await hashOtp(dto.newPassword);

    await this.prisma.auth.update({
      where: { id: auth.id },
      data: { password: hashedPassword },
    });

    const refreshTokenKey = `refreshToken:${auth.id}`;
    await this.redisService.del(refreshTokenKey);

    await this.mailService.passwordUpdateSuccessfully(auth.email);
  }

  // ============== CHANGE PASSWORD ============== //

  async changePassword(authId: string, dto: ChangePasswordDto): Promise<void> {
    const auth = await this.prisma.auth.findUnique({
      where: { id: authId },
      select: { id: true, email: true, password: true },
    });

    if (!auth) {
      throw new NotFoundException(
        'ACCOUNT_NOT_FOUND',
        'common.errors.notFound',
      );
    }

    const isCurrentValid = await verifyOtpHash(
      dto.currentPassword,
      auth.password || '',
    );

    if (!isCurrentValid) {
      throw new UnauthorizedException(
        'INVALID_CURRENT_PASSWORD',
        'auth.errors.invalidCurrentPassword',
      );
    }

    const isSamePassword = await verifyOtpHash(
      dto.newPassword,
      auth.password || '',
    );

    if (isSamePassword) {
      throw new BadRequestException(
        'PASSWORD_SAME_AS_OLD',
        'auth.errors.passwordSameAsOld',
      );
    }

    const hashedPassword = await hashOtp(dto.newPassword);

    await this.prisma.auth.update({
      where: { id: authId },
      data: { password: hashedPassword },
    });

    const refreshTokenKey = `refreshToken:${authId}`;
    await this.redisService.del(refreshTokenKey);

    await this.mailService.passwordUpdateSuccessfully(auth.email);
  }

  // ============== VERIFY TOKEN ============== //

  async verifyToken(authId: string) {
    // ------------ FIND AUTH ------------ //
    const auth = await this.prisma.auth.findUnique({
      where: { id: authId },
      select: {
        id: true,
        email: true,
        role: true,
        isEmailVerified: true,
        isActive: true,
      },
    });

    if (!auth) {
      throw new NotFoundException('ACCOUNT_NOT_FOUND', 'errors.notFound');
    }

    // ------------ GET NAME BASED ON ROLE ------------ //
    let name: string | null = null;
    let userId: string | null = null;

    if (auth.role === Role.USER) {
      const user = await this.prisma.user.findUnique({
        where: { authId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      });
      userId = user?.id ?? null;
      name = user ? `${user.firstName} ${user.lastName}`.trim() : null;
    }

    return {
      id: auth.id,
      userId,
      name: name ?? '',
      email: auth.email,
      role: auth.role,
    };
  }

  // ============== UPDATE SETTINGS ============== //

  async updateSettings(authId: string, dto: UpdateSettingsDto) {
    const user = await this.prisma.user.findUnique({
      where: { authId },
      select: {
        id: true,
        isPrivate: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!user) {
      throw new NotFoundException('USER_NOT_FOUND', 'user.errors.notFound');
    }

    const isSwitchingPrivacy =
      dto.isPrivate !== undefined && dto.isPrivate !== user.isPrivate;
    const switchingToPublic = isSwitchingPrivacy && dto.isPrivate === false;

    // ------------ ATOMIC UPDATE + CASCADE ------------ //
    const { updatedUser, acceptedFollowerIds } = await this.prisma.$transaction(
      async (tx) => {
        const updated = await tx.user.update({
          where: { authId },
          data: {
            ...(dto.isPrivate !== undefined && { isPrivate: dto.isPrivate }),
            // keep any other settings fields (timezone etc.) here as before
          },
          select: {
            isPrivate: true,
            timezone: true,
          },
        });

        if (isSwitchingPrivacy && dto.isPrivate === true) {
          // PUBLIC -> PRIVATE: public posts become followers-only
          await tx.post.updateMany({
            where: {
              userId: user.id,
              visibility: 'PUBLIC',
              deletedAt: null,
            },
            data: { visibility: 'FOLLOWERS' },
          });
        }

        if (switchingToPublic) {
          // PRIVATE -> PUBLIC: followers-only posts become public
          await tx.post.updateMany({
            where: {
              userId: user.id,
              visibility: 'FOLLOWERS',
              deletedAt: null,
            },
            data: { visibility: 'PUBLIC' },
          });
        }

        // A public account has no approval step. Accept every incoming request,
        // including rows left pending by an earlier privacy change.
        let acceptedFollowerIds: string[] = [];
        if (dto.isPrivate === false) {
          const pendingFollows = await tx.follow.findMany({
            where: { followingId: user.id, status: 'PENDING' },
            select: { id: true, followerId: true },
          });

          if (pendingFollows.length > 0) {
            await tx.follow.updateMany({
              where: { id: { in: pendingFollows.map((row) => row.id) } },
              data: { status: 'ACCEPTED' },
            });
            acceptedFollowerIds = pendingFollows.map((row) => row.followerId);
          }
        }

        return { updatedUser: updated, acceptedFollowerIds };
      },
    );

    // ------------ NOTIFY EVERY ACCEPTED REQUESTER ------------ //
    if (acceptedFollowerIds.length > 0) {
      const displayName = `${user.firstName} ${user.lastName}`.trim();

      await Promise.all(
        acceptedFollowerIds.map(async (followerId) => {
          await this.notificationService
            .deleteNotifications({
              userId: user.id,
              actorId: followerId,
              type: NotificationType.FOLLOW_REQUEST_RECEIVED,
            })
            .catch((err: Error) =>
              this.logger.warn(
                `Failed to clear stale request notif: ${err.message}`,
              ),
            );

          await this.notificationService.createAndSend({
            userId: followerId,
            actorId: user.id,
            type: NotificationType.FOLLOW_REQUEST_ACCEPTED,
            title: 'Follow Request Accepted',
            message: `${displayName} accepted your follow request`,
          });
        }),
      );
    }

    return updatedUser;
  }

  // ============== LOGOUT ============== //

  async logout(authId: string): Promise<void> {
    const auth = await this.prisma.auth.findUnique({
      where: { id: authId },
      select: { id: true },
    });

    if (!auth) {
      throw new NotFoundException(
        'ACCOUNT_NOT_FOUND',
        'auth.errors.accountNotFound',
      );
    }

    // Delete refresh token from Redis
    const refreshTokenKey = `refreshToken:${authId}`;
    await this.redisService.del(refreshTokenKey);

    // Update Auth record in DB to clean up any refresh token data
    await this.prisma.auth.update({
      where: { id: authId },
      data: {
        refreshToken: null,
        refreshTokenExp: null,
      },
    });
  }

  // ============== DELETE ACCOUNT ============== //

  async deleteAccount(authId: string): Promise<void> {
    const auth = await this.prisma.auth.findUnique({
      where: { id: authId },
      include: {
        user: {
          include: {
            posts: {
              include: {
                media: true,
              },
            },
            sentMessages: {
              include: {
                attachment: true,
              },
            },
          },
        },
      },
    });

    if (!auth) {
      throw new NotFoundException(
        'ACCOUNT_NOT_FOUND',
        'auth.errors.accountNotFound',
      );
    }

    if (!auth.user) {
      throw new NotFoundException('USER_NOT_FOUND', 'common.errors.notFound');
    }

    const user = auth.user;

    await this.reminderScheduleService.deleteUserSchedules(user.id);

    // ------------ S3 CLEANUP ------------ //

    // 1. Delete profile image from S3 if it resides there
    if (user.profileImage) {
      const isS3 =
        user.profileImage.startsWith('s3:/') ||
        user.profileImage.startsWith('s3://') ||
        user.profileImage.includes(process.env.AWS_BUCKET_NAME || '') ||
        !user.profileImage.startsWith('http');
      if (isS3) {
        await this.s3Service
          .deleteFileByUri(user.profileImage)
          .catch((err: Error) => {
            this.logger.warn(
              `Failed to delete old profile image: ${err.message}`,
            );
          });
      }
    }

    // 2. Delete all post media files from S3
    if (user.posts && user.posts.length > 0) {
      for (const post of user.posts) {
        if (post.media && post.media.length > 0) {
          for (const media of post.media) {
            if (media.url) {
              await this.s3Service
                .deleteObjectByKey(media.url)
                .catch((err: Error) => {
                  this.logger.warn(
                    `Failed to delete post media ${media.url}: ${err.message}`,
                  );
                });
            }
            if (media.thumbnailUrl) {
              await this.s3Service
                .deleteObjectByKey(media.thumbnailUrl)
                .catch((err: Error) => {
                  this.logger.warn(
                    `Failed to delete post media thumbnail ${media.thumbnailUrl}: ${err.message}`,
                  );
                });
            }
            if (media.compressedKey) {
              await this.s3Service
                .deleteObjectByKey(media.compressedKey)
                .catch((err: Error) => {
                  this.logger.warn(
                    `Failed to delete post media compressedKey ${media.compressedKey}: ${err.message}`,
                  );
                });
            }
          }
        }
      }
    }

    // 3. Delete message attachments from S3
    if (user.sentMessages && user.sentMessages.length > 0) {
      for (const msg of user.sentMessages) {
        if (msg.attachment && msg.attachment.mediaUrl) {
          const mediaUrl = msg.attachment.mediaUrl;
          await this.s3Service.deleteFileByUri(mediaUrl).catch((err: Error) => {
            this.logger.warn(
              `Failed to delete message attachment ${mediaUrl}: ${err.message}`,
            );
          });
        }
      }
    }

    // ------------ REDIS CLEANUP ------------ //

    // 1. Delete refresh token
    const refreshTokenKey = `refreshToken:${authId}`;
    await this.redisService.del(refreshTokenKey);

    // 2. Delete WebSocket connection mappings
    const wsUserKey = `ws:user:${user.id}`;
    try {
      const connectionIds = await this.redisService.smembers(wsUserKey);
      if (connectionIds && connectionIds.length > 0) {
        for (const connId of connectionIds) {
          await this.redisService.del(`ws:connection:${connId}`);
        }
      }
      await this.redisService.del(wsUserKey);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to clean up WS Redis keys: ${errMsg}`);
    }

    // ------------ DB TRANSACTION TO HARD DELETE ALL RELATED DATA ------------ //
    const postIds = user.posts.map((p) => p.id);

    await this.prisma.$transaction(async (tx) => {
      // 1. Delete notifications (receiver, actor, or pointing to user's posts)
      await tx.notification.deleteMany({
        where: {
          OR: [
            { userId: user.id },
            { actorId: user.id },
            ...(postIds.length > 0 ? [{ postId: { in: postIds } }] : []),
          ],
        },
      });

      // 2. Delete message reads
      await tx.messageRead.deleteMany({
        where: { userId: user.id },
      });

      // 3. Delete messages (which cascade deletes their MessageAttachment and MessageRead entries)
      await tx.message.deleteMany({
        where: { senderId: user.id },
      });

      // 4. Delete conversation members
      await tx.conversationMember.deleteMany({
        where: { userId: user.id },
      });

      // 5. Delete daily logs
      await tx.dailyLog.deleteMany({
        where: { userId: user.id },
      });

      // 6. Delete Auth record (cascade deletes User, AuthProviderAccount, Otp, Post, PostMedia, PostCheer, Follow)
      await tx.auth.delete({
        where: { id: authId },
      });
    });
  }

  // ============== HELPER METHODS FOR REGISTRATION ============== //

  private async getOrCreateCountryId(
    tx: Prisma.TransactionClient,
    countryId?: string,
  ): Promise<string> {
    if (countryId) {
      const country = await tx.country.findUnique({
        where: { id: countryId },
        select: { id: true },
      });

      if (!country) {
        throw new BadRequestException(
          'INVALID_COUNTRY',
          'auth.errors.invalidCountry',
        );
      }
      return country.id;
    }

    const india = await tx.country.findUnique({
      where: { iso2: 'IN' },
      select: { id: true },
    });

    if (!india) {
      throw new InternalServerErrorException(
        'DEFAULT_COUNTRY_MISSING',
        'auth.errors.defaultCountryMissing',
      );
    }

    return india.id;
  }

  private async syncReminderSchedules(
    userId: string,
    timezone: string,
  ): Promise<void> {
    await this.reminderScheduleService.ensureUserSchedules(userId, timezone);
  }

  private async checkRecentOtp(authId: string): Promise<void> {
    const recentOtp = await this.prisma.otp.findFirst({
      where: {
        authId,
        otpType: 'EMAIL_VERIFICATION',
        createdAt: { gte: new Date(Date.now() - 60 * 1000) },
      },
    });

    if (recentOtp) {
      throw new TooManyRequestsException(
        'OTP_RATE_LIMIT_EXCEEDED',
        'auth.errors.otpRateLimitExceeded',
      );
    }
  }

  private async createVerificationOtp(
    tx: Prisma.TransactionClient,
    authId: string,
    email: string,
    otpHash: string,
  ): Promise<void> {
    await tx.otp.deleteMany({
      where: { authId, otpType: 'EMAIL_VERIFICATION' },
    });

    await tx.otp.create({
      data: {
        email,
        authId,
        codeHash: otpHash,
        otpType: 'EMAIL_VERIFICATION',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
  }
}
