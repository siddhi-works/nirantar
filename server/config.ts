export interface Config {
  production: boolean;
  /** Fixed one-time code used by the dev AuthProvider. */
  devOtp: string;
  /** Off by default: sample sign-in needs only the identity. Set REQUIRE_OTP=true to check the fixed code again. */
  requireOtp: boolean;
  sessionHours: number;
  secureCookies: boolean;
  databaseUrl?: string;
  /** Create the tables and seed on start. On a hosted database this is one deliberate command (npm run db:setup), not every cold start. */
  setupOnStart: boolean;
}

type Env = Record<string, string | undefined>;

/**
 * The dev AuthProvider accepts one fixed code, so anyone who knows it can sign in.
 * That is fine for synthetic data and never for real records, so production refuses to start
 * unless ALLOW_DEV_OTP=true is set on purpose.
 */
export function loadConfig(env: Env = process.env): Config {
  const production = env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production';
  const requireOtp = env.REQUIRE_OTP === 'true';
  if (production && requireOtp && env.ALLOW_DEV_OTP !== 'true') {
    throw new Error('Refusing to start: the dev sign-in code is not allowed in production. Set ALLOW_DEV_OTP=true only for synthetic data.');
  }
  return {
    production,
    devOtp: env.DEV_OTP ?? '482915',
    requireOtp,
    sessionHours: Number(env.SESSION_HOURS ?? 8),
    secureCookies: production || env.VERCEL === '1',
    databaseUrl: env.DATABASE_URL || undefined,
    setupOnStart: !env.DATABASE_URL || env.SETUP_ON_START === 'true',
  };
}
