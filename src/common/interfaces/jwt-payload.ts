import { UserRole } from '../../generated/prisma/client.js';

export interface JwtPayload {
  sub: string;
  role: UserRole;
}
