import { Auth } from 'generated/prisma/client';

export type AuthPublic = Omit<
  Auth,
  'password' | 'refreshToken' | 'refreshTokenExp'
>;

export interface JwtPayload {
  authId: string;
  userId: string;
  role: string;
}
