import { createHash, randomBytes } from 'node:crypto';

export const COOKIE = 'nirantar_sid';
/** Names the tester's private sample space. It outlives a single sign-in so the doctor, nurse and patient views of one tester share it. */
export const WS_COOKIE = 'nirantar_ws';
export const newToken = () => randomBytes(32).toString('base64url');
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
