import type { Request } from 'express';
import type { JwtPayload } from './jwt-payload.interface.js';

export type AuthenticatedRequest = Request & { user?: JwtPayload };
