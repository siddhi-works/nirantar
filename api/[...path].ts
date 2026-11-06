import { boot } from '../server/boot';
import { vercelHandler } from '../server/vercel';

// A catch-all function: every /api/... request arrives here with its original URL.
export const config = { runtime: 'nodejs' };
export default vercelHandler(boot);
