'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const G = require('./game');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const DATA = process.env.DATA_FILE || path.join(__dirname, 'data', 'rooms.json');
const rooms = new Map();

// ---- persistence (best effort, survives restarts where the disk persists) ----
try {
  const saved = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  for (const r of saved) { r.players.forEach(p => { p.connected = false; }); rooms.set(r.code, r); }
  console.log(`Loaded ${rooms.size} rooms`);
} catch { /* no saved rooms */ }
let dirty = false;
setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) if (now - r.touched > 3 * 24 * 3600e3) rooms.delete(code);
  if (!dirty) return; dirty = false;
  try { fs.mkdirSync(path.dirname(DATA), { recursive: true }); fs.writeFileSync(DATA, JSON.stringify([...rooms.values()])); } catch (e) { console.error('save failed', e.message); }
}, 5000);

// ---- static files ----
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') { res.end('ok'); return; }
  if (url.pathname === '/board.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ board: G.BOARD, groups: G.GROUPS, colors: G.COLORS })); return;
  }
  let file = url.pathname === '/' || url.pathname.startsWith('/r/') ? '/index.html' : url.pathname;
  file = path.normalize(path.join(PUB, file));
  if (!file.startsWith(PUB)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
});

// ---- realtime ----
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
const socketsByRoom = new Map(); // code -> Set(ws)

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c; do { c = Array.from({ length: 5 }, () => A[Math.floor(Math.random() * A.length)]).join(''); } while (rooms.has(c));
  return c;
}
function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function broadcast(r) {
  r.version++; dirty = true;
  const st = G.publicState(r);
  const msg = JSON.stringify({ t: 'state', state: st });
  for (const ws of socketsByRoom.get(r.code) || []) if (ws.readyState === 1) ws.send(msg);
}
function attach(ws, r, p) {
  if (ws.room && ws.room !== r.code) detach(ws);
  ws.room = r.code; ws.pid = p.id;
  if (!socketsByRoom.has(r.code)) socketsByRoom.set(r.code, new Set());
  socketsByRoom.get(r.code).add(ws);
  p.connected = true;
  send(ws, { t: 'joined', code: r.code, playerId: p.id, token: p.token });
  broadcast(r);
}
function detach(ws) {
  const set = socketsByRoom.get(ws.room); if (!set) return;
  set.delete(ws);
  const r = rooms.get(ws.room); if (!r) return;
  const p = r.players.find(x => x.id === ws.pid);
  if (p && ![...set].some(o => o.pid === p.id)) { p.connected = false; broadcast(r); }
}

wss.on('connection', ws => {
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    try {
      if (m.t === 'ping') { send(ws, { t: 'pong' }); return; }
      if (m.t === 'create') {
        const r = G.newRoom(newCode()); rooms.set(r.code, r);
        const p = G.addPlayer(r, m.name, m.color);
        attach(ws, r, p); return;
      }
      if (m.t === 'join') {
        const r = rooms.get(String(m.code || '').toUpperCase().trim());
        if (!r) throw new G.GameError('Room not found. Check the code.');
        if (r.status !== 'lobby') {
          // rejoin from a new device: same name, player currently offline
          const nm = String(m.name || '').trim().toLowerCase();
          const old = r.players.find(x => x.name.toLowerCase() === nm);
          if (old && !old.connected) { attach(ws, r, old); return; }
          if (old) throw new G.GameError(`${old.name} is already connected on another device.`);
          throw new G.GameError('This game has started. Enter the exact name you used to rejoin.');
        }
        const p = G.addPlayer(r, m.name, m.color);
        attach(ws, r, p); return;
      }
      if (m.t === 'rejoin') {
        const r = rooms.get(String(m.code || '').toUpperCase());
        const p = r && r.players.find(x => x.id === m.playerId && x.token === m.token);
        if (!p) { send(ws, { t: 'rejoinFailed' }); return; }
        attach(ws, r, p); return;
      }
      if (m.t === 'peek') { // lobby info for the join screen
        const r = rooms.get(String(m.code || '').toUpperCase());
        send(ws, { t: 'peek', room: r ? { code: r.code, status: r.status, players: r.players.map(p => ({ name: p.name, color: p.color })) } : null });
        return;
      }
      if (m.t === 'act') {
        const r = rooms.get(ws.room);
        if (!r) throw new G.GameError('Not in a room.');
        G.act(r, ws.pid, m);
        broadcast(r); return;
      }
    } catch (e) {
      if (e instanceof G.GameError) send(ws, { t: 'error', msg: e.message });
      else { console.error(e); send(ws, { t: 'error', msg: 'Server error.' }); }
    }
  });
  ws.on('close', () => detach(ws));
});
setInterval(() => {
  for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); }
}, 25000);

server.listen(PORT, () => console.log(`Crorepati Board on :${PORT}`));
