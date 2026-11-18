'use strict';
(() => {
// ================= data =================
let BOARD = [], GROUPS = {}, COLORS = [];
const SHORT = { 'CST Mumbai Railway': 'CST Mumbai Rly', 'Howrah Railway': 'Howrah Rly', 'New Delhi Railway': 'New Delhi Rly', 'Chennai Central Railway': 'Chennai Central Rly', 'Lockup / Visitor': 'Lockup / Visitor', 'Festival Holiday': 'Festival Holiday' };
const ICON = { go: '💵', chest: '🏛️', chance: '🃏', tax: '🧾', rail: '🚆', jail: '🔐', free: '🪔', gotojail: '🚨' };
const UTIL_ICON = { 'Power Grid': '⚡', 'Water Board': '💧' };

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = u => { const v = u / 100; return (v < 0 ? '−' : '') + '₹' + (Number.isInteger(v) ? Math.abs(v) : Math.abs(v).toFixed(2).replace(/0$/, '')) + ' Cr'; };
const toUnits = s => Math.round(parseFloat(String(s).replace(/[^0-9.]/g, '')) * 100) || 0;

// ================= state =================
let S = null;           // public game state
let me = null;          // my player id
let sess = null;        // {code, playerId, token}
let ws = null, wsReady = false, retry = 0;
let ui = { tab: 'players', bid: null, seenRoll: 0, seenCard: 0, seenTrades: new Set(), lastCash: null, first: true, homeColor: null, joinCode: '', peek: null };
const pendingSends = [];

try { sess = JSON.parse(localStorage.getItem('cc_sess') || 'null'); } catch { sess = null; }
const urlCode = (location.pathname.match(/^\/r\/([A-Za-z0-9]{4,8})/) || [])[1]?.toUpperCase() || '';
if (urlCode) ui.joinCode = urlCode;
if (sess && urlCode && sess.code !== urlCode) sess = null; // link to a different room
function saveSess(v) { sess = v; try { v ? localStorage.setItem('cc_sess', JSON.stringify(v)) : localStorage.removeItem('cc_sess'); } catch {} }
let savedName = ''; try { savedName = localStorage.getItem('cc_name') || ''; } catch {}

// ================= networking =================
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => {
    wsReady = true; retry = 0; $('#conn').classList.add('hidden');
    if (sess) ws.send(JSON.stringify({ t: 'rejoin', ...sess }));
    else if (ui.joinCode) ws.send(JSON.stringify({ t: 'peek', code: ui.joinCode }));
    while (pendingSends.length) ws.send(pendingSends.shift());
  };
  ws.onmessage = e => onMsg(JSON.parse(e.data));
  ws.onclose = () => {
    wsReady = false;
    if (S) $('#conn').classList.remove('hidden');
    setTimeout(connect, Math.min(8000, 500 * 2 ** retry++));
  };
}
function send(m) { const s = JSON.stringify(m); if (wsReady) ws.send(s); else pendingSends.push(s); }
const act = (a, extra = {}) => send({ t: 'act', a, ...extra });

function onMsg(m) {
  if (m.t === 'joined') {
    me = m.playerId; saveSess({ code: m.code, playerId: m.playerId, token: m.token });
    if (location.pathname !== '/r/' + m.code) history.replaceState(null, '', '/r/' + m.code);
  } else if (m.t === 'state') { setState(m.state); }
  else if (m.t === 'rejoinFailed') { saveSess(null); S = null; me = null; render(); if (ui.joinCode) send({ t: 'peek', code: ui.joinCode }); }
  else if (m.t === 'peek') { ui.peek = m.room; if (!S) renderHome(); }
  else if (m.t === 'error') toast(m.msg);
}

// ================= helpers =================
const P = id => S.players.find(p => p.id === id);
const meP = () => P(me);
const cur = () => P(S.order[S.turn]);
const ownedBy = id => Object.keys(S.props).map(Number).filter(sq => S.props[sq].owner === id).sort((a, b) => a - b);
const groupSq = g => BOARD.filter(s => s.group === g).map(s => s.i);
const ownsGroup = (id, g) => groupSq(g).every(sq => S.props[sq]?.owner === id);
const groupHasBld = g => groupSq(g).some(sq => (S.props[sq]?.houses || 0) > 0);
const mortVal = sq => BOARD[sq].price / 2;
const unmortCost = sq => Math.ceil(mortVal(sq) * 1.1);
const sqColor = s => s.group ? GROUPS[s.group].color : (s.type === 'rail' ? '#455a64' : s.type === 'util' ? '#78909c' : '#999');
function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), ms); }
function calc(title, lines, result, resultLabel = 'Remaining') {
  return `<div class="calc">${title ? `<div class="ttl">${esc(title)}</div>` : ''}${lines.map(([l, v, sign]) => `<div class="ln"><span>${sign || ''} ${esc(l)}</span><span>${fmt(v)}</span></div>`).join('')}<div class="ln eq"><span>= ${esc(resultLabel)}</span><span class="${result < 0 ? 'neg' : 'pos'}">${fmt(result)}</span></div></div>`;
}
function setHTML(el, html) {
  if (!el || el._h === html) return;
  const a = document.activeElement; const id = a && el.contains(a) ? a.id : null;
  const sel = id && a.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null;
  el.innerHTML = html; el._h = html;
  if (id) { const n = document.getElementById(id); if (n) { n.focus(); if (sel) try { n.setSelectionRange(...sel); } catch {} } }
}

// ================= state update =================
function setState(st) {
  const prev = S; S = st;
  if (S.status === 'lobby') { renderLobby(); return; }
  if (!$('.game')) buildGame();
  // dice animation
  if (S.lastRoll && S.lastRoll.seq !== ui.seenRoll) {
    const anim = !ui.first; ui.seenRoll = S.lastRoll.seq; animateDice(S.lastRoll, anim);
    if (anim) { ui.holdUntil = Date.now() + 1300; const rp = P(S.lastRoll.by); if (rp) setTimeout(() => flashSq(rp.pos), 1350); }
  }
  if (S.card && S.card.seq !== ui.seenCard) { if (!ui.first) toast(`${P(S.card.by)?.name}: ${S.card.text}`, 4000); ui.seenCard = S.card.seq; }
  // wallet delta
  const mp = meP();
  if (mp && ui.lastCash !== null && mp.cash !== ui.lastCash) { const w = $('#wallet'); w.classList.remove('bump'); void w.offsetWidth; w.classList.add('bump'); }
  ui.lastCash = mp?.cash ?? null;
  // incoming trades
  for (const t of S.trades) if (t.to === me && !ui.seenTrades.has(t.id)) { ui.seenTrades.add(t.id); if (!modalOpen('compose')) openIncoming(t.id); }
  // refresh open modals that depend on state
  if (modalOpen('incoming')) { const id = $('#modal-root').dataset.arg; if (!S.trades.some(t => t.id === id)) closeModal(); else openIncoming(id); }
  if (modalOpen('deed')) openDeed(+$('#modal-root').dataset.arg);
  if (modalOpen('compose')) refreshCompose();
  if (modalOpen('pprops')) openPlayerProps($('#modal-root').dataset.arg);
  ui.first = false;
  renderGame();
}

// ================= home =================
function render() { if (!S) renderHome(); else if (S.status === 'lobby') renderLobby(); else { if (!$('.game')) buildGame(); renderGame(); } }

function renderHome() {
  const taken = new Set((ui.peek?.players || []).map(p => p.color));
  if (!ui.homeColor || taken.has(ui.homeColor)) ui.homeColor = COLORS.find(c => !taken.has(c)) || COLORS[0];
  const joining = !!ui.joinCode;
  const existing = $('#hname')?.value ?? savedName;
  $('#app').innerHTML = `
  <div class="home">
    <div class="logo"><div class="mark">₹</div><div><h1>Crore City</h1><div class="muted">Buy cities, collect rent, become a crorepati. Play with 2–8 friends or practise solo.</div></div></div>
    <div class="card">
      <label for="hname">Your name</label>
      <input id="hname" maxlength="16" placeholder="e.g. Priya" value="${esc(existing)}" autocomplete="nickname">
      <label>Token colour</label>
      <div class="swatches">${COLORS.map(c => `<button class="sw ${c === ui.homeColor ? 'sel' : ''} ${taken.has(c) ? 'taken' : ''}" style="background:${c}" data-c="${c}" ${taken.has(c) ? 'disabled' : ''} aria-label="colour"></button>`).join('')}</div>
    </div>
    ${joining ? `
    <div class="card">
      <h3>Join room <span style="color:var(--brand)">${esc(ui.joinCode)}</span></h3>
      ${ui.peek === null ? '<p class="muted">Room not found. Check the link or code.</p>' : ui.peek ? `<p class="muted">${ui.peek.status === 'lobby' ? 'Waiting to start' : 'Game in progress (only existing players can rejoin)'} · ${ui.peek.players.map(p => `<span class="dot" style="background:${p.color}"></span> ${esc(p.name)}`).join(' &nbsp;')}</p>` : ''}
      <button class="big" id="joinBtn">Join game</button>
      <p class="muted" style="text-align:center"><a href="/" id="notThis">Create a different room instead</a></p>
    </div>` : `
    <div class="card">
      <button class="big" id="createBtn">Create a room</button>
      <div class="row" style="margin-top:12px"><input id="jcode" placeholder="Room code" maxlength="8" style="text-transform:uppercase"><button class="sec" id="joinCodeBtn">Join</button></div>
    </div>`}
    <div class="card"><h3>The board</h3>${previewBoard({ props: {}, players: [], order: [], turn: 0 })}</div>
    <div class="card muted">
      <b>How it works:</b> create a room, share the link, everyone picks a name and colour, and the host starts. Everyone begins with ₹15 Cr and gets ₹2 Cr for passing Payday. Prices are in crores. If you drop out, open the same link on the same device to rejoin.
    </div>
  </div>`;
  $('#app').querySelectorAll('.sw').forEach(b => b.onclick = () => { ui.homeColor = b.dataset.c; renderHome(); });
  const name = () => { const n = $('#hname').value.trim(); if (!n) { toast('Enter your name'); return null; } try { localStorage.setItem('cc_name', n); } catch {} return n; };
  if ($('#createBtn')) $('#createBtn').onclick = () => { const n = name(); if (n) send({ t: 'create', name: n, color: ui.homeColor }); };
  if ($('#joinBtn')) $('#joinBtn').onclick = () => { const n = name(); if (n) send({ t: 'join', code: ui.joinCode, name: n, color: ui.homeColor }); };
  if ($('#joinCodeBtn')) $('#joinCodeBtn').onclick = () => { const c = $('#jcode').value.trim().toUpperCase(); if (!c) return toast('Enter a room code'); ui.joinCode = c; ui.peek = undefined; send({ t: 'peek', code: c }); renderHome(); };
  if ($('#notThis')) $('#notThis').onclick = e => { e.preventDefault(); ui.joinCode = ''; ui.peek = undefined; history.replaceState(null, '', '/'); renderHome(); };
}

function shareLink() { return `${location.origin}/r/${S.code}`; }
function previewBoard(st) {
  const saved = S; S = st;
  try {
    const sq = BOARD.map(s => { const [r, c, side] = coord(s.i); const corner = [0, 10, 20, 30].includes(s.i); return `<div class="sq ${corner ? 'corner' : 'side-' + side}" style="grid-row:${r};grid-column:${c}">${sqHTML(s)}</div>`; }).join('');
    return `<div class="boardwrap preview"><div class="board">${sq}<div class="center"><img class="indiamap" src="/india.svg" alt="" aria-hidden="true"><div class="gname">CRORE CITY</div><div class="muted" style="font-size:clamp(10px,2.4cqi,15px)">Board preview</div></div></div></div>`;
  } finally { S = saved; }
}
function renderLobby() {
  const isHost = S.hostId === me; const mp = meP();
  const taken = new Set(S.players.filter(p => p.id !== me).map(p => p.color));
  $('#app').innerHTML = `
  <div class="home">
    <div class="logo"><div class="mark">₹</div><div><h1>Crore City</h1><div class="muted">Room lobby</div></div></div>
    <div class="card" style="text-align:center">
      <div class="muted">Room code</div>
      <div class="code">${esc(S.code)}</div>
      <div class="muted" style="word-break:break-all;margin:6px 0">${esc(shareLink())}</div>
      <div class="row" style="justify-content:center"><button id="copyBtn" class="sec">Copy link</button>${navigator.share ? '<button id="shareBtn">Share</button>' : ''}</div>
    </div>
    <div class="card">
      <h3>Players (${S.players.length}/8)</h3>
      <ul class="plist">${S.players.map(p => `<li><span class="dot" style="background:${p.color};width:18px;height:18px"></span><b>${esc(p.name)}</b>${p.id === S.hostId ? '<span class="pill">host</span>' : ''}${p.id === me ? '<span class="pill">you</span>' : ''}<span class="grow"></span>${p.connected ? '' : '<span class="muted">offline</span>'}${isHost && p.id !== me ? `<button class="sm sec" data-kick="${p.id}">Remove</button>` : ''}</li>`).join('')}</ul>
      <label class="muted">Your colour</label>
      <div class="swatches">${COLORS.map(c => `<button class="sw ${c === mp?.color ? 'sel' : ''} ${taken.has(c) ? 'taken' : ''}" style="background:${c}" data-c="${c}" ${taken.has(c) ? 'disabled' : ''}></button>`).join('')}</div>
    </div>
    <div class="card">
      ${isHost ? `<button class="big" id="startBtn">${S.players.length < 2 ? 'Start a solo practice game' : 'Start game'}</button><p class="muted" style="text-align:center">${S.players.length < 2 ? 'Share the link to play with friends, or practise on your own now. Friends can’t join once the game starts.' : 'Turn order is decided by a dice roll when you start.'}</p>` : `<p style="text-align:center">Waiting for <b>${esc(P(S.hostId)?.name)}</b> to start the game…</p>`}
      <p class="muted" style="text-align:center"><a href="/" id="leave">Leave room</a></p>
    </div>
    <div class="card"><h3>The board</h3>${previewBoard(S)}</div>
  </div>`;
  $('#copyBtn').onclick = () => { navigator.clipboard?.writeText(shareLink()).then(() => toast('Link copied'), () => toast(shareLink())); };
  if ($('#shareBtn')) $('#shareBtn').onclick = () => navigator.share({ title: 'Crore City', text: `Join my Crore City game! Room ${S.code}`, url: shareLink() }).catch(() => {});
  $('#app').querySelectorAll('.sw').forEach(b => b.onclick = () => act('setColor', { color: b.dataset.c }));
  $('#app').querySelectorAll('[data-kick]').forEach(b => b.onclick = () => act('kick', { id: b.dataset.kick }));
  if ($('#startBtn')) $('#startBtn').onclick = () => act('start');
  $('#leave').onclick = e => { e.preventDefault(); saveSess(null); location.href = '/'; };
}

// ================= game =================
function coord(i) {
  if (i <= 10) return [11, 11 - i, 'b'];
  if (i <= 20) return [11 - (i - 10), 1, 'l'];
  if (i <= 30) return [1, 1 + (i - 20), 't'];
  return [1 + (i - 30), 11, 'r'];
}
function buildGame() {
  $('#app').innerHTML = `
  <div class="game">
    <div class="topbar"><span class="title">₹ Crore City</span><span class="pill" style="background:rgba(255,255,255,.15);color:#fff" id="roomcode"></span>
      <div class="wallet" id="wallet"><div class="lbl">YOUR WALLET</div><div class="amt" id="walletAmt"></div></div></div>
    <div class="boardwrap"><div class="board" id="board"></div></div>
    <div class="side">
      <div class="card action" id="action"></div>
      <div class="card"><div class="tabs" id="tabs"></div><div class="tabbody" id="tabbody" style="margin-top:10px"></div></div>
    </div>
  </div>`;
  const b = $('#board');
  BOARD.forEach(s => {
    const [r, c, side] = coord(s.i);
    const d = document.createElement('div');
    const corner = [0, 10, 20, 30].includes(s.i);
    d.className = `sq ${corner ? 'corner' : 'side-' + side}`; d.id = 'sq' + s.i;
    d.style.gridRow = r; d.style.gridColumn = c;
    d.onclick = () => openDeed(s.i);
    b.appendChild(d);
  });
  const center = document.createElement('div'); center.className = 'center'; center.id = 'center';
  center.innerHTML = `<img class="indiamap" src="/india.svg" alt="" aria-hidden="true"><div class="gname">CRORE CITY</div><div class="dicebox"><div class="tosser" id="t1"><div class="cube" id="d1"></div></div><div class="tosser" id="t2"><div class="cube" id="d2"></div></div></div><div id="cardshow"></div>`;
  b.appendChild(center);
  buildCube($('#d1')); buildCube($('#d2')); setCube($('#d1'), 1, false); setCube($('#d2'), 2, false);
}
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const FACE_ROT = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
function buildCube(el) {
  el.innerHTML = [1, 2, 3, 4, 5, 6].map(n => `<div class="face f${n}">${Array.from({ length: 9 }, (_, k) => `<i style="visibility:${PIPS[n].includes(k) ? 'visible' : 'hidden'}"></i>`).join('')}</div>`).join('');
  el._spins = 0;
}
function setCube(el, n, tumble) {
  const [x, y] = FACE_ROT[n];
  if (tumble) el._spins = (el._spins || 0) + 2 + Math.floor(Math.random() * 2);
  const k = (el._spins || 0) * 360;
  el.style.transition = tumble ? '' : 'none';
  el.style.transform = `rotateX(${x + k}deg) rotateY(${y + k}deg) rotateZ(${tumble ? k : 0}deg)`;
  if (!tumble) { void el.offsetWidth; el.style.transition = ''; }
}
function spinDice() { // instant feedback while waiting for the server
  ['#d1', '#d2'].forEach(s => { const d = $(s); if (d) d.classList.add('spin'); });
  
}
function animateDice(roll, anim) {
  const d1 = $('#d1'), d2 = $('#d2'); if (!d1) return;
  d1.classList.remove('spin'); d2.classList.remove('spin');
  if (!anim) { setCube(d1, roll.d1, false); setCube(d2, roll.d2, false); return; }
  ['#t1', '#t2'].forEach((s, i) => { const t = $(s); t.classList.remove('toss-l', 'toss-r'); void t.offsetWidth; t.classList.add(i ? 'toss-r' : 'toss-l'); });
  requestAnimationFrame(() => { setCube(d1, roll.d1, true); setCube(d2, roll.d2, true); });
}
function flashSq(i) { const e = $('#sq' + i); if (!e) return; e.classList.remove('hl'); void e.offsetWidth; e.classList.add('hl'); }

function sqHTML(s) {
  const st = S.props[s.i]; const owner = st && P(st.owner);
  const nm = esc(SHORT[s.name] || s.name);
  let band = '';
  if (s.group) {
    let b = '';
    if (st?.houses === 5) b = '<span class="hotel">★</span>'; else for (let k = 0; k < (st?.houses || 0); k++) b += '<span class="house">◆</span>';
    band = `<div class="band" style="background:${GROUPS[s.group].color}">${b}</div>`;
  }
  const ic = s.type === 'util' ? UTIL_ICON[s.name] : (s.group ? '' : ICON[s.type] || '');
  const price = s.price ? (owner ? esc(owner.name.slice(0, 6)) : fmt(s.price).replace('₹', '₹').replace(' Cr', 'Cr')) : (s.amount ? fmt(s.amount).replace(' Cr', 'Cr') : '');
  const toks = S.players.filter(p => !p.bankrupt && p.pos === s.i).map(p => `<span class="tok ${p.id === me ? 'me' : ''} ${cur()?.id === p.id ? 'turn' : ''}" style="background:${p.color}" title="${esc(p.name)}"></span>`).join('');
  const jailNote = s.i === 10 && S.players.some(p => p.inJail && !p.bankrupt) ? `<div class="pr">🔒 ${S.players.filter(p => p.inJail && !p.bankrupt).length} inside</div>` : '';
  return `<div class="inner">${band}<div class="txt">${ic ? `<div class="ic">${ic}</div>` : ''}<div class="nm">${nm}</div>${jailNote}<div class="pr">${price}</div></div><div class="tokens">${toks}</div></div>`;
}

function renderGame() {
  if (!S || S.status === 'lobby') return;
  // let the dice land before tokens move and prompts appear
  const wait = (ui.holdUntil || 0) - Date.now();
  if (wait > 0) { clearTimeout(ui.holdTimer); ui.holdTimer = setTimeout(renderGame, wait + 20); return; }
  const mp = meP();
  $('#roomcode').textContent = 'Room ' + S.code;
  $('#walletAmt').textContent = mp ? fmt(mp.cash) : '—';
  BOARD.forEach(s => {
    const el = $('#sq' + s.i); const st = S.props[s.i]; const owner = st && P(st.owner);
    el.classList.toggle('owned', !!owner); el.classList.toggle('mort', !!st?.mortgaged);
    if (owner) el.style.setProperty('--oc', owner.color); else el.style.removeProperty('--oc');
    setHTML(el, sqHTML(s));
  });
  const c = cur();
  setHTML($('#turnline'), S.status === 'ended' ? (S.winner ? `🏆 ${esc(P(S.winner)?.name || '')} wins!` : 'Practice game over') : `<span class="dot" style="background:${c.color}"></span> ${c.id === me ? 'Your turn' : esc(c.name) + "'s turn"}${c.connected ? '' : ' (offline)'}`);
  setHTML($('#cardshow'), S.card ? `<div class="cardshow ${S.card.deck}"><b>${S.card.deck === 'chance' ? '🃏 Twist' : '🏛️ City Fund'}</b><br>${esc(S.card.text)}</div>` : '');
  renderAction();
  renderTabs();
}

function renderAction() {
  const mp = meP(); const c = cur(); const el = $('#action');
  if (S.status === 'ended') {
    const ranked = [...S.players].sort((a, b) => (b.id === S.winner) - (a.id === S.winner) || b.cash - a.cash);
    setHTML(el, `<div class="winner">${S.winner ? `🏆 ${esc(P(S.winner)?.name)} wins!` : 'Practice game over'}</div><ul class="plist">${ranked.map(p => `<li><span class="dot" style="background:${p.color}"></span>${esc(p.name)}<span class="grow"></span>${p.bankrupt ? 'Bankrupt' : fmt(p.cash)}</li>`).join('')}</ul><button class="big sec" id="newGame">New game</button>`);
    $('#newGame').onclick = () => { saveSess(null); location.href = '/'; };
    return;
  }
  let h = '';
  const myDebt = S.debts.find(d => d.from === me);
  if (mp?.bankrupt) h = `<h3>You are bankrupt</h3><p class="muted">You can keep watching the game.</p>`;
  else if (myDebt) {
    h = `<h3>⚠️ You owe ${fmt(myDebt.amount)}</h3><p class="muted">To ${esc(myDebt.to ? P(myDebt.to)?.name : 'the Bank')} · ${esc(myDebt.reason)}</p>
      ${calc('Calculator', [['Balance', mp.cash], ['Amount owed', myDebt.amount, '−']], mp.cash - myDebt.amount, mp.cash >= myDebt.amount ? 'Remaining' : 'Short by')}
      <p class="muted">Raise money by selling houses, mortgaging properties (in <b>My cards</b>) or making a deal.</p>
      <div class="row"><button class="grow" id="payDebt" ${mp.cash < myDebt.amount ? 'disabled' : ''}>Pay ${fmt(myDebt.amount)}</button><button class="danger" id="bankrupt">Declare bankruptcy</button></div>`;
  } else if (S.debts.length) {
    const d = S.debts[0];
    h = `<h3>Waiting…</h3><p>${esc(P(d.from)?.name)} must raise ${fmt(d.amount)} to pay ${esc(d.to ? P(d.to)?.name : 'the Bank')}.</p>`;
  } else if (S.phase === 'auction' && S.auction) h = auctionHTML();
  else if (c.id === me) {
    if (S.phase === 'roll') {
      h = `<h3>${S.rollAgain ? '🎲 Doubles! Roll again' : '🎲 Your turn'}</h3>`;
      if (mp.inJail) h += `<p>You're in the Lockup (attempt ${mp.jailTurns + 1} of 3). Roll doubles to get out, or pay.</p>
        <div class="row wrap"><button class="gold" id="payJail" ${mp.cash < 50 ? 'disabled' : ''}>Pay ₹0.5 Cr</button>${mp.gojf ? '<button class="sec" id="useCard">Use Bail Pass</button>' : ''}</div><div style="height:8px"></div>`;
      h += `<button class="big" id="rollBtn">Roll dice</button>`;
    } else if (S.phase === 'buy' && S.pending) {
      const s = BOARD[S.pending.sq];
      h = `<h3>Buy ${esc(s.name)}?</h3>${miniDeed(s)}
        ${calc('Calculator', [['Balance', mp.cash], ['Price', s.price, '−']], mp.cash - s.price)}
        <div class="row"><button class="grow" id="buyBtn" ${mp.cash < s.price ? 'disabled' : ''}>Buy for ${fmt(s.price)}</button><button class="sec grow" id="aucBtn">Auction</button></div>
        ${mp.cash < s.price ? '<p class="muted">Not enough cash. Mortgage something first, or send it to auction.</p>' : ''}`;
    } else if (S.phase === 'end') {
      h = `<h3>Your turn</h3><p class="muted">Build houses, mortgage or make deals from <b>My cards</b>, then end your turn.</p><button class="big" id="endBtn">End turn</button>`;
    }
  } else {
    const verb = S.phase === 'buy' ? 'is deciding whether to buy' : S.phase === 'end' ? 'is finishing their turn' : 'is rolling';
    h = `<h3>${esc(c.name)} ${verb}…</h3>`;
    if (!c.connected && S.hostId === me) h += `<p class="muted">${esc(c.name)} is offline.</p><button class="sec" id="skipBtn">Skip their turn</button>`;
  }
  if (!mp?.bankrupt && S.players.filter(p => !p.bankrupt).length > 1) h += `<div style="height:10px"></div><button class="sec big" id="dealBtn">🤝 Propose a deal</button>`;
  setHTML(el, h);
  const on = (id, f) => { const b = $('#' + id); if (b) b.onclick = f; };
  on('rollBtn', () => { spinDice(); act('roll'); }); on('payJail', () => act('payJail')); on('useCard', () => act('useCard'));
  on('buyBtn', () => act('buy')); on('aucBtn', () => act('auction')); on('endBtn', () => act('endTurn'));
  on('payDebt', () => act('payDebt')); on('bankrupt', () => confirmModal('Declare bankruptcy?', 'You will be out of the game and your assets go to your creditor.', () => act('bankrupt')));
  on('dealBtn', () => openCompose()); on('skipBtn', () => act('skip'));
  wireAuction();
}

function auctionHTML() {
  const a = S.auction; const s = BOARD[a.sq]; const mp = meP();
  const turnId = a.active[a.cur]; const myTurn = turnId === me;
  const minBid = a.high + 1;
  if (ui.bid === null || ui.bid < minBid || ui.bidFor !== a.sq + ':' + a.high) { ui.bid = Math.max(a.high + 10, 10); ui.bidFor = a.sq + ':' + a.high; }
  const shown = myTurn ? ui.bid : a.high;
  const rows = S.order.map(P).filter(p => !p.bankrupt).map(p => {
    const inA = a.active.includes(p.id);
    return `<tr class="${a.highBidder === p.id ? 'hi' : ''}"><td><span class="dot" style="background:${p.color}"></span> ${esc(p.name)}${p.id === turnId ? ' ⬅' : ''}${inA ? '' : ' <span class="muted">(out)</span>'}</td><td>${fmt(p.cash)}</td><td style="${p.cash - shown < 0 ? 'color:var(--danger)' : ''}">${inA ? fmt(p.cash - shown) : '—'}</td></tr>`;
  }).join('');
  return `<h3>🔨 Auction: ${esc(s.name)}</h3>${miniDeed(s)}
    <p>Highest bid: <b>${a.highBidder ? fmt(a.high) + ' by ' + esc(P(a.highBidder).name) : 'none yet'}</b></p>
    <table class="bidtable"><tr class="muted"><td>Bidder</td><td>Balance</td><td>Left after ${fmt(shown)}</td></tr>${rows}</table>
    ${myTurn ? `
      <div class="bidbtns"><button class="sec" data-inc="10">+0.1 Cr</button><button class="sec" data-inc="50">+0.5 Cr</button><button class="sec" data-inc="100">+1 Cr</button></div>
      <div class="row"><input id="bidIn" inputmode="decimal" value="${ui.bid / 100}" aria-label="Custom bid in crores"><span class="muted">Cr</span></div>
      ${calc('Your calculator', [['Balance', mp.cash], ['Your bid', ui.bid, '−']], mp.cash - ui.bid)}
      <div class="row"><button class="grow" id="bidBtn" ${ui.bid > mp.cash || ui.bid <= a.high ? 'disabled' : ''}>Bid ${fmt(ui.bid)}</button><button class="sec" id="passBtn">Pass</button></div>`
    : `<p class="muted">Waiting for ${esc(P(turnId)?.name)} to bid or pass…</p>${S.hostId === me && !P(turnId)?.connected ? '<button class="sec" id="skipBtn">Pass for offline player</button>' : ''}`}`;
}
function wireAuction() {
  const a = S.auction; if (!a || !$('#bidBtn')) return;
  document.querySelectorAll('[data-inc]').forEach(b => b.onclick = () => { ui.bid = a.high + +b.dataset.inc; ui.bidFor = a.sq + ':' + a.high; renderAction(); });
  $('#bidIn').oninput = e => { ui.bid = toUnits(e.target.value); ui.bidFor = a.sq + ':' + a.high; const v = e.target.value; renderAction(); const n = $('#bidIn'); if (n && n.value !== v) n.value = v; };
  $('#bidBtn').onclick = () => act('bid', { amount: ui.bid });
  $('#passBtn').onclick = () => act('pass');
}

function miniDeed(s) {
  const st = S.props[s.i];
  return `<div class="row" style="gap:10px;margin:6px 0"><span style="width:14px;height:40px;border-radius:4px;background:${sqColor(s)}"></span><div><b>${esc(s.name)}</b><div class="muted">${s.group ? `Rent ${fmt(s.rent[0])} · Set: ${esc(GROUPS[s.group].name)} · House ${fmt(s.house)}` : s.type === 'rail' ? 'Rent ₹0.25 / 0.5 / 1 / 2 Cr for 1–4 railways' : 'Rent 4× dice (10× with both utilities)'}${st ? ` · Owner: ${esc(P(st.owner)?.name)}` : ''}</div></div></div>`;
}

// ---------- tabs ----------
function renderTabs() {
  const tabs = [['players', 'Players'], ['mine', 'My cards'], ['deals', `Deals${S.trades.filter(t => t.to === me).length ? ' •' : ''}`], ['log', 'Log'], ['txns', 'Transactions']];
  setHTML($('#tabs'), tabs.map(([k, l]) => `<button class="${ui.tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join(''));
  $('#tabs').querySelectorAll('button').forEach(b => b.onclick = () => { ui.tab = b.dataset.tab; renderTabs(); });
  const body = $('#tabbody'); let h = '';
  if (ui.tab === 'players') {
    h = S.order.map(P).map(p => {
      const props = ownedBy(p.id);
      return `<div class="pl ${cur().id === p.id ? 'turn' : ''} ${p.connected ? '' : 'off'}" data-pp="${p.id}" style="cursor:pointer">
        <span class="dot" style="background:${p.color};width:18px;height:18px"></span>
        <div><div class="nm ${p.bankrupt ? 'bk' : ''}">${esc(p.name)}${p.id === me ? ' (you)' : ''}${p.id === S.hostId ? ' 👑' : ''}</div>
        <div class="muted">${props.length} cards${p.inJail ? ' · 🔐 in Lockup' : ''}${p.gojf ? ` · ${p.gojf} Bail Pass` : ''}${p.connected ? '' : ' · offline'}${p.bankrupt ? ' · bankrupt' : ''}</div></div>
        <div class="cash">${fmt(p.cash)}</div></div>`;
    }).join('') + `<p class="muted">Bank: ${S.housesLeft} houses, ${S.hotelsLeft} hotels left. Tap a player to see their cards, tap a square for details.</p>`;
  } else if (ui.tab === 'mine') {
    const mine = ownedBy(me);
    h = mine.length ? mine.map(sq => propRow(sq, true)).join('') : '<p class="muted">You don\'t own any properties yet.</p>';
  } else if (ui.tab === 'deals') {
    const mine = S.trades.filter(t => t.to === me || t.from === me);
    h = mine.length ? mine.map(t => `<div class="prop"><div class="info">${t.from === me ? `To <b>${esc(P(t.to).name)}</b>` : `From <b>${esc(P(t.from).name)}</b>`}<div class="muted">${tradeSummary(t)}</div></div><div class="btns">${t.to === me ? `<button class="sm" data-open="${t.id}">Review</button>` : `<button class="sm sec" data-cancel="${t.id}">Withdraw</button>`}</div></div>`).join('') : '<p class="muted">No open deals. Use “Propose a deal” to start one.</p>';
  } else if (ui.tab === 'log') {
    h = `<div class="log">${[...S.log].reverse().map(l => `<div><span class="ts">${new Date(l.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>${esc(l.msg)}</div>`).join('')}</div>`;
  } else if (ui.tab === 'txns') {
    h = `<div class="log">${[...S.txns].reverse().map(t => `<div><span class="ts">${new Date(t.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><b>${esc(t.from ? P(t.from)?.name : 'Bank')}</b> → <b>${esc(t.to ? P(t.to)?.name : 'Bank')}</b>: ${fmt(t.amount)} <span class="muted">(${esc(t.reason)})</span></div>`).join('') || '<p class="muted">No transactions yet.</p>'}</div>`;
  }
  setHTML(body, h);
  body.querySelectorAll('[data-pp]').forEach(b => b.onclick = () => openPlayerProps(b.dataset.pp));
  body.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openIncoming(b.dataset.open));
  body.querySelectorAll('[data-cancel]').forEach(b => b.onclick = () => act('cancelTrade', { id: b.dataset.cancel }));
  wirePropBtns(body);
}

function propRow(sq, mine) {
  const s = BOARD[sq]; const st = S.props[sq]; const mp = meP(); const myTurn = cur().id === me;
  const bld = st.houses === 5 ? '★ Hotel' : st.houses ? `◆×${st.houses}` : '';
  let btns = '';
  if (mine && !mp.bankrupt) {
    if (s.group && ownsGroup(me, s.group) && !st.mortgaged && st.houses < 5) {
      const okEven = groupSq(s.group).every(x => S.props[x].houses >= st.houses) && groupSq(s.group).every(x => !S.props[x].mortgaged);
      btns += `<button class="sm" data-build="${sq}" ${!myTurn || !okEven || mp.cash < s.house ? 'disabled' : ''} title="${myTurn ? '' : 'Only on your turn'}">${st.houses === 4 ? 'Hotel' : 'House'} ${fmt(s.house)}</button>`;
    }
    if (st.houses > 0) btns += `<button class="sm sec" data-sell="${sq}">Sell +${fmt(s.house / 2)}</button>`;
    if (!st.mortgaged && !(s.group && groupHasBld(s.group))) btns += `<button class="sm sec" data-mort="${sq}">Mortgage +${fmt(mortVal(sq))}</button>`;
    if (st.mortgaged) btns += `<button class="sm gold" data-unmort="${sq}" ${mp.cash < unmortCost(sq) ? 'disabled' : ''}>Unmortgage −${fmt(unmortCost(sq))}</button>`;
  }
  return `<div class="prop"><span class="sw2" style="background:${sqColor(s)}"></span><div class="info" data-deed="${sq}" style="cursor:pointer"><b>${esc(s.name)}</b><span class="muted">${st.mortgaged ? '<span style="color:var(--danger);font-weight:700">MORTGAGED</span> · ' : ''}${bld ? bld + ' · ' : ''}Rent now ${rentLabel(sq)}</span></div><div class="btns">${btns}</div></div>`;
}
function rentLabel(sq) {
  const s = BOARD[sq]; const st = S.props[sq]; if (st.mortgaged) return '₹0';
  if (s.group) return fmt(st.houses ? s.rent[st.houses] : ownsGroup(st.owner, s.group) ? s.rent[0] * 2 : s.rent[0]);
  if (s.type === 'rail') { const n = BOARD.filter(x => x.type === 'rail' && S.props[x.i]?.owner === st.owner).length; return fmt(25 * 2 ** (n - 1)); }
  const n = BOARD.filter(x => x.type === 'util' && S.props[x.i]?.owner === st.owner).length; return (n === 2 ? 10 : 4) + '× dice';
}
function wirePropBtns(root) {
  root.querySelectorAll('[data-build]').forEach(b => b.onclick = () => act('build', { sq: +b.dataset.build }));
  root.querySelectorAll('[data-sell]').forEach(b => b.onclick = () => act('sell', { sq: +b.dataset.sell }));
  root.querySelectorAll('[data-mort]').forEach(b => b.onclick = () => act('mortgage', { sq: +b.dataset.mort }));
  root.querySelectorAll('[data-unmort]').forEach(b => b.onclick = () => act('unmortgage', { sq: +b.dataset.unmort }));
  root.querySelectorAll('[data-deed]').forEach(b => b.onclick = () => openDeed(+b.dataset.deed));
}

// ================= modals =================
function modalOpen(kind) { return $('#modal-root').dataset.kind === kind; }
function openModal(kind, html, arg = '') {
  const root = $('#modal-root'); root.dataset.kind = kind; root.dataset.arg = arg;
  const inner = `<div class="modal-bg"><div class="modal"><button class="x" aria-label="Close">×</button>${html}</div></div>`;
  if (root._h !== inner) { const sc = $('.modal', root)?.scrollTop; setHTML(root, inner); if (sc) $('.modal', root).scrollTop = sc; }
  $('.modal-bg', root).onclick = e => { if (e.target.classList.contains('modal-bg')) closeModal(); };
  $('.x', root).onclick = closeModal;
  return root;
}
function closeModal() { const r = $('#modal-root'); r.innerHTML = ''; r._h = ''; r.dataset.kind = ''; }
function confirmModal(title, text, yes) {
  const r = openModal('confirm', `<h3>${esc(title)}</h3><p>${esc(text)}</p><div class="row"><button class="danger grow" id="cy">Yes</button><button class="sec grow" id="cn">Cancel</button></div>`);
  $('#cy', r).onclick = () => { closeModal(); yes(); }; $('#cn', r).onclick = closeModal;
}

function openDeed(sq) {
  const s = BOARD[sq]; const st = S.props[sq]; const owner = st && P(st.owner);
  let body = '';
  if (s.group) {
    body = `<table><tr><td>Rent</td><td>${fmt(s.rent[0])}</td></tr><tr><td>Rent with full set</td><td>${fmt(s.rent[0] * 2)}</td></tr>${[1, 2, 3, 4].map(k => `<tr><td>With ${k} house${k > 1 ? 's' : ''}</td><td>${fmt(s.rent[k])}</td></tr>`).join('')}<tr><td>With hotel</td><td>${fmt(s.rent[5])}</td></tr><tr><td colspan=2><hr></td></tr><tr><td>House / hotel cost</td><td>${fmt(s.house)} each</td></tr>`;
  } else if (s.type === 'rail') body = `<table><tr><td>Rent, 1 railway</td><td>₹0.25 Cr</td></tr><tr><td>2 railways</td><td>₹0.5 Cr</td></tr><tr><td>3 railways</td><td>₹1 Cr</td></tr><tr><td>4 railways</td><td>₹2 Cr</td></tr>`;
  else if (s.type === 'util') body = `<table><tr><td colspan=2>One utility: rent is 4× the dice roll (in ₹0.01 Cr units).</td></tr><tr><td colspan=2>Both utilities: 10× the dice roll.</td></tr>`;
  if (s.price) body += `<tr><td>Price</td><td>${fmt(s.price)}</td></tr><tr><td>Mortgage value</td><td>${fmt(mortVal(sq))}</td></tr><tr><td>Unmortgage cost</td><td>${fmt(unmortCost(sq))}</td></tr></table>`;
  else body = `<p style="padding:10px">${{ go: 'Collect ₹2 Cr every time you pass Payday.', jail: 'Visitors just pass through. If you were sent to the Lockup, roll doubles, pay ₹0.5 Cr bail, or use a Bail Pass. After 3 failed tries you must pay.', free: 'Festival holiday! Relax, nothing happens here.', gotojail: 'Go straight to the Lockup without passing Payday.', chance: 'Draw a Twist card.', chest: 'Draw a City Fund card.', tax: `Pay ${fmt(s.amount || 0)} to the bank.` }[s.type] || ''}</p>`;
  const here = S.players.filter(p => p.pos === sq && !p.bankrupt);
  const html = `<div class="deed"><div class="hd" style="background:${sqColor(s)}">${esc(s.name)}${s.group ? `<div style="font-size:12px;font-weight:500">${esc(GROUPS[s.group].name)}</div>` : ''}</div>${body}</div>
   <p style="text-align:center">${owner ? `Owner: <span class="dot" style="background:${owner.color}"></span> <b>${esc(owner.name)}</b>${st.mortgaged ? ' · <b style="color:var(--danger)">Mortgaged</b>' : ''}${st.houses ? ` · ${st.houses === 5 ? 'Hotel' : st.houses + ' houses'}` : ''}` : s.price ? 'Unowned' : ''}${here.length ? `<br>Here: ${here.map(p => `<span class="dot" style="background:${p.color}"></span> ${esc(p.name)}`).join(', ')}` : ''}</p>
   ${st && st.owner === me ? propRow(sq, true) : ''}`;
  const r = openModal('deed', html, String(sq)); wirePropBtns(r);
}

function openPlayerProps(pid) {
  const p = P(pid); if (!p) return closeModal();
  const props = ownedBy(pid);
  const r = openModal('pprops', `<h3><span class="dot" style="background:${p.color}"></span> ${esc(p.name)}</h3><p>Balance <b>${fmt(p.cash)}</b>${p.gojf ? ` · ${p.gojf} Bail Pass` : ''}</p>${props.length ? props.map(sq => propRow(sq, pid === me)).join('') : '<p class="muted">No properties.</p>'}${pid !== me && !p.bankrupt && !meP()?.bankrupt ? `<button class="big" id="dealWith">🤝 Propose a deal to ${esc(p.name)}</button>` : ''}`, pid);
  wirePropBtns(r);
  if ($('#dealWith', r)) $('#dealWith', r).onclick = () => openCompose({ to: pid });
}

// ---------- trades ----------
const descSide = s => [...s.props.map(sq => esc(BOARD[sq].name)), s.money ? fmt(s.money) : '', s.gojf ? `${s.gojf} Bail Pass` : ''].filter(Boolean).join(', ') || 'nothing';
function tradeSummary(t) { return `${esc(P(t.from).name)} gives ${descSide(t.give)} · gets ${descSide(t.get)}`; }
const fees = props => props.filter(sq => S.props[sq]?.mortgaged).reduce((s, sq) => s + Math.ceil(mortVal(sq) * 0.1), 0);

let C = null; // composer state
function openCompose(init = {}) {
  const others = S.players.filter(p => p.id !== me && !p.bankrupt);
  C = { to: init.to || others[0]?.id, give: { props: [], money: 0, gojf: 0 }, get: { props: [], money: 0, gojf: 0 }, replaces: init.replaces || null, ...(init.give ? { give: init.give, get: init.get } : {}) };
  C.giveMoneyStr = C.give.money ? String(C.give.money / 100) : ''; C.getMoneyStr = C.get.money ? String(C.get.money / 100) : '';
  refreshCompose();
}
function refreshCompose() {
  if (!C) return;
  const mp = meP(); const them = P(C.to);
  if (!them || them.bankrupt) { closeModal(); C = null; return; }
  const others = S.players.filter(p => p.id !== me && !p.bankrupt);
  const tradable = id => ownedBy(id).filter(sq => !(BOARD[sq].group && groupHasBld(BOARD[sq].group)));
  C.give.props = C.give.props.filter(sq => S.props[sq]?.owner === me); C.get.props = C.get.props.filter(sq => S.props[sq]?.owner === C.to);
  const myAfter = mp.cash - C.give.money + C.get.money - fees(C.get.props);
  const theirAfter = them.cash - C.get.money + C.give.money - fees(C.give.props);
  const errs = [];
  if (C.give.money > mp.cash) errs.push(`You only have ${fmt(mp.cash)}.`);
  if (C.get.money > them.cash) errs.push(`${them.name} only has ${fmt(them.cash)}.`);
  if (myAfter < 0) errs.push('You can’t cover the 10% fee on mortgaged cards.');
  const empty = !(C.give.props.length || C.give.money || C.give.gojf || C.get.props.length || C.get.money || C.get.gojf);
  const list = (id, side) => { const t = tradable(id); return t.length ? t.map(sq => `<label class="chk"><input type="checkbox" data-side="${side}" value="${sq}" ${C[side].props.includes(sq) ? 'checked' : ''}><span class="dot" style="background:${sqColor(BOARD[sq])};border-radius:3px"></span>${esc(BOARD[sq].name)}${S.props[sq].mortgaged ? ' <span class="muted">(M)</span>' : ''}</label>`).join('') : '<p class="muted">No tradable cards</p>'; };
  const html = `<h3>${C.replaces ? 'Counter-offer' : 'Propose a deal'}</h3>
    <div class="row"><span>With</span><select id="cTo" ${C.replaces ? 'disabled' : ''}>${others.map(p => `<option value="${p.id}" ${p.id === C.to ? 'selected' : ''}>${esc(p.name)} (${fmt(p.cash)})</option>`).join('')}</select></div>
    <div class="tradecols" style="margin-top:10px">
      <div><h4>You give</h4>${list(me, 'give')}<label class="muted">Money (Cr)</label><input id="cGiveM" inputmode="decimal" placeholder="0" value="${esc(C.giveMoneyStr)}">${mp.gojf ? `<label class="muted">Bail Passes (have ${mp.gojf})</label><input id="cGiveJ" type="number" min="0" max="${mp.gojf}" value="${C.give.gojf}">` : ''}</div>
      <div><h4>You get from ${esc(them.name)}</h4>${list(C.to, 'get')}<label class="muted">Money (Cr)</label><input id="cGetM" inputmode="decimal" placeholder="0" value="${esc(C.getMoneyStr)}">${them.gojf ? `<label class="muted">Bail Passes (has ${them.gojf})</label><input id="cGetJ" type="number" min="0" max="${them.gojf}" value="${C.get.gojf}">` : ''}</div>
    </div>
    ${calc('Your balance after the deal', [['Balance', mp.cash], ['You give', C.give.money, '−'], ['You get', C.get.money, '+'], ...(fees(C.get.props) ? [['10% fee on mortgaged', fees(C.get.props), '−']] : [])], myAfter, 'After deal')}
    ${calc(`${them.name}'s balance after`, [['Balance', them.cash], ['They give', C.get.money, '−'], ['They get', C.give.money, '+'], ...(fees(C.give.props) ? [['10% fee on mortgaged', fees(C.give.props), '−']] : [])], theirAfter, 'After deal')}
    ${errs.map(e => `<p style="color:var(--danger);margin:4px 0">${esc(e)}</p>`).join('')}
    <p class="muted">Cards in a colour set with buildings can't be traded until the buildings are sold. Receiving a mortgaged card costs a 10% fee.</p>
    <button class="big" id="cSend" ${errs.length || empty ? 'disabled' : ''}>Send offer</button>`;
  const r = openModal('compose', html, C.to);
  $('#cTo', r).onchange = e => { C.to = e.target.value; C.get = { props: [], money: 0, gojf: 0 }; C.getMoneyStr = ''; refreshCompose(); };
  r.querySelectorAll('input[type=checkbox]').forEach(cb => cb.onchange = () => { const side = cb.dataset.side, sq = +cb.value; C[side].props = cb.checked ? [...C[side].props, sq] : C[side].props.filter(x => x !== sq); refreshCompose(); });
  $('#cGiveM', r).oninput = e => { C.giveMoneyStr = e.target.value; C.give.money = toUnits(e.target.value); refreshCompose(); };
  $('#cGetM', r).oninput = e => { C.getMoneyStr = e.target.value; C.get.money = toUnits(e.target.value); refreshCompose(); };
  if ($('#cGiveJ', r)) $('#cGiveJ', r).oninput = e => { C.give.gojf = Math.max(0, Math.min(mp.gojf, +e.target.value || 0)); refreshCompose(); };
  if ($('#cGetJ', r)) $('#cGetJ', r).oninput = e => { C.get.gojf = Math.max(0, Math.min(them.gojf, +e.target.value || 0)); refreshCompose(); };
  $('#cSend', r).onclick = () => { act('propose', { to: C.to, give: C.give, get: C.get, replaces: C.replaces }); C = null; closeModal(); toast('Offer sent'); };
  $('.x', r).onclick = () => { C = null; closeModal(); };
}

function openIncoming(id) {
  const t = S.trades.find(x => x.id === id); if (!t) return;
  const mp = meP(); const from = P(t.from);
  const myAfter = mp.cash - t.get.money + t.give.money - fees(t.give.props);
  const html = `<h3>🤝 Deal from ${esc(from.name)}</h3>
    <div class="tradecols" style="grid-template-columns:1fr 1fr"><div><h4>You get</h4><p>${descSide(t.give)}</p></div><div><h4>You give</h4><p>${descSide(t.get)}</p></div></div>
    ${calc('Your balance after the deal', [['Balance', mp.cash], ['You give', t.get.money, '−'], ['You get', t.give.money, '+'], ...(fees(t.give.props) ? [['10% fee on mortgaged', fees(t.give.props), '−']] : [])], myAfter, 'After deal')}
    ${t.get.money > mp.cash ? `<p style="color:var(--danger)">You don't have enough money for this deal.</p>` : ''}
    <div class="row"><button class="grow" id="tAcc" ${myAfter < 0 || t.get.money > mp.cash ? 'disabled' : ''}>Accept</button><button class="sec grow" id="tCounter">Counter</button><button class="danger grow" id="tRej">Reject</button></div>`;
  const r = openModal('incoming', html, id);
  $('#tAcc', r).onclick = () => { act('acceptTrade', { id }); closeModal(); };
  $('#tRej', r).onclick = () => { act('rejectTrade', { id }); closeModal(); };
  $('#tCounter', r).onclick = () => openCompose({ to: t.from, replaces: t.id, give: { ...t.get, props: [...t.get.props] }, get: { ...t.give, props: [...t.give.props] } });
}

// keep rotated side-square contents sized to the real square
const boardRO = new ResizeObserver(es => es.forEach(e => sizeBoard(e.target)));
function sizeBoard(b) {
  const s = b.querySelector('.side-l'); if (!s) return;
  b.style.setProperty('--w', s.clientWidth + 'px'); b.style.setProperty('--h', s.clientHeight + 'px');
}
new MutationObserver(() => document.querySelectorAll('.board').forEach(b => { if (!b._ro) { b._ro = 1; boardRO.observe(b); } sizeBoard(b); })).observe(document.getElementById('app'), { childList: true, subtree: false });
// ================= boot =================
fetch('/board.json').then(r => r.json()).then(d => {
  BOARD = d.board; GROUPS = d.groups; COLORS = d.colors;
  render(); connect();
});
})();
