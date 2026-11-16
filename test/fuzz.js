const G = require('../game');
let errs = {}, games = 0, ended = 0, turnsTotal = 0;
for (let g = 0; g < 300; g++) {
  const r = G.newRoom('T');
  const n = 2 + (g % 7);
  for (let i = 0; i < n; i++) G.addPlayer(r, 'P' + i, null);
  G.act(r, r.players[0].id, { a: 'start' });
  let steps = 0, fails = 0;
  while (r.status === 'playing' && steps < 20000) {
    steps++;
    const acts = [];
    for (const p of r.players) {
      if (p.bankrupt) continue;
      acts.push([p.id, { a: 'roll' }], [p.id, { a: 'buy' }], [p.id, { a: 'auction' }], [p.id, { a: 'endTurn' }],
        [p.id, { a: 'bid', amount: (r.auction?.high || 0) + 10 }], [p.id, { a: 'pass' }], [p.id, { a: 'payDebt' }],
        [p.id, { a: 'payJail' }], [p.id, { a: 'useCard' }]);
      const mine = Object.keys(r.props).filter(k => r.props[k].owner === p.id).map(Number);
      if (mine.length) { const sq = mine[Math.floor(Math.random() * mine.length)];
        acts.push([p.id, { a: 'build', sq }], [p.id, { a: 'build', sq }], [p.id, { a: 'mortgage', sq }], [p.id, { a: 'unmortgage', sq }], [p.id, { a: 'sell', sq }]); }
      if (r.debts.some(d => d.from === p.id) && Math.random() < 0.05) acts.push([p.id, { a: 'bankrupt' }]);
      const other = r.players.find(o => o.id !== p.id && !o.bankrupt);
      if (other && Math.random() < 0.02) acts.push([p.id, { a: 'propose', to: other.id, give: { props: mine.slice(0, 1), money: 10 }, get: { money: 5 } }]);
      for (const t of r.trades) if (t.to === p.id) acts.push([p.id, { a: Math.random() < .5 ? 'acceptTrade' : 'rejectTrade', id: t.id }]);
    }
    const [pid, a] = acts[Math.floor(Math.random() * acts.length)];
    try { G.act(r, pid, a); fails = 0; } catch (e) { if (++fails > 3000) { console.error("STUCK", JSON.stringify({phase:r.phase,debts:r.debts,auction:r.auction,turn:r.order[r.turn], players:r.players.map(p=>[p.id,p.cash,p.bankrupt,p.inJail])})); process.exit(1);} if (!(e instanceof G.GameError)) { console.error(e); process.exit(1); } errs[e.message] = 1; }
    // invariants
    for (const p of r.players) if (p.cash < 0) { console.error('negative cash', p, a); process.exit(1); }
    if (r.housesLeft < 0 || r.hotelsLeft < 0) { console.error('supply'); process.exit(1); }
    let h = 0, H = 0; for (const k in r.props) { const x = r.props[k].houses; if (x === 5) H++; else h += x; }
    if (h + r.housesLeft !== 32 || H + r.hotelsLeft !== 12) { console.error('building count', h, r.housesLeft, H, r.hotelsLeft, a); process.exit(1); }
    if (r.status === 'playing' && G.publicState(r) && r.players.find(p=>p.id===r.order[r.turn]).bankrupt) { console.error('bankrupt current'); process.exit(1); }
    // stuck check: if debts empty and no auction and phase null
    if (r.status === 'playing' && !r.phase) { console.error('null phase', a); process.exit(1); }
  }
  games++; if (r.status === 'ended') ended++; turnsTotal += steps;
}
console.log({ games, ended, avgSteps: turnsTotal / games });
