import { randomInt } from 'crypto';
import bcrypt from 'bcrypt';

export function generateOtp(): string {
  return randomInt(100000, 999999).toString();
}

export async function hashOtp(otp: string): Promise<string> {
  const hashed: string = await bcrypt.hash(otp, 10);
  return hashed;
}

export async function verifyOtpHash(
  otp: string,
  hash: string,
): Promise<boolean> {
  const isValid: boolean = await bcrypt.compare(otp, hash);
  return isValid;
}
