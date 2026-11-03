import { timingSafeEqual } from 'node:crypto';
import type { AppRole } from '../../src/domain/api';

export interface Credentials {
  role: AppRole;
  hprId?: string;
  hfrId?: string;
  abha?: string;
}

/**
 * The swap point for ABDM. The API only asks two questions: "send a code" and "is this code right".
 * Who the person is, and what they may do, is decided afterwards from our own users table.
 */
export interface AuthProvider {
  readonly name: string;
  requestOtp(c: Credentials): Promise<void>;
  verifyOtp(c: Credentials, otp: string): Promise<boolean>;
}

export class DevAuthProvider implements AuthProvider {
  readonly name = 'dev';
  constructor(private readonly code: string) {}
  async requestOtp(): Promise<void> { /* nothing is sent: the code is fixed */ }
  async verifyOtp(_c: Credentials, otp: string): Promise<boolean> {
    const a = Buffer.from(otp);
    const b = Buffer.from(this.code);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
