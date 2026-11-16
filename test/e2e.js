const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const out = process.argv[2] || '.';
  const errors = [];
  const mk = async (opts) => { const c = await b.newContext(opts); const p = await c.newPage(); p.on('pageerror', e => errors.push(e.message)); p.on('console', m => m.type()==='error' && errors.push(m.text())); return p; };
  const A = await mk({ viewport: { width: 1300, height: 850 } });
  const B = await mk({ ...devices['iPhone 13'] });
  const Cc = await mk({ viewport: { width: 1000, height: 800 } });
  await A.goto((process.env.BASE || 'http://localhost:3000') + '/');
  await A.fill('#hname', 'Asha'); await A.click('#createBtn');
  await A.waitForSelector('.code');
  const url = A.url(); console.log('room url', url);
  await B.goto(url); await B.fill('#hname', 'Ravi'); await B.click('#joinBtn');
  await Cc.goto(url); await Cc.fill('#hname', 'Meera'); await Cc.click('#joinBtn');
  await A.waitForFunction(() => document.querySelectorAll('.plist li').length === 3);
  await A.screenshot({ path: out + '/lobby.png' });
  await A.click('#startBtn');
  for (const p of [A, B, Cc]) await p.waitForSelector('#board');
  // play: whoever has a button, press it, for many iterations
  const pages = [A, B, Cc];
  for (let i = 0; i < 120; i++) {
    for (const p of pages) {
      for (const sel of ['#payDebt:not([disabled])', '#buyBtn:not([disabled])', '#rollBtn', '#endBtn', '#passBtn', '#aucBtn']) {
        const el = await p.$(sel); if (el) { await el.click().catch(()=>{}); await p.waitForTimeout(120); break; }
      }
    }
  }
  await A.waitForTimeout(800);
  await A.screenshot({ path: out + '/desk.png' });
  await B.screenshot({ path: out + '/phone.png', fullPage: true });
  // deal test: A proposes to B
  await A.click('#dealBtn'); await A.waitForSelector('#cSend');
  await A.fill('#cGiveM', '1.5'); await A.waitForTimeout(200);
  await A.screenshot({ path: out + '/compose.png' }); console.log('wallet', await A.textContent('#walletAmt'), await A.evaluate(()=>[...document.querySelectorAll('.modal p')].map(e=>e.innerText)));
  await A.click('#cSend');
  await B.waitForSelector('#tAcc', { timeout: 5000 });
  await B.screenshot({ path: out + '/incoming.png' });
  await B.click('#tAcc');
  await A.waitForTimeout(500);
  // reload B (rejoin)
  await B.reload(); await B.waitForSelector('#board'); 
  console.log('B wallet after reload', await B.textContent('#walletAmt'));
  const st = await A.evaluate(() => [...document.querySelectorAll('.pl')].map(e => e.innerText.replace(/\n/g,' | ')));
  console.log(st);
  console.log('ERRORS', errors);
  await b.close();
})();
