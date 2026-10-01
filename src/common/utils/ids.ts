import { v7 as uuidv7 } from 'uuid';

export function newId(): string {
  return uuidv7();
}

export function newPublicNumber(prefix: 'TXN' | 'BKG'): string {
  return `${prefix}-${uuidv7().replaceAll('-', '').slice(-12).toUpperCase()}`;
}
