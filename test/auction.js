const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch(); const out = process.argv[2] || '.'; const errors = [];
  const mk = async (o) => { const c = await b.newContext(o); const p = await c.newPage(); p.on('pageerror', e => errors.push(e.message)); return p; };
  const A = await mk({ viewport: { width: 1300, height: 850 } }); const B = await mk({ ...devices['iPhone 13'] });
  await A.goto((process.env.BASE || 'http://localhost:3000') + '/'); await A.fill('#hname', 'Asha'); await A.click('#createBtn'); await A.waitForSelector('.code');
  await B.goto(A.url()); await B.fill('#hname', 'Ravi'); await B.click('#joinBtn');
  await A.waitForSelector('#startBtn:not([disabled])'); await A.click('#startBtn');
  let shot = false;
  for (let i = 0; i < 200 && !shot; i++) for (const p of [A, B]) {
    if (await p.$('#bidBtn')) { 
      await p.click('[data-inc="50"]'); await p.waitForTimeout(150);
      await p.screenshot({ path: out + '/auction.png' }); await p.click('#bidBtn'); shot = true; break; }
    for (const sel of ['#aucBtn', '#rollBtn', '#endBtn']) { const el = await p.$(sel); if (el) { await el.click().catch(()=>{}); await p.waitForTimeout(100); break; } }
  }
  await A.waitForTimeout(400);
  const other = (await A.$('#passBtn')) ? A : B; await other.click('#passBtn'); await A.waitForTimeout(400);
  
  await B.screenshot({ path: out + '/phone2.png' });
  console.log('ERR', errors); await b.close();
})();
