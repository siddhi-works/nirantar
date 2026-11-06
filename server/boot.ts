import { loadConfig } from './config';
import { createDb } from './db/client';
import { DevAuthProvider } from './auth/provider';
import { createApp } from './app';
import { seed } from './seed';
import { SarvamOcr } from './ocr/sarvam';
import { SarvamSpeaker, SarvamTranslator } from './language/sarvam';

/** Shared by the local server and the Vercel function. */
export async function boot() {
  const config = loadConfig();
  const db = await createDb({ url: config.databaseUrl, dataDir: config.databaseUrl ? undefined : '.data/pglite', migrate: config.setupOnStart });
  if (config.setupOnStart) await seed(db);
  const key = process.env.SARVAM_API_KEY;
  return createApp({ db, config, auth: new DevAuthProvider(config.devOtp), ocr: key ? new SarvamOcr({ key }) : undefined, translator: key ? new SarvamTranslator({ key }) : undefined, speaker: key ? new SarvamSpeaker({ key }) : undefined });
}
