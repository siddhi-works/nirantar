import { boot } from './boot';
import { vercelHandler } from './vercel';

// Bundled into api/index.js by scripts/build-api.mjs, so the host never has to resolve our source files itself.
export const config = { runtime: 'nodejs' };
export default vercelHandler(boot);
