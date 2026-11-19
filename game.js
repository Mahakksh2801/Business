'use strict';
// Game engine for Crore City, an original property-trading board game.
// Money is stored in integer units of ₹0.01 Cr (₹1 lakh). 100 units = ₹1 Cr.

const START_CASH = 1500; // ₹15 Cr
const GO_SALARY = 200;   // ₹2 Cr
const JAIL_FINE = 50;    // ₹0.5 Cr
const JAIL = 10;
const MAX_PLAYERS = 8;
const COLORS = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#fb8c00', '#00acc1', '#ec407a'];

const GROUPS = {
  lav: { color: '#9575cd', name: 'Bihar & Jharkhand' },
  teal: { color: '#00897b', name: 'Central' },
  olive: { color: '#9e9d24', name: 'Rajasthan' },
  maroon: { color: '#880e4f', name: 'Uttar Pradesh' },
  indigo: { color: '#3949ab', name: 'Coast & Plateau' },
  sand: { color: '#c68b59', name: 'Trade Cities' },
  plum: { color: '#8e24aa', name: 'Southern Hubs' },
  gold: { color: '#c9a227', name: 'Metros' },
};

function P(name, group, price, rent, house) { return { type: 'prop', name, group, price, rent, house }; }
const BOARD = [
  { type: 'go', name: 'Payday' },
  P('Patna', 'lav', 60, [2, 10, 30, 90, 160, 250], 50),
  { type: 'chest', name: 'City Fund' },
  P('Ranchi', 'lav', 60, [4, 20, 60, 180, 320, 450], 50),
  { type: 'tax', name: 'GST Bill', amount: 200 },
  { type: 'rail', name: 'CST Mumbai Railway', price: 200 },
  P('Bhopal', 'teal', 100, [6, 30, 90, 270, 400, 550], 50),
  { type: 'chance', name: 'Twist' },
  P('Indore', 'teal', 100, [6, 30, 90, 270, 400, 550], 50),
  P('Raipur', 'teal', 120, [8, 40, 100, 300, 450, 600], 50),
  { type: 'jail', name: 'Lockup / Visitor' },
  P('Jaipur', 'olive', 140, [10, 50, 150, 450, 625, 750], 100),
  { type: 'util', name: 'Power Grid', price: 150 },
  P('Udaipur', 'olive', 140, [10, 50, 150, 450, 625, 750], 100),
  P('Jodhpur', 'olive', 160, [12, 60, 180, 500, 700, 900], 100),
  { type: 'rail', name: 'Howrah Railway', price: 200 },
  { type: 'chest', name: 'City Fund' },
  P('Lucknow', 'maroon', 180, [14, 70, 200, 550, 750, 950], 100),
  P('Kanpur', 'maroon', 180, [14, 70, 200, 550, 750, 950], 100),
  P('Varanasi', 'maroon', 200, [16, 80, 220, 600, 800, 1000], 100),
  { type: 'free', name: 'Festival Holiday' },
  P('Kochi', 'indigo', 220, [18, 90, 250, 700, 875, 1050], 150),
  { type: 'chance', name: 'Twist' },
  P('Coimbatore', 'indigo', 220, [18, 90, 250, 700, 875, 1050], 150),
  P('Pune', 'indigo', 240, [20, 100, 300, 750, 925, 1100], 150),
  { type: 'rail', name: 'New Delhi Railway', price: 200 },
  P('Kolkata', 'sand', 260, [22, 110, 330, 800, 975, 1150], 150),
  P('Ahmedabad', 'sand', 260, [22, 110, 330, 800, 975, 1150], 150),
  { type: 'util', name: 'Water Board', price: 150 },
  P('Gurgaon', 'sand', 280, [24, 120, 360, 850, 1025, 1200], 150),
  { type: 'gotojail', name: 'Go to Lockup' },
  P('Hyderabad', 'plum', 300, [26, 130, 390, 900, 1100, 1275], 200),
  P('Chennai', 'plum', 300, [26, 130, 390, 900, 1100, 1275], 200),
  P('Bangalore', 'plum', 320, [28, 150, 450, 1000, 1200, 1400], 200),
  { type: 'chest', name: 'City Fund' },
  { type: 'rail', name: 'Chennai Central Railway', price: 200 },
  { type: 'chance', name: 'Twist' },
  P('Delhi', 'gold', 350, [35, 175, 500, 1100, 1300, 1500], 200),
  { type: 'tax', name: 'Wealth Tax', amount: 100 },
  P('Mumbai', 'gold', 400, [50, 200, 600, 1400, 1700, 2000], 200),
];
BOARD.forEach((s, i) => { s.i = i; });
const OWNABLE = BOARD.filter(s => s.price).map(s => s.i);
const GROUP_SQ = {};
BOARD.forEach(s => { if (s.group) (GROUP_SQ[s.group] = GROUP_SQ[s.group] || []).push(s.i); });
const RAILS = BOARD.filter(s => s.type === 'rail').map(s => s.i);
const UTILS = BOARD.filter(s => s.type === 'util').map(s => s.i);

const CHANCE = [
  { text: 'Surprise bonus! Walk straight to Payday and pocket ₹2 Cr.', go: 0 },
  { text: 'Your startup opens a Mumbai office. Move to Mumbai.', go: 39 },
  { text: 'A wedding invitation from Jaipur! Travel there, collecting ₹2 Cr if you cross Payday.', go: 11 },
  { text: 'Backwater holiday: head to Kochi, collecting ₹2 Cr if you cross Payday.', go: 21 },
  { text: 'Catch the next train! Move to the closest railway. If someone owns it, pay them double fare.', nearest: 'rail' },
  { text: 'Tatkal ticket confirmed! Hurry to the closest railway. If owned, its owner gets double fare.', nearest: 'rail' },
  { text: 'Meter-reading day: go to the closest utility. If owned, roll and pay 10× your roll.', nearest: 'util' },
  { text: 'Your mutual fund pays out ₹0.5 Cr.', gain: 50 },
  { text: 'Bail Pass: a lawyer friend owes you a favour. Keep this to walk out of the Lockup.', gojf: true },
  { text: 'You missed your exit on the expressway. Step back 3 squares.', back: 3 },
  { text: 'Caught dodging a toll plaza! Straight to the Lockup, no Payday.', jail: true },
  { text: 'Monsoon damage: fix your buildings at ₹0.25 Cr per house and ₹1 Cr per hotel.', repairs: [25, 100] },
  { text: 'Signal-jumping challan from the traffic police: pay ₹0.15 Cr.', pay: 15 },
  { text: 'Business trip via CST Mumbai Railway. Go there, collecting ₹2 Cr if you cross Payday.', go: 5 },
  { text: 'You host the colony Diwali party. Give every player ₹0.5 Cr.', payEach: 50 },
  { text: 'Your flat sale finally closes. Receive ₹1.5 Cr.', gain: 150 },
];
const CHEST = [
  { text: 'Salary credited early! Go to Payday and collect ₹2 Cr.', go: 0 },
  { text: 'A forgotten fixed deposit matures. Receive ₹2 Cr.', gain: 200 },
  { text: 'Dental surgery bill: pay ₹0.5 Cr.', pay: 50 },
  { text: 'Dividend from your tea-estate shares: receive ₹0.5 Cr.', gain: 50 },
  { text: 'Bail Pass: your cousin knows the magistrate. Keep this to walk out of the Lockup.', gojf: true },
  { text: 'Surprise tax raid! Report to the Lockup at once, no Payday.', jail: true },
  { text: 'Your Diwali savings scheme pays out ₹1 Cr.', gain: 100 },
  { text: 'GST refund approved: receive ₹0.2 Cr.', gain: 20 },
  { text: 'Housewarming party at your place! Every player gifts you ₹0.1 Cr.', collectEach: 10 },
  { text: 'Your gold bond matures: receive ₹1 Cr.', gain: 100 },
  { text: 'Emergency hospital stay: pay ₹1 Cr.', pay: 100 },
  { text: 'Coaching class fees are due: pay ₹0.5 Cr.', pay: 50 },
  { text: 'Weekend freelance gig: receive ₹0.25 Cr.', gain: 25 },
  { text: 'Municipal road-widening levy: ₹0.4 Cr per house and ₹1.15 Cr per hotel.', repairs: [40, 115] },
  { text: 'Your biryani wins the neighbourhood cook-off: receive ₹0.1 Cr.', gain: 10 },
  { text: 'A distant aunt leaves you ₹1 Cr in her will.', gain: 100 },
];

const fmt = u => {
  const v = u / 100;
  return '₹' + (Number.isInteger(v) ? v : v.toFixed(2).replace(/0$/, '')) + ' Cr';
};

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const die = () => 1 + Math.floor(Math.random() * 6);
const uid = () => Math.random().toString(36).slice(2, 10);

class GameError extends Error {}
const need = (cond, msg) => { if (!cond) throw new GameError(msg); };

function newRoom(code) {
  return {
    code, status: 'lobby', hostId: null, players: [], order: [], turn: 0,
    props: {}, housesLeft: 32, hotelsLeft: 12,
    phase: null, rollAgain: false, doublesCount: 0, lastRoll: null, rollSeq: 0,
    pending: null, auction: null, debts: [], trades: [],
    decks: { chance: shuffle([...CHANCE.keys()]), chest: shuffle([...CHEST.keys()]) },
    card: null, cardSeq: 0, log: [], txns: [], winner: null, version: 0, created: Date.now(), touched: Date.now(),
  };
}

// ---------- helpers ----------
const player = (r, id) => r.players.find(p => p.id === id);
const pname = (r, id) => id ? (player(r, id)?.name ?? '?') : 'Bank';
const active = r => r.order.map(id => player(r, id)).filter(p => !p.bankrupt);
const current = r => player(r, r.order[r.turn]);
function log(r, msg) { r.log.push({ ts: Date.now(), msg }); if (r.log.length > 300) r.log.splice(0, r.log.length - 300); }
function txn(r, from, to, amount, reason) {
  r.txns.push({ ts: Date.now(), from, to, amount, reason });
  if (r.txns.length > 500) r.txns.splice(0, r.txns.length - 500);
}
const ownerOf = (r, sq) => r.props[sq]?.owner || null;
const ownedBy = (r, id) => Object.keys(r.props).map(Number).filter(sq => r.props[sq].owner === id);
const ownsGroup = (r, id, g) => GROUP_SQ[g].every(sq => ownerOf(r, sq) === id);
const groupHasBuildings = (r, g) => GROUP_SQ[g].some(sq => (r.props[sq]?.houses || 0) > 0);
const mortgageValue = sq => BOARD[sq].price / 2;
const unmortgageCost = sq => Math.ceil(mortgageValue(sq) * 1.1);
const interestFee = sq => Math.ceil(mortgageValue(sq) * 0.1);

function credit(r, p, amount, from, reason) {
  p.cash += amount;
  txn(r, from, p.id, amount, reason);
}

// Charge p `amount` payable to `toId` (null = bank). Queues a debt if p can't pay now.
function charge(r, p, amount, toId, reason) {
  if (amount <= 0) return;
  if (p.cash >= amount && !r.debts.some(d => d.from === p.id)) {
    p.cash -= amount;
    if (toId) player(r, toId).cash += amount;
    txn(r, p.id, toId, amount, reason);
  } else {
    r.debts.push({ id: uid(), from: p.id, to: toId, amount, reason });
    log(r, `${p.name} owes ${fmt(amount)} to ${pname(r, toId)} (${reason}) but has only ${fmt(p.cash)}. Raise funds or declare bankruptcy.`);
  }
}

function rentFor(r, sq, diceTotal, mult = 1) {
  const s = BOARD[sq]; const st = r.props[sq]; const owner = st.owner;
  if (s.type === 'prop') {
    if (st.houses > 0) return s.rent[st.houses];
    return ownsGroup(r, owner, s.group) ? s.rent[0] * 2 : s.rent[0];
  }
  if (s.type === 'rail') {
    const n = RAILS.filter(x => ownerOf(r, x) === owner).length;
    return 25 * Math.pow(2, n - 1) * mult;
  }
  if (s.type === 'util') {
    const n = UTILS.filter(x => ownerOf(r, x) === owner).length;
    return diceTotal * (mult === 10 ? 10 : (n === 2 ? 10 : 4));
  }
  return 0;
}

// ---------- movement ----------
function moveTo(r, p, dest, collectGo = true) {
  if (collectGo && dest < p.pos) { credit(r, p, GO_SALARY, null, 'Passed Payday'); log(r, `${p.name} passed Payday and collected ${fmt(GO_SALARY)}.`); }
  p.pos = dest;
}
function sendToJail(r, p) {
  p.pos = JAIL; p.inJail = true; p.jailTurns = 0; r.rollAgain = false; r.doublesCount = 0;
  log(r, `${p.name} was sent to the Lockup.`);
}

function land(r, p, dice, opts = {}) {
  const s = BOARD[p.pos];
  log(r, `${p.name} landed on ${s.name}.`);
  if (s.price) {
    const st = r.props[p.pos];
    if (!st) { r.pending = { type: 'buy', sq: p.pos }; r.phase = 'buy'; return; }
    if (st.owner === p.id) return;
    if (st.mortgaged) { log(r, `${s.name} is mortgaged, no rent.`); return; }
    let total = dice;
    if (s.type === 'util' && opts.utilTen) {
      const a = die(), b = die(); total = a + b;
      log(r, `${p.name} rolled ${a}+${b}=${total} for the utility.`);
    }
    const rent = rentFor(r, p.pos, total, opts.railDouble ? 2 : (opts.utilTen ? 10 : 1));
    log(r, `${p.name} pays ${fmt(rent)} rent to ${pname(r, st.owner)}.`);
    charge(r, p, rent, st.owner, `Rent: ${s.name}`);
    return;
  }
  if (s.type === 'tax') { log(r, `${p.name} pays ${fmt(s.amount)} ${s.name}.`); charge(r, p, s.amount, null, s.name); return; }
  if (s.type === 'gotojail') { sendToJail(r, p); return; }
  if (s.type === 'chance' || s.type === 'chest') drawCard(r, p, s.type, dice);
}

function drawCard(r, p, deck, dice) {
  const list = deck === 'chance' ? CHANCE : CHEST;
  if (!r.decks[deck].length) r.decks[deck] = shuffle([...list.keys()].filter(k => !r.players.some(pl => pl.gojf.some(g => g.deck === deck && g.idx === k))));
  const idx = r.decks[deck].shift();
  const c = list[idx];
  r.card = { deck, text: c.text, by: p.id, seq: ++r.cardSeq };
  log(r, `${p.name} drew ${deck === 'chance' ? 'Twist' : 'City Fund'}: "${c.text}"`);
  if (!c.gojf) r.decks[deck].push(idx);
  if (c.gojf) { p.gojf.push({ deck, idx }); return; }
  if (c.gain) { credit(r, p, c.gain, null, 'Card: ' + c.text); return; }
  if (c.pay) { charge(r, p, c.pay, null, 'Card: ' + c.text); return; }
  if (c.jail) { sendToJail(r, p); return; }
  if (c.go !== undefined) { moveTo(r, p, c.go); land(r, p, dice); return; }
  if (c.back) { p.pos = (p.pos + 40 - c.back) % 40; land(r, p, dice); return; }
  if (c.nearest) {
    const list2 = c.nearest === 'rail' ? RAILS : UTILS;
    const dest = list2.find(x => x > p.pos) ?? list2[0];
    moveTo(r, p, dest);
    land(r, p, dice, c.nearest === 'rail' ? { railDouble: true } : { utilTen: true });
    return;
  }
  if (c.repairs) {
    let h = 0, H = 0;
    ownedBy(r, p.id).forEach(sq => { const n = r.props[sq].houses; if (n === 5) H++; else h += n; });
    const amt = h * c.repairs[0] + H * c.repairs[1];
    log(r, `${p.name} has ${h} houses and ${H} hotels: pays ${fmt(amt)}.`);
    charge(r, p, amt, null, 'Repairs');
    return;
  }
  if (c.payEach) { active(r).filter(o => o.id !== p.id).forEach(o => charge(r, p, c.payEach, o.id, 'Card: chairperson')); return; }
  if (c.collectEach) { active(r).filter(o => o.id !== p.id).forEach(o => charge(r, o, c.collectEach, p.id, 'Card: birthday')); }
}

function afterResolve(r) {
  if (r.phase === 'buy' || r.phase === 'auction') return;
  const p = current(r);
  r.phase = (r.rollAgain && !p.inJail && !p.bankrupt) ? 'roll' : 'end';
}

function nextTurn(r) {
  if (checkWinner(r)) return;
  let t = r.turn;
  for (let k = 0; k < r.order.length; k++) {
    t = (t + 1) % r.order.length;
    if (!player(r, r.order[t]).bankrupt) break;
  }
  r.turn = t; r.phase = 'roll'; r.rollAgain = false; r.doublesCount = 0; r.pending = null; r.card = null;
  log(r, `It's ${current(r).name}'s turn.`);
}

function checkWinner(r) {
  const a = active(r);
  if (a.length <= (r.solo ? 0 : 1) && r.status === 'playing') {
    r.status = 'ended'; r.winner = a[0]?.id || null; r.phase = null;
    log(r, a[0] ? `🏆 ${a[0].name} wins the game!` : 'Practice game over: bankrupt!');
    return true;
  }
  return false;
}

// ---------- bankruptcy ----------
function bankrupt(r, p) {
  const debt = r.debts.find(d => d.from === p.id);
  const creditor = debt?.to ? player(r, debt.to) : null;
  // sell all buildings to bank at half price
  ownedBy(r, p.id).forEach(sq => {
    const st = r.props[sq];
    if (st.houses > 0) {
      const v = (BOARD[sq].house / 2) * st.houses;
      p.cash += v;
      if (st.houses === 5) r.hotelsLeft++; else r.housesLeft += st.houses;
      st.houses = 0;
    }
  });
  if (creditor && !creditor.bankrupt) {
    if (p.cash > 0) { creditor.cash += p.cash; txn(r, p.id, creditor.id, p.cash, 'Bankruptcy: remaining cash'); }
    ownedBy(r, p.id).forEach(sq => { r.props[sq].owner = creditor.id; });
    creditor.gojf.push(...p.gojf);
    log(r, `💥 ${p.name} is bankrupt! All assets go to ${creditor.name}.`);
  } else {
    if (p.cash > 0) txn(r, p.id, null, p.cash, 'Bankruptcy: remaining cash');
    ownedBy(r, p.id).forEach(sq => { delete r.props[sq]; });
    p.gojf.forEach(g => r.decks[g.deck].push(g.idx));
    log(r, `💥 ${p.name} is bankrupt! Properties return to the bank.`);
  }
  p.gojf = []; p.cash = 0; p.bankrupt = true; p.inJail = false;
  r.debts = r.debts.filter(d => d.from !== p.id);
  // debts owed TO the bankrupt player now go to the bank
  r.debts.forEach(d => { if (d.to === p.id) d.to = null; });
  r.trades = r.trades.filter(t => t.from !== p.id && t.to !== p.id);
  if (r.auction) {
    r.auction.active = r.auction.active.filter(id => id !== p.id);
    if (r.auction.high && r.auction.highBidder === p.id) { r.auction.high = 0; r.auction.highBidder = null; }
    if (r.auction.active.length) r.auction.cur = r.auction.cur % r.auction.active.length;
    maybeCloseAuction(r);
  }
  if (checkWinner(r)) return;
  if (current(r).id === p.id) { r.auction = null; nextTurn(r); }
}

// ---------- auction ----------
function startAuction(r, sq) {
  const ids = active(r).map(p => p.id);
  // bidding starts with the player whose turn it is
  const startIdx = Math.max(0, ids.indexOf(current(r).id));
  r.auction = { sq, high: 0, highBidder: null, active: ids, cur: startIdx, bids: [] };
  r.phase = 'auction'; r.pending = null;
  log(r, `Auction started for ${BOARD[sq].name} (price ${fmt(BOARD[sq].price)}).`);
}
function maybeCloseAuction(r) {
  const a = r.auction; if (!a) return;
  const done = a.active.length === 0 || (a.active.length === 1 && a.highBidder === a.active[0]);
  if (!done) return;
  if (a.highBidder) {
    const w = player(r, a.highBidder);
    charge(r, w, a.high, null, `Auction: ${BOARD[a.sq].name}`);
    r.props[a.sq] = { owner: w.id, houses: 0, mortgaged: false };
    log(r, `🔨 ${w.name} won ${BOARD[a.sq].name} for ${fmt(a.high)}.`);
  } else log(r, `No bids. ${BOARD[a.sq].name} stays with the bank.`);
  r.auction = null; r.phase = null; afterResolve(r);
}
function auctionAdvance(r) {
  const a = r.auction;
  if (!a.active.length) return;
  a.cur = (a.cur + 1) % a.active.length;
  // skip the high bidder (they can't outbid themselves) if others remain
  if (a.active[a.cur] === a.highBidder && a.active.length > 1) a.cur = (a.cur + 1) % a.active.length;
}

// ---------- trades ----------
function validateSide(r, pid, side, label) {
  const p = player(r, pid);
  need(Number.isInteger(side.money) && side.money >= 0, 'Invalid money amount.');
  need(side.money <= p.cash, `${p.name} doesn't have ${fmt(side.money)} (balance ${fmt(p.cash)}).`);
  need(Number.isInteger(side.gojf) && side.gojf >= 0 && side.gojf <= p.gojf.length, 'Invalid Bail Pass count.');
  side.props.forEach(sq => {
    need(ownerOf(r, sq) === pid, `${label} no longer owns ${BOARD[sq]?.name}.`);
    const g = BOARD[sq].group;
    need(!(g && groupHasBuildings(r, g)), `Sell the buildings on the ${GROUPS[g]?.name} set before trading ${BOARD[sq].name}.`);
  });
}
function feesFor(r, propsReceived) { return propsReceived.filter(sq => r.props[sq]?.mortgaged).reduce((s, sq) => s + interestFee(sq), 0); }
function cleanSide(x) {
  return {
    props: [...new Set((x?.props || []).map(Number).filter(n => OWNABLE.includes(n)))],
    money: Math.round(Number(x?.money) || 0),
    gojf: Math.round(Number(x?.gojf) || 0),
  };
}

// ---------- actions ----------
function act(r, pid, a) {
  const p = player(r, pid);
  need(p, 'Not in this room.');
  r.touched = Date.now();
  const type = a.a;

  if (r.status === 'lobby') {
    if (type === 'setColor') {
      need(COLORS.includes(a.color), 'Bad color.');
      need(!r.players.some(o => o.id !== pid && o.color === a.color), 'Color taken.');
      p.color = a.color; return;
    }
    if (type === 'start') {
      need(pid === r.hostId, 'Only the host can start.');
      need(r.players.length >= 1, 'Need at least 1 player.');
      r.solo = r.players.length === 1;
      if (r.solo) log(r, 'Solo practice game: play on your own to try the board and rules.');
      // roll for turn order
      const rolls = r.players.map(pl => { let x, y; return { id: pl.id, d: [x = die(), y = die()], t: x + y, tie: Math.random() }; });
      rolls.sort((m, n) => n.t - m.t || n.tie - m.tie);
      r.order = rolls.map(x => x.id);
      log(r, 'Rolling for turn order: ' + rolls.map(x => `${pname(r, x.id)} ${x.d[0]}+${x.d[1]}=${x.t}`).join(', ') + '.');
      r.status = 'playing'; r.turn = 0; r.phase = 'roll';
      r.orderRolls = rolls.map(x => ({ id: x.id, d: x.d }));
      log(r, `Game started! ${current(r).name} goes first.`);
      return;
    }
    if (type === 'kick') {
      need(pid === r.hostId && a.id !== pid, 'Not allowed.');
      r.players = r.players.filter(o => o.id !== a.id); return;
    }
    throw new GameError('Game has not started.');
  }
  need(r.status === 'playing', 'Game is over.');
  need(!p.bankrupt, 'You are bankrupt.');
  const cur = current(r);
  const myTurn = cur.id === pid;
  const blocked = r.debts.length > 0;

  switch (type) {
    case 'roll': {
      need(myTurn && r.phase === 'roll', 'Not your roll.');
      need(!blocked, 'Debts must be settled first.');
      const d1 = die(), d2 = die(); const doubles = d1 === d2;
      r.lastRoll = { d1, d2, by: pid, seq: ++r.rollSeq }; r.card = null;
      log(r, `${p.name} rolled ${d1} + ${d2} = ${d1 + d2}${doubles ? ' (doubles!)' : ''}.`);
      if (p.inJail) {
        if (doubles) { p.inJail = false; p.jailTurns = 0; r.rollAgain = false; log(r, `${p.name} rolled doubles and leaves the Lockup.`); }
        else {
          p.jailTurns++;
          if (p.jailTurns < 3) { log(r, `${p.name} stays in the Lockup.`); r.rollAgain = false; r.phase = 'end'; return; }
          p.inJail = false; p.jailTurns = 0; r.rollAgain = false;
          log(r, `${p.name} failed 3 times and must pay ${fmt(JAIL_FINE)}.`);
          charge(r, p, JAIL_FINE, null, 'Lockup fine');
        }
      } else if (doubles) {
        r.doublesCount++;
        if (r.doublesCount >= 3) { log(r, `${p.name} rolled doubles three times!`); sendToJail(r, p); r.phase = 'end'; return; }
        r.rollAgain = true;
      } else r.rollAgain = false;
      const dest = (p.pos + d1 + d2) % 40;
      moveTo(r, p, dest);
      land(r, p, d1 + d2);
      afterResolve(r);
      return;
    }
    case 'payJail': {
      need(myTurn && r.phase === 'roll' && p.inJail, 'Not possible now.');
      need(p.cash >= JAIL_FINE, 'Not enough money.');
      charge(r, p, JAIL_FINE, null, 'Lockup fine'); p.inJail = false; p.jailTurns = 0;
      log(r, `${p.name} paid ${fmt(JAIL_FINE)} to leave the Lockup.`); return;
    }
    case 'useCard': {
      need(myTurn && r.phase === 'roll' && p.inJail && p.gojf.length, 'Not possible now.');
      const g = p.gojf.shift(); r.decks[g.deck].push(g.idx); p.inJail = false; p.jailTurns = 0;
      log(r, `${p.name} used a Bail Pass.`); return;
    }
    case 'buy': {
      need(myTurn && r.phase === 'buy' && r.pending, 'Nothing to buy.');
      const sq = r.pending.sq; const price = BOARD[sq].price;
      need(p.cash >= price, 'Not enough money. Mortgage something or auction it.');
      p.cash -= price; txn(r, pid, null, price, `Bought ${BOARD[sq].name}`);
      r.props[sq] = { owner: pid, houses: 0, mortgaged: false };
      log(r, `${p.name} bought ${BOARD[sq].name} for ${fmt(price)}.`);
      r.pending = null; r.phase = null; afterResolve(r); return;
    }
    case 'auction': {
      need(myTurn && r.phase === 'buy' && r.pending, 'Nothing to auction.');
      startAuction(r, r.pending.sq); return;
    }
    case 'bid': {
      const au = r.auction; need(au && r.phase === 'auction', 'No auction.');
      need(au.active[au.cur] === pid, "Wait for your turn to bid.");
      const amt = Math.round(Number(a.amount));
      need(amt > au.high && amt >= 1, `Bid must be more than ${fmt(au.high)}.`);
      need(amt <= p.cash, `You only have ${fmt(p.cash)}.`);
      au.high = amt; au.highBidder = pid; au.bids.push({ id: pid, amt });
      log(r, `${p.name} bids ${fmt(amt)}.`);
      auctionAdvance(r); maybeCloseAuction(r); return;
    }
    case 'pass': {
      const au = r.auction; need(au && r.phase === 'auction', 'No auction.');
      need(au.active[au.cur] === pid, 'Not your turn to bid.');
      log(r, `${p.name} passes.`);
      au.active.splice(au.cur, 1);
      if (au.active.length) { au.cur = au.cur % au.active.length; if (au.active[au.cur] === au.highBidder && au.active.length > 1) au.cur = (au.cur + 1) % au.active.length; }
      maybeCloseAuction(r); return;
    }
    case 'endTurn': {
      need(myTurn && r.phase === 'end', "You can't end your turn yet.");
      need(!blocked, 'Debts must be settled first.');
      nextTurn(r); return;
    }
    case 'build': {
      const sq = Number(a.sq); const s = BOARD[sq]; const st = r.props[sq];
      need(myTurn && !r.auction, 'You can build only on your turn.');
      need(s?.type === 'prop' && st?.owner === pid, 'Not your property.');
      need(ownsGroup(r, pid, s.group), 'You need the full color set.');
      need(GROUP_SQ[s.group].every(x => !r.props[x].mortgaged), 'Unmortgage the whole set first.');
      need(st.houses < 5, 'Already has a hotel.');
      need(GROUP_SQ[s.group].every(x => r.props[x].houses >= st.houses), 'Build evenly across the set.');
      if (st.houses === 4) need(r.hotelsLeft > 0, 'No hotels left in the bank.'); else need(r.housesLeft > 0, 'No houses left in the bank.');
      need(p.cash >= s.house, `Not enough money (${fmt(s.house)} needed).`);
      p.cash -= s.house; txn(r, pid, null, s.house, `${st.houses === 4 ? 'Hotel' : 'House'} on ${s.name}`);
      if (st.houses === 4) { r.hotelsLeft--; r.housesLeft += 4; } else r.housesLeft--;
      st.houses++;
      log(r, `${p.name} built a ${st.houses === 5 ? 'hotel' : 'house'} on ${s.name} for ${fmt(s.house)}.`);
      return;
    }
    case 'sell': {
      const sq = Number(a.sq); const s = BOARD[sq]; const st = r.props[sq];
      need(s?.type === 'prop' && st?.owner === pid && st.houses > 0, 'Nothing to sell.');
      need(GROUP_SQ[s.group].every(x => r.props[x].houses <= st.houses), 'Sell evenly across the set.');
      if (st.houses === 5) { need(r.housesLeft >= 4, 'Not enough houses in the bank to break the hotel.'); r.housesLeft -= 4; r.hotelsLeft++; }
      else r.housesLeft++;
      st.houses--;
      const v = s.house / 2; credit(r, p, v, null, `Sold building on ${s.name}`);
      log(r, `${p.name} sold a building on ${s.name} for ${fmt(v)}.`);
      return;
    }
    case 'mortgage': {
      const sq = Number(a.sq); const s = BOARD[sq]; const st = r.props[sq];
      need(st?.owner === pid && !st.mortgaged, 'Cannot mortgage.');
      need(!(s.group && groupHasBuildings(r, s.group)), 'Sell all buildings in this set first.');
      st.mortgaged = true; credit(r, p, mortgageValue(sq), null, `Mortgaged ${s.name}`);
      log(r, `${p.name} mortgaged ${s.name} for ${fmt(mortgageValue(sq))}.`);
      return;
    }
    case 'unmortgage': {
      const sq = Number(a.sq); const s = BOARD[sq]; const st = r.props[sq];
      need(st?.owner === pid && st.mortgaged, 'Not mortgaged.');
      const c = unmortgageCost(sq); need(p.cash >= c, `Need ${fmt(c)}.`);
      p.cash -= c; txn(r, pid, null, c, `Unmortgaged ${s.name}`); st.mortgaged = false;
      log(r, `${p.name} unmortgaged ${s.name} for ${fmt(c)}.`);
      return;
    }
    case 'payDebt': {
      const d = r.debts.find(x => x.from === pid); need(d, 'No debt.');
      need(p.cash >= d.amount, `You need ${fmt(d.amount)} but have ${fmt(p.cash)}.`);
      p.cash -= d.amount; if (d.to) player(r, d.to).cash += d.amount;
      txn(r, pid, d.to, d.amount, d.reason);
      r.debts = r.debts.filter(x => x !== d);
      log(r, `${p.name} paid ${fmt(d.amount)} to ${pname(r, d.to)}.`);
      return;
    }
    case 'bankrupt': {
      need(r.debts.some(x => x.from === pid), 'You can only declare bankruptcy when you owe money you cannot pay.');
      bankrupt(r, p); return;
    }
    case 'propose': {
      const to = player(r, a.to); need(to && !to.bankrupt && to.id !== pid, 'Pick another player.');
      const give = cleanSide(a.give), get = cleanSide(a.get);
      need(give.props.length || give.money || give.gojf || get.props.length || get.money || get.gojf, 'The deal is empty.');
      validateSide(r, pid, give, 'You');
      validateSide(r, to.id, get, to.name);
      if (a.replaces) {
        const old = r.trades.find(t => t.id === a.replaces && t.to === pid);
        if (old) { r.trades = r.trades.filter(t => t !== old); log(r, `${p.name} countered ${pname(r, old.from)}'s deal.`); }
      }
      const t = { id: uid(), from: pid, to: to.id, give, get, ts: Date.now() };
      r.trades.push(t);
      log(r, `${p.name} proposed a deal to ${to.name}.`);
      return;
    }
    case 'cancelTrade': {
      const t = r.trades.find(x => x.id === a.id && x.from === pid); need(t, 'No such deal.');
      r.trades = r.trades.filter(x => x !== t); log(r, `${p.name} withdrew a deal.`); return;
    }
    case 'rejectTrade': {
      const t = r.trades.find(x => x.id === a.id && x.to === pid); need(t, 'No such deal.');
      r.trades = r.trades.filter(x => x !== t); log(r, `${p.name} rejected ${pname(r, t.from)}'s deal.`); return;
    }
    case 'acceptTrade': {
      const t = r.trades.find(x => x.id === a.id && x.to === pid); need(t, 'No such deal.');
      const A = player(r, t.from), B = p;
      validateSide(r, A.id, t.give, A.name);
      validateSide(r, B.id, t.get, B.name);
      const feeA = feesFor(r, t.get.props), feeB = feesFor(r, t.give.props);
      need(A.cash - t.give.money + t.get.money >= feeA, `${A.name} can't cover the 10% fee on mortgaged properties.`);
      need(B.cash - t.get.money + t.give.money >= feeB, `You can't cover the 10% fee on mortgaged properties (${fmt(feeB)}).`);
      // money
      if (t.give.money) { A.cash -= t.give.money; B.cash += t.give.money; txn(r, A.id, B.id, t.give.money, 'Deal'); }
      if (t.get.money) { B.cash -= t.get.money; A.cash += t.get.money; txn(r, B.id, A.id, t.get.money, 'Deal'); }
      t.give.props.forEach(sq => { r.props[sq].owner = B.id; });
      t.get.props.forEach(sq => { r.props[sq].owner = A.id; });
      B.gojf.push(...A.gojf.splice(0, t.give.gojf));
      A.gojf.push(...B.gojf.splice(0, t.get.gojf));
      if (feeA) { A.cash -= feeA; txn(r, A.id, null, feeA, '10% interest on mortgaged property received'); }
      if (feeB) { B.cash -= feeB; txn(r, B.id, null, feeB, '10% interest on mortgaged property received'); }
      r.trades = r.trades.filter(x => x !== t);
      // other open deals may now be invalid; drop ones that reference moved properties
      const moved = new Set([...t.give.props, ...t.get.props]);
      r.trades = r.trades.filter(x => ![...x.give.props, ...x.get.props].some(sq => moved.has(sq)));
      const desc = s => [...s.props.map(sq => BOARD[sq].name), s.money ? fmt(s.money) : null, s.gojf ? `${s.gojf} Bail Pass` : null].filter(Boolean).join(', ') || 'nothing';
      log(r, `🤝 Deal done: ${A.name} gave ${desc(t.give)}; ${B.name} gave ${desc(t.get)}.`);
      return;
    }
    case 'skip': {
      // host can move things along when the active player is offline
      need(pid === r.hostId, 'Only the host can do that.');
      if (r.auction) {
        const au = r.auction; const who = player(r, au.active[au.cur]);
        need(!who.connected, `${who.name} is online.`);
        log(r, `Host passed for ${who.name} (offline).`);
        au.active.splice(au.cur, 1); if (au.active.length) au.cur %= au.active.length; maybeCloseAuction(r); return;
      }
      need(!cur.connected, `${cur.name} is online.`);
      need(!blocked, 'Debts must be settled first.');
      log(r, `Host skipped ${cur.name}'s turn (offline).`);
      nextTurn(r); return;
    }
    default: throw new GameError('Unknown action.');
  }
}

function addPlayer(r, name, color) {
  need(r.status === 'lobby', 'Game already started. Ask to rejoin from your original device or link.');
  need(r.players.length < MAX_PLAYERS, 'Room is full (8 players).');
  name = String(name || '').trim().slice(0, 16);
  need(name, 'Enter a name.');
  need(!r.players.some(p => p.name.toLowerCase() === name.toLowerCase()), 'That name is taken.');
  if (!COLORS.includes(color) || r.players.some(p => p.color === color)) color = COLORS.find(c => !r.players.some(p => p.color === c));
  const p = { id: uid(), token: uid() + uid(), name, color, cash: START_CASH, pos: 0, inJail: false, jailTurns: 0, gojf: [], bankrupt: false, connected: true };
  r.players.push(p);
  if (!r.hostId) r.hostId = p.id;
  log(r, `${name} joined.`);
  return p;
}

function publicState(r) {
  return {
    code: r.code, status: r.status, hostId: r.hostId, order: r.order, turn: r.turn,
    players: r.players.map(p => ({ id: p.id, name: p.name, color: p.color, cash: p.cash, pos: p.pos, inJail: p.inJail, jailTurns: p.jailTurns, gojf: p.gojf.length, bankrupt: p.bankrupt, connected: p.connected })),
    props: r.props, housesLeft: r.housesLeft, hotelsLeft: r.hotelsLeft,
    phase: r.phase, rollAgain: r.rollAgain, lastRoll: r.lastRoll, pending: r.pending, auction: r.auction,
    debts: r.debts, trades: r.trades, card: r.card, log: r.log.slice(-120), txns: r.txns.slice(-200), winner: r.winner, version: r.version,
    orderRolls: r.orderRolls || null, solo: !!r.solo,
  };
}

module.exports = { BOARD, GROUPS, GROUP_SQ, COLORS, newRoom, addPlayer, act, publicState, GameError, fmt, START_CASH };
