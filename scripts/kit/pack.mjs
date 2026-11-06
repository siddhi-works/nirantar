// Packs the two folders you are allowed to change into one zip to send back: node tools/pack.mjs
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { zipSync } from 'fflate';

const files = {};
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files[p.split('\\').join('/')] = readFileSync(p);
  }
};
walk('src'); walk('public');
const out = `nirantar-frontend-changes-${new Date().toISOString().slice(0, 10)}.zip`;
writeFileSync(out, zipSync(files, { level: 6 }));
console.log(`Wrote ${out} (${Object.keys(files).length} files). Send this file to the project owner.`);
