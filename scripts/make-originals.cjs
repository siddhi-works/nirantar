// Rebuilds the two "original follow-up" PDFs from the sample data, so the document a doctor opens matches the names, doctor and dates on the dashboard.
// Needs Playwright (not a project dependency): NODE_PATH=$(npm root -g) node scripts/make-originals.cjs <docs.json>
// docs.json: the prescription slips, from `npx tsx -e "...parseDocuments()..."`.
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { chromium } = require('playwright');

const docs = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const fmt = d => d.split('-').reverse().join('/');
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const page = d => `<section>
  <p class="banner">SYNTHETIC / AI RESEARCH DATA · NOT A REAL PRESCRIPTION</p>
  <p class="date">${fmt(d.date)}</p>
  <p>ABHA ID – ${esc(d.header.abha)}</p>
  <p><b>${esc(d.header.name)}</b>,<br>${d.header.age}/${d.header.sex}, ${d.header.weightKg} kg<br>${esc(d.header.place)}</p>
  <p><b>C/O –</b> ${esc(d.complaint)}</p>
  <p><b>I →</b> ${esc(d.investigations)}</p>
  <p><b>∆ →</b> ${esc(d.diagnosis)}</p>
  <p><b>Adv :</b></p>
  <ol>${d.advice.map(a => `<li>${esc(a)}</li>`).join('')}</ol>
  <p class="sign">${esc(d.doctor)}<br>Reg. No. ${esc(d.regNo)}</p>
</section>`;
const html = pid => `<!doctype html><meta charset="utf-8"><style>
  @page { size: A4; margin: 0 } body { margin: 0; font: 15px/1.6 Georgia, serif; color: #111 }
  section { box-sizing: border-box; height: 297mm; padding: 28mm 24mm; page-break-after: always; position: relative }
  .banner { font: 600 11px sans-serif; letter-spacing: .04em; color: #555; border-bottom: 1px solid #bbb; padding-bottom: 6px }
  .date { text-align: right; font-weight: 700 } ol { margin: 0; padding-left: 22px } .sign { position: absolute; right: 24mm; bottom: 28mm; text-align: right }
</style>${docs.filter(d => d.patientId === pid).sort((a, b) => a.visit - b.visit).map(page).join('')}`;

(async () => {
  const browser = await chromium.launch();
  const p = await browser.newPage();
  for (const [pid, n] of [['P1', 1], ['P2', 2]]) {
    await p.setContent(html(pid));
    await p.pdf({ path: join(__dirname, `../server/assets/originals/patient-${n}-followups.pdf`), format: 'A4', printBackground: true });
  }
  await browser.close();
  console.log('wrote both PDFs');
})();
