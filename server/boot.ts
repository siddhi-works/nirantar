import { loadConfig } from './config';
import { applyPendingMigrations, createDb } from './db/client';
import { logError } from './log';
import { DevAuthProvider } from './auth/provider';
import { createApp } from './app';
import { seed } from './seed';
import { SarvamOcr } from './ocr/sarvam';
import { SarvamSpeaker, SarvamTranslator } from './language/sarvam';
import { SarvamChat } from './assistant/sarvam';

/** Shared by the local server and the Vercel function. */
export async function boot() {
  const config = loadConfig();
  const db = await createDb({ url: config.databaseUrl, dataDir: config.databaseUrl ? undefined : '.data/pglite', migrate: config.setupOnStart });
  if (config.setupOnStart) await seed(db);
  else if (config.databaseUrl) await applyPendingMigrations(db).catch(e => logError('migrations', e)); // a failure must not take the site down: the tables may already be there
  const key = process.env.SARVAM_API_KEY;
  return createApp({ db, config, auth: new DevAuthProvider(config.devOtp), ocr: key ? new SarvamOcr({ key }) : undefined, translator: key ? new SarvamTranslator({ key }) : undefined, speaker: key ? new SarvamSpeaker({ key }) : undefined, chat: key ? new SarvamChat({ key }) : undefined });
}
