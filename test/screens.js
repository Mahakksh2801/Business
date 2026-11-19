// Takes README screenshots: home preview, dice mid-roll, final board (desktop + phone), solo game.
const { chromium, devices } = require('playwright');
(async () => {
  const BASE = process.env.BASE || 'http://localhost:3000'; const out = process.argv[2] || '.';
  const b = await chromium.launch();
  const A = await (await b.newContext({ viewport: { width: 1300, height: 860 }, deviceScaleFactor: 2 })).newPage();
  const B = await (await b.newContext({ ...devices['iPhone 13'] })).newPage();
  const errors = []; [A, B].forEach(p => p.on('pageerror', e => errors.push(e.message)));
  await B.goto(BASE + '/'); await B.waitForSelector('.board'); await B.screenshot({ path: out + '/home-preview.png', fullPage: true });
  await A.goto(BASE + '/'); await A.fill('#hname', 'Asha'); await A.click('#createBtn'); await A.waitForSelector('.code');
  await B.goto(A.url()); await B.fill('#hname', 'Ravi'); await B.click('#joinBtn');
  await A.waitForSelector('#startBtn'); await A.waitForFunction(() => document.querySelectorAll('.plist li').length === 2);
  await A.click('#startBtn'); await A.waitForSelector('#board');
  const step = async () => { for (const p of [A, B]) for (const sel of ['#payDebt:not([disabled])', '#buyBtn:not([disabled])', '#rollBtn', '#endBtn', '#passBtn', '#aucBtn']) { const el = await p.$(sel); if (el) { await el.click().catch(() => {}); await p.waitForTimeout(1500); return; } } await A.waitForTimeout(300); };
  for (let i = 0; i < 40; i++) await step();
  for (let i = 0; i < 20; i++) { if (await A.$('#rollBtn') || await B.$('#rollBtn')) break; await step(); }
  const roller = (await A.$('#rollBtn')) ? A : B;
  await roller.click('#rollBtn');
  await A.waitForTimeout(420); await A.screenshot({ path: out + '/rolling.png' });
  await A.waitForTimeout(1600); await A.screenshot({ path: out + '/board.png' });
  await B.screenshot({ path: out + '/phone.png' });
  console.log('errors', errors); await b.close();
})();
