// Bundles the API into one file, api/index.js, which is what Vercel runs. The bundle is committed: run
// `npm run build:api` after any change under server/ and commit the new api/index.js.
// Doing it here (instead of letting the host compile many TypeScript files) removes the extensionless-import
// failures an ES-module project hits on a host, and means the function is exactly what the tests ran.
import { build } from 'esbuild';

await build({
  entryPoints: ['server/vercel-entry.ts'],
  outfile: 'api/index.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  external: ['@electric-sql/pglite'], // only used with no DATABASE_URL (local runs); never loaded on the host
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
  legalComments: 'none',
});
