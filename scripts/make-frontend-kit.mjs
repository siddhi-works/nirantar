// Builds nirantar-frontend-kit.zip: the user interface only, with no server code, migrations, keys or history.
// Run: node scripts/make-frontend-kit.mjs
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { zipSync } from 'fflate';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const stage = join(root, '.kit-stage');
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

const skip = (p) => /\.test\.tsx?$/.test(p);
cpSync(join(root, 'src'), join(stage, 'src'), { recursive: true, filter: s => !skip(s) });
cpSync(join(root, 'public'), join(stage, 'public'), { recursive: true });
cpSync(join(root, 'index.html'), join(stage, 'index.html'));
cpSync(join(root, 'docs/DESIGN-SYSTEM.md'), join(stage, 'DESIGN-SYSTEM.md'));
for (const f of ['vite.config.ts', 'tsconfig.json', 'README.md']) cpSync(join(root, 'scripts/kit', f), join(stage, f));
mkdirSync(join(stage, 'tools'));
cpSync(join(root, 'scripts/kit/pack.mjs'), join(stage, 'tools/pack.mjs'));

// the Hindi-completeness check, without the part that needs the server
let t = readFileSync(join(root, 'src/i18n/i18n.test.ts'), 'utf8');
t = t.replace("import { translate } from './index';\n", '').replace("import { buildChecks } from '@/pages/Checks';\n", '').replace("import { buildRecall } from '../../server/core/engine';\n", '');
const i = t.indexOf("  it('covers every group title");
if (i > 0) t = t.slice(0, i).trimEnd() + '\n});\n';
writeFileSync(join(stage, 'src/i18n/i18n.test.ts'), t);

const full = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const keep = (o, names) => Object.fromEntries(names.map(n => [n, o[n]]));
const pkg = {
  name: 'nirantar-frontend', private: true, version: '0.0.0', type: 'module',
  scripts: { dev: 'vite', build: 'tsc --noEmit -p . && vite build', typecheck: 'tsc --noEmit -p .', test: 'vitest run', pack: 'node tools/pack.mjs' },
  dependencies: keep(full.dependencies, ['react', 'react-dom', 'zustand', 'lucide-react', 'qrcode', '@fontsource/manrope', '@fontsource/public-sans', '@fontsource/ibm-plex-sans-devanagari']),
  devDependencies: { ...keep(full.devDependencies, ['@types/node', '@types/qrcode', '@types/react', '@types/react-dom', '@vitejs/plugin-react', 'typescript', 'vite', 'vitest']), fflate: full.dependencies.fflate },
};
writeFileSync(join(stage, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
writeFileSync(join(stage, '.gitignore'), 'node_modules\ndist\n*.zip\n.env.local\n');

const files = {};
const walk = (dir) => { for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(p); else files['nirantar-frontend/' + p.slice(stage.length + 1).split('\\').join('/')] = readFileSync(p); } };
walk(stage);
writeFileSync(join(root, 'nirantar-frontend-kit.zip'), zipSync(files, { level: 6 }));
rmSync(stage, { recursive: true, force: true });
console.log(`nirantar-frontend-kit.zip: ${Object.keys(files).length} files`);
