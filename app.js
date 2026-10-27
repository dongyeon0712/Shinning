(function () {
'use strict';

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const vib = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

const BODY = 'M16 2.66667C10.1333 2.66667 6.66667 6.93333 6.66667 12.2667V28L9.86667 25.3333L12.8 28L16 25.3333L19.2 28L22.1333 25.3333L25.3333 28V12.2667C25.3333 6.93333 21.8667 2.66667 16 2.66667Z';
const GHOST = s => `<svg width="${s}" height="${s}" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="${BODY}" fill="#FBF6EE"/><circle cx="12.4" cy="13.3333" r="2" fill="#1B1020"/><circle cx="19.6" cy="13.3333" r="2" fill="#1B1020"/></svg>`;
const SKULL = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 1.67C4.87 1.67 2.67 3.8 2.67 6.67c0 1.73.87 3 2.13 3.66v3c0 .18.07.35.2.47.12.13.29.2.47.2h5.07c.18 0 .34-.07.47-.2.12-.12.2-.29.2-.47v-3c1.26-.66 2.13-1.93 2.13-3.66C13.33 3.8 11.13 1.67 8 1.67Z" fill="#1B1020"/><circle cx="5.73" cy="7" r="1.27" fill="#fff"/><circle cx="10.27" cy="7" r="1.27" fill="#fff"/><path d="M7 11.33v2M9 11.33v2" stroke="#fff" stroke-width="1.2"/></svg>';
const CANDY = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="3.47" fill="#5B2A86"/><path d="M4.93 6.67L1 4.33v7.34l3.93-2.34V6.67ZM11.07 6.67L15 4.33v7.34l-3.93-2.34V6.67Z" fill="#5B2A86"/><path d="M6.67 5.47l2.66 5.06" stroke="#fff" stroke-width="1.3"/></svg>';
const ACCESS = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="6.67" cy="2.67" r="1.33" fill="#1B1020"/><path d="M6 5.33h1.67v3.34h2.66L12 12.67" stroke="#1B1020" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.33 7.67C3.4 8.4 2.5 10.4 3.2 12.3 3.9 14.2 6 15.2 8 14.5c1-.4 1.7-1.2 2-2.17" stroke="#1B1020" stroke-width="2" stroke-linecap="round"/></svg>';
const BT = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fbf6ee" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 7l12 10-6 5V2l6 5L6 17"/></svg>';

/* ---------- data ---------- */
const CAP = 3; // catches per person per house per night
const HOUSES = [
  { id: 'hedge',    name: 'The Hollow Hedge',  area: 'Capitol Hill', score: 87, x: 240, y: 70 },
  { id: 'ravens',   name: 'Ravenna Ravens',    area: 'Ravenna',      score: 81, x: 300, y: 120 },
  { id: 'calavera', name: 'Casa Calavera',     area: 'Capitol Hill', score: 76, x: 160, y: 30 },
  { id: 'webster',  name: 'Webster Manor',     area: 'Ravenna',      score: 64, x: 40,  y: 120 },
  { id: 'pumpkin',  name: 'The Pumpkin Patch', area: 'Capitol Hill', score: 52, x: 160, y: 200 }
];
const BUSTERS = [
  { name: 'Mara T.',  ghosts: 38, houses: 11 },
  { name: 'Devon K.', ghosts: 33, houses: 9 },
  { name: 'Priya S.', ghosts: 21, houses: 6 },
  { name: 'Jo L.',    ghosts: 12, houses: 5 },
  { name: 'Eli R.',   ghosts: 15, houses: 3 }
];
const houseById = id => HOUSES.find(h => h.id === id);

/* ---------- persisted state ---------- */
const KEY = 'scaremap.v1';
const night = () => new Date().toISOString().slice(0, 10);
const fresh = () => ({ night: night(), paired: false, warn: true, contrast: false, reduce: false, caught: {}, total: 0, visited: [] });
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.night === night()) return s;
    if (s) return Object.assign(fresh(), { paired: s.paired, warn: s.warn, contrast: s.contrast, reduce: s.reduce, total: s.total || 0, visited: s.visited || [] });
  } catch (e) {}
  return fresh();
}
let S = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const caughtAt = id => S.caught[id] || 0;
const capped = id => caughtAt(id) >= CAP;

/* walk state (not persisted): distance to the target house, in feet */
let W = { id: 'hedge', dist: 212, start: 212 };
function pickNext(fromId) {
  const i = HOUSES.findIndex(h => h.id === fromId);
  for (let k = 1; k <= HOUSES.length; k++) {
    const h = HOUSES[(i + k) % HOUSES.length];
    if (!capped(h.id)) return h;
  }
  return null;
}
function setTarget(h) { const d = Math.round(rand(150, 320)); W = { id: h.id, dist: d, start: d }; }
if (capped(W.id)) { const n = pickNext(W.id); if (n) setTarget(n); }

/* connection to the flashlight: 'connected' | 'lost'. BLE links do not survive a relaunch, so a paired device starts as 'lost' */
let conn = S.paired ? 'lost' : 'none';
const connChip = () => !S.paired
  ? '<button class="chip" data-act="goto" data-to="welcome">Connect ›</button>'
  : conn === 'connected'
    ? '<button class="chip mint" data-act="goto" data-to="connected" aria-label="Flashlight connected. Manage connection">● Connected ›</button>'
    : '<button class="chip cream" data-act="goto" data-to="connected" aria-label="Flashlight disconnected. Reconnect">○ Disconnected ›</button>';

/* ---------- screens ---------- */
const root = $('#screen');
let cur = 'welcome', timers = [];
const later = (fn, ms) => timers.push(setTimeout(fn, ms));

function go(name) {
  timers.forEach(clearTimeout); timers = [];
  stopLoop();
  cur = name;
  document.body.classList.toggle('hc', S.contrast);
  document.body.classList.toggle('reduce', S.reduce);
  (screens[name] || screens.welcome)();
}

const header = (title, chips, right) => `<div class="top"><div class="toprow"><div class="logo">${GHOST(32)} The Shining</div>${right || ''}</div><h2>${title}</h2>${chips ? `<div class="chips">${chips}</div>` : ''}</div>`;

const screens = {
  welcome() {
    root.innerHTML = `<div class="screen">${header('Light up the scariest houses on your street.')}
      <div class="sheet">
        <h3>Connect your flashlight</h3>
        <p>The flashlight shows you where to walk and lets you catch ghosts. Your phone keeps your pinned houses and scores.</p>
        <div class="card"><b>Before you start</b><span>Turn on Bluetooth and charge the flashlight to at least 20%.</span></div>
        <div class="sp"></div>
        <button class="btn dark" data-act="goto" data-to="scan">Find my flashlight</button>
        <button class="btn" data-act="guest">Continue without flashlight</button>
      </div></div>`;
  },
  scan() {
    root.innerHTML = `<div class="screen">${header('Looking for your flashlight')}
      <div class="sheet">
        <div class="radar"><i></i><i></i><i></i><div class="core">${BT}</div></div>
        <p id="scanMsg">Hold the flashlight power button for 3 seconds until the beam blinks purple.</p>
        <button class="dev dim" id="devFar" hidden><span class="ic">${GHOST(26)}</span><span><b>ScareMap Light · 91C0</b><small>Weak signal · -88 dBm</small></span></button>
        <button class="dev" id="devNear" data-act="pair" hidden><span class="ic">${GHOST(26)}</span><span><b>ScareMap Light · 4F2A</b><small>Strong signal · -52 dBm</small></span><span class="go">Pair</span></button>
        <div class="sp"></div>
        <button class="link" data-act="goto" data-to="welcome">Cancel</button>
      </div></div>`;
    later(() => { const e = $('#devFar'); if (e) e.hidden = false; }, 900);
    later(() => { const e = $('#devNear'); if (e) { e.hidden = false; $('#scanMsg').textContent = 'Found 2 flashlights. Pick the one with the strongest signal.'; } }, 1700);
  },
  confirm() {
    const c = S.code || '482913';
    const d = c.split('').map(x => `<span>${x}</span>`);
    d.splice(3, 0, '<span class="gap"></span>');
    root.innerHTML = `<div class="screen">${header('Check the code on the beam')}
      <div class="sheet">
        <p>Your flashlight is projecting a 6-digit code on the ground. If it matches the code below, confirm to finish pairing.</p>
        <div class="code" aria-label="Pairing code ${c}">${d.join('')}</div>
        <div class="card"><b>ScareMap Light · 4F2A</b><span>Bluetooth LE · secure pairing</span></div>
        <div class="sp"></div>
        <button class="btn dark" data-act="paired">Codes match</button>
        <button class="btn" data-act="goto" data-to="scan">They do not match</button>
      </div></div>`;
  },
  connected() {
    const ok = conn === 'connected';
    root.innerHTML = `<div class="screen">${header(ok ? 'Flashlight connected' : 'Flashlight disconnected',
      ok ? '<span class="chip mint">● ScareMap Light · 4F2A</span>' : '<span class="chip cream">○ ScareMap Light · 4F2A</span>')}
      <div class="sheet">
        <div class="stat"><div><small>Battery</small><b>${ok ? '82%' : '—'}</b></div><div><small>GPS</small><b>${ok ? 'Locked' : '—'}</b></div><div><small>Haunts</small><b>${HOUSES.length}</b></div></div>
        ${ok ? `<div class="card"><b>Haunts sent to your flashlight</b><span>${HOUSES.length} pinned houses in Capitol Hill and Ravenna. The flashlight points to the nearest one.</span></div>`
             : `<div class="card"><b>Reconnect to keep hunting</b><span>Your flashlight is out of range or turned off. Turn it on and keep it close to your phone.</span></div>`}
        <button class="toggle" data-act="warn" aria-pressed="${S.warn}"><span>Warn me about uneven ground<small>Shown on the beam before rough paths</small></span><span class="sw"></span></button>
        <div class="sp"></div>
        ${ok ? '<button class="btn dark" data-act="goto" data-to="hunt">Start the haunt hunt</button><button class="btn" data-act="reconnect">Reconnect</button>'
             : '<button class="btn dark" data-act="reconnect">Reconnect</button><button class="btn" data-act="goto" data-to="hunt">Back to the hunt</button>'}
        <button class="link" data-act="forget">Forget this flashlight</button>
      </div></div>`;
  },
  reconnecting() {
    root.innerHTML = `<div class="screen">${header('Reconnecting to your flashlight')}
      <div class="sheet">
        <div class="radar"><i></i><i></i><i></i><div class="core">${BT}</div></div>
        <p>Looking for ScareMap Light · 4F2A. Make sure it is turned on and close to your phone.</p>
        <div class="sp"></div>
        <button class="link" data-act="goto" data-to="connected">Cancel</button>
      </div></div>`;
    later(() => { conn = 'connected'; go('connected'); }, 2000);
  },
  hunt() {
    const h = houseById(W.id), t = W.dist <= 50;
    const f = W.start ? W.dist / W.start : 0;
    const sx = 90, sy = 190;
    const wx = h.x + (sx - h.x) * f, wy = h.y + (sy - h.y) * f;
    const pins = HOUSES.map(p => p.id === h.id ? '' : `<circle cx="${p.x}" cy="${p.y}" r="9" fill="${capped(p.id) ? '#b9aac6' : '#1B1020'}"/>`).join('');
    root.innerHTML = `<div class="screen">${header('Follow the beam', '', connChip())}
      <div class="sheet">
        <div class="map" role="img" aria-label="Map showing you and ${h.name}"><svg viewBox="0 0 350 230">
          <path d="M0 70H350M0 160H350M90 0V230M240 0V230" stroke="#fff" stroke-width="14"/>
          <path d="M${sx} ${sy}L${h.x} ${h.y}" stroke="#5B2A86" stroke-width="4" stroke-dasharray="2 9" stroke-linecap="round"/>
          ${pins}
          <circle cx="${h.x}" cy="${h.y}" r="20" fill="#5B2A86" fill-opacity=".18"/><circle cx="${h.x}" cy="${h.y}" r="11" fill="#5B2A86"/>
          <circle cx="${wx}" cy="${wy}" r="8" fill="#fff" stroke="#1B1020" stroke-width="3"/></svg></div>
        <div class="between top-aligned">
          <div><p style="margin-bottom:6px">Nearest haunt · ${h.name}</p><div class="big">${Math.round(W.dist)}<small>ft</small></div></div>
          <span class="tag ${t ? 'on' : ''}">${t ? 'Haunted house!' : 'Walking'}</span>
        </div>
        <div class="sp"></div>
        <button class="btn dark" data-act="goto" data-to="leaders">Leaderboards</button>
        <p style="text-align:center;font-size:13px">Ghosts caught tonight: <b style="color:var(--ink)">${Object.values(S.caught).reduce((a, b) => a + b, 0)}</b></p>
        <button class="link" data-act="beam">Demo: open simulated flashlight</button>
      </div></div>`;
  },
  leaders() {
    root.innerHTML = `<div class="screen">${header('Leaderboards')}
      <div class="sheet">
        <div class="tabs" role="tablist"><button role="tab" data-act="tab" data-t="h" aria-selected="${lbTab === 'h'}">Spookiest Houses</button><button role="tab" data-act="tab" data-t="g" aria-selected="${lbTab === 'g'}">Ghostbusters</button></div>
        <ul class="lb">${lbRows()}</ul>
        <div class="sp"></div>
        <button class="btn" data-act="goto" data-to="hunt">Back to the hunt</button>
      </div></div>`;
  }
};
let lbTab = 'h';
function lbRows() {
  if (lbTab === 'h') {
    return HOUSES.map(h => ({ n: h.name, a: h.area, s: h.score + (caughtAt(h.id) > 0 ? 1 : 0), me: caughtAt(h.id) > 0 }))
      .sort((a, b) => b.s - a.s)
      .map((r, i) => `<li class="${r.me ? 'me' : ''}"><span class="rk">${i + 1}</span><span class="nm">${r.n}<small>${r.a}</small></span><span class="sc">${r.s}</span></li>`).join('');
  }
  const you = { name: 'You', ghosts: S.total, houses: S.visited.length, me: true };
  return BUSTERS.concat([you]).map(b => Object.assign({ s: b.ghosts + b.houses * 2 }, b))
    .sort((a, b) => b.s - a.s)
    .map((r, i) => `<li class="${r.me ? 'me' : ''}"><span class="rk">${i + 1}</span><span class="nm">${r.name}<small>${r.ghosts} ghost${r.ghosts === 1 ? '' : 's'} · ${r.houses} house${r.houses === 1 ? '' : 's'}</small></span><span class="sc">${r.s}</span></li>`).join('');
}

/* ---------- actions ---------- */
const act = {
  goto: d => go(d.to),
  guest: () => go('hunt'),
  pair: () => { S.code = String(Math.floor(100000 + Math.random() * 900000)); go('confirm'); },
  paired: () => { S.paired = true; conn = 'connected'; save(); go('connected'); },
  reconnect: () => go('reconnecting'),
  forget: () => { S.paired = false; conn = 'none'; save(); go('welcome'); },
  warn: () => { S.warn = !S.warn; save(); screens.connected(); },
  contrast: () => { S.contrast = !S.contrast; save(); go('welcome'); },
  reduce: () => { S.reduce = !S.reduce; save(); go('welcome'); },
  walk: () => { W.dist = Math.max(0, W.dist - 45); screens.hunt(); },
  tab: d => { lbTab = d.t; screens.leaders(); },
  beam: () => openBeam(),
  shine: () => shine(),
  next: () => nextHouse()
};
document.addEventListener('click', e => {
  const a = e.target.closest('[data-act]');
  if (a && act[a.dataset.act]) act[a.dataset.act](a.dataset);
});

/* ---------- flashlight view (simulated beam) ---------- */
const BEAM_SVG = `<svg id="scene" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice" font-family="Inter,system-ui,sans-serif" style="--bc:#ede3f7" role="img" aria-label="Simulated flashlight beam">
<defs>
<radialGradient id="gpool"><stop offset="0" style="stop-color:var(--bc)" stop-opacity=".95"/><stop offset=".6" style="stop-color:var(--bc)" stop-opacity=".5"/><stop offset="1" style="stop-color:var(--bc)" stop-opacity="0"/></radialGradient>
<linearGradient id="gcone" x1="0" y1="1" x2="0" y2="0"><stop offset="0" style="stop-color:var(--bc)" stop-opacity=".55"/><stop offset="1" style="stop-color:var(--bc)" stop-opacity=".06"/></linearGradient>
<linearGradient id="gground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#150B1C"/><stop offset="1" stop-color="#241631"/></linearGradient>
<symbol id="gh" viewBox="0 0 32 32"><path d="${BODY}" fill="#FBF6EE"/><circle cx="12.4" cy="13.33" r="2" fill="#1B1020"/><circle cx="19.6" cy="13.33" r="2" fill="#1B1020"/></symbol>
<symbol id="gha" viewBox="0 0 32 32"><path d="${BODY}" fill="#FBF6EE"/><circle cx="12.4" cy="14" r="2.1" fill="#1B1020"/><circle cx="19.6" cy="14" r="2.1" fill="#1B1020"/><path d="M9.4 10.6L14.4 12.4M22.6 10.6L17.6 12.4" stroke="#1B1020" stroke-width="1.4" stroke-linecap="round"/><ellipse cx="16" cy="19.5" rx="2.4" ry="3" fill="#1B1020"/></symbol>
</defs>
<rect width="390" height="844" fill="#0D0712"/>
<path d="M90 250L195 170L300 250V330H100V250Z" fill="#1A0F22"/><rect x="255" y="185" width="16" height="32" fill="#1A0F22"/>
<rect id="w1" x="125" y="268" width="22" height="18" rx="2" fill="#2A1A36"/><rect id="w2" x="243" y="268" width="22" height="18" rx="2" fill="#2A1A36"/>
<rect x="181" y="262" width="28" height="68" rx="3" fill="#120A18"/>
<rect y="330" width="390" height="514" fill="url(#gground)"/>
<path d="M75 330L-60 844M315 330L450 844M195 330V844" stroke="#2A1A36" stroke-width="2" opacity=".7"/>
<g id="lit"><polygon id="cone" fill="url(#gcone)"/><g id="pool"><ellipse id="poolEl" rx="170" ry="80" fill="url(#gpool)"/></g></g>
<g id="content" transform="translate(195 470)" text-anchor="middle" fill="#1B1020"></g>
<g id="suck" style="display:none" fill="none" stroke="#7DDC8A" stroke-width="3" stroke-dasharray="7 7"><ellipse cx="195" cy="585" rx="70" ry="16"/><ellipse cx="195" cy="620" rx="48" ry="11" opacity=".7"/><ellipse cx="195" cy="650" rx="28" ry="7" opacity=".5"/></g>
<g id="fight" style="display:none">
 <text x="195" y="362" text-anchor="middle" font-size="11" font-weight="800" letter-spacing="2.5" fill="#FFE6D5" id="hpLabel">GHOST POWER</text>
 <rect x="115" y="370" width="160" height="10" rx="5" fill="#3A2549"/><rect id="hpbar" x="115" y="370" width="160" height="10" rx="5" fill="#7DDC8A"/>
 <g id="ghost"><use id="gN" href="#gh" x="-42" y="-42" width="84" height="84"/><use id="gA" href="#gha" x="-42" y="-42" width="84" height="84" style="display:none"/>
 <circle id="ring" r="56" fill="none" stroke="#FFE6D5" stroke-width="6" stroke-linecap="round" transform="rotate(-90)" stroke-dasharray="352" stroke-dashoffset="352" style="display:none"/></g>
 <text x="195" y="688" text-anchor="middle" font-size="11" font-weight="700" letter-spacing="2.5" fill="#FFE6D5" id="pwLabel">BEAM POWER</text>
 <rect x="140" y="698" width="110" height="8" rx="4" fill="#3A2549"/><rect id="pwbar" x="140" y="698" width="110" height="8" rx="4" fill="#7DDC8A"/>
</g>
<rect x="179" y="790" width="32" height="54" rx="6" fill="#3A2549"/><rect x="174" y="778" width="42" height="14" rx="4" fill="#5B2A86"/><circle cx="195" cy="778" r="5" fill="#fff"/>
</svg>`;

const FIGHT_ST = ['spotted', 'fight', 'stun'];
let B = { st: 'nav' }, F = null, aim = { x: 195, y: 470 }, raf = 0, lastT = 0, scene = null;
const COLORS = { nav: '#ede3f7', warn: '#ffb547', arrived: '#7ddc8a', spotted: '#7ddc8a', fight: '#7ddc8a', stun: '#7ddc8a', caught: '#7ddc8a', escaped: '#b58cf0', maxed: '#b58cf0' };

function navState() {
  if (W.dist <= 50) return capped(W.id) ? 'maxed' : 'arrived';
  if (S.warn && W.dist >= 100 && W.dist <= 130) return 'warn';
  return 'nav';
}
function openBeam() {
  timers.forEach(clearTimeout); timers = [];
  cur = 'beam';
  root.innerHTML = `<div class="beam" id="beam">
    <div class="beam-top"><button class="pill" data-act="goto" data-to="hunt" aria-label="Back to map">‹ Map</button><span class="pill">Flashlight view · simulated</span></div>
    ${BEAM_SVG}<div class="beam-hud"><div class="hint" id="hint"></div><div id="sliderBox"></div><div id="btnBox"></div></div></div>`;
  scene = $('#scene');
  const move = e => { if (B.st !== 'fight' && B.st !== 'stun') return; const p = svgPoint(e); aim.x = clamp(p.x, 70, 320); aim.y = clamp(p.y, 380, 640); applyAim(); };
  scene.addEventListener('pointermove', move);
  scene.addEventListener('pointerdown', move);
  setSt(navState());
}
function svgPoint(e) {
  const pt = scene.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  return pt.matrixTransform(scene.getScreenCTM().inverse());
}
document.addEventListener('keydown', e => {
  if (cur !== 'beam' || (B.st !== 'fight' && B.st !== 'stun')) return;
  const k = { ArrowLeft: [-22, 0], ArrowRight: [22, 0], ArrowUp: [0, -22], ArrowDown: [0, 22] }[e.key];
  if (k) { e.preventDefault(); aim.x = clamp(aim.x + k[0], 70, 320); aim.y = clamp(aim.y + k[1], 380, 640); applyAim(); }
});

function applyAim() {
  const fighting = B.st === 'fight' || B.st === 'stun';
  const rx = fighting ? 125 : 170, ry = fighting ? 58 : 80;
  const x = fighting ? aim.x : 195, y = fighting ? aim.y : 470;
  const el = $('#poolEl'); if (!el) return;
  el.setAttribute('rx', rx); el.setAttribute('ry', ry);
  $('#pool').setAttribute('transform', `translate(${x} ${y})`);
  $('#cone').setAttribute('points', `177,844 213,844 ${x + rx},${y} ${x - rx},${y}`);
}

function setSt(st) {
  B.st = st;
  if (st === 'nav' || st === 'warn' || st === 'arrived' || st === 'maxed') { aim = { x: 195, y: 470 }; F = null; }
  drawBeam();
}
const txt = (y, size, w, s, ls) => `<text y="${y}" font-size="${size}" font-weight="${w}"${ls ? ` letter-spacing="${ls}"` : ''}>${s}</text>`;

function drawBeam() {
  if (cur !== 'beam' || !scene) return;
  const st = B.st, h = houseById(W.id), fighting = st === 'fight' || st === 'stun';
  scene.style.setProperty('--bc', COLORS[st] || '#ede3f7');
  const lit = ['arrived', 'spotted', 'fight', 'stun', 'caught'].includes(st) ? '#7DDC8A' : '#2A1A36';
  $('#w1').setAttribute('fill', lit); $('#w2').setAttribute('fill', lit);
  $('#fight').style.display = (st === 'spotted' || fighting) ? '' : 'none';
  $('#suck').style.display = st === 'stun' ? '' : 'none';
  $('#ring').style.display = st === 'stun' ? '' : 'none';
  applyAim();
  let c = '', hintTxt = '', btn = '', showSlider = false;
  if (st === 'nav') {
    const period = (0.25 + clamp(W.dist, 0, 300) / 300 * 1.35).toFixed(2);
    c = `<g id="arrow" style="--period:${period}s"><path d="M0 -50L28 -4H10V36H-10V-4H-28Z"/></g>` + txt(72, 32, 800, Math.round(W.dist) + ' ft');
    hintTxt = 'Follow the arrow to ' + h.name; showSlider = true;
  } else if (st === 'warn') {
    c = `<g><path d="M0 -50L40 20H-40Z" stroke="#1B1020" stroke-width="8" stroke-linejoin="round"/><path d="M0 -36L28 12H-28Z" fill="#FFB547" stroke="none"/><rect x="-4" y="-22" width="8" height="20" rx="3"/><circle cy="6" r="4"/></g>` + txt(48, 19, 800, 'Uneven ground') + txt(72, 19, 800, 'coming up ahead');
    hintTxt = 'Accessibility warning · uneven ground ahead'; showSlider = true;
  } else if (st === 'arrived') {
    c = txt(-30, 17, 800, 'HAUNTED HOUSE', 2) + txt(14, 40, 800, Math.round(W.dist) + ' ft') + txt(42, 17, 700, h.name + ' · ' + h.score);
    hintTxt = 'Shine the light on the decoration'; showSlider = true;
    btn = '<button class="btn" data-act="shine">Shine on the decoration</button>';
  } else if (st === 'maxed') {
    c = txt(-20, 17, 800, 'MAX CATCHES TONIGHT', 1) + txt(8, 15, 700, h.name) + txt(32, 13, 600, `${CAP} of ${CAP} ghosts caught here`);
    hintTxt = 'You caught every ghost here. Try another house.'; showSlider = true;
    btn = '<button class="btn" data-act="next">Find the next house</button>';
  } else if (st === 'spotted') {
    c = txt(-40, 13, 800, 'GHOST SPOTTED', 3);
    hintTxt = 'A ghost! Get ready to fight it';
  } else if (st === 'caught') {
    c = txt(-20, 56, 800, '+1') + txt(24, 17, 800, 'GHOST CAUGHT', 2) + txt(50, 14, 700, 'Logged to ' + h.name) + txt(72, 12, 600, `${caughtAt(W.id)} of ${CAP} here tonight`);
    hintTxt = 'Nice catch!'; btn = '<button class="btn" data-act="next">Continue</button>';
  } else if (st === 'escaped') {
    c = txt(-10, 22, 800, 'IT GOT AWAY') + txt(18, 14, 700, 'Your beam ran out of power');
    hintTxt = 'Dodge its attacks to keep your beam alive'; btn = '<button class="btn" data-act="shine">Fight again</button>';
  }
  $('#content').innerHTML = fighting ? '' : c;
  $('#hint').textContent = hintTxt;
  $('#btnBox').innerHTML = btn;
  const box = $('#sliderBox');
  if (!showSlider) box.innerHTML = '';
  else if (!$('#dist')) {
    box.innerHTML = `<label for="dist"><span>Distance (simulated walk)</span><output id="distOut"></output></label><input id="dist" type="range" min="0" max="320" step="1">`;
    $('#dist').addEventListener('input', e => { W.dist = +e.target.value; const n = navState(); if (n !== B.st) setSt(n); else if (n === 'nav') { drawContentOnly(); $('#distOut').textContent = Math.round(W.dist) + ' ft'; } else drawBeam(); });
  }
  const r = $('#dist'); if (r) { r.value = Math.round(W.dist); $('#distOut').textContent = Math.round(W.dist) + ' ft'; }
}
function drawContentOnly() { // keep slider focus while distance text changes
  if (B.st === 'nav') {
    const period = (0.25 + clamp(W.dist, 0, 300) / 300 * 1.35).toFixed(2);
    const a = $('#arrow'); if (a) a.style.setProperty('--period', period + 's');
    const t = $('#content text'); if (t) t.textContent = Math.round(W.dist) + ' ft';
  }
  const o = $('#distOut'); if (o) o.textContent = Math.round(W.dist) + ' ft';
}

/* shine on the decoration -> ghost appears -> fight */
function shine() {
  if (capped(W.id)) return;
  setSt('spotted');
  F = { x: 195, y: 470, tx: 195, ty: 470, hp: 1, power: 100, mode: 'drift', dashT: 1.4, atkT: rand(5, 7), tele: 0, prog: 0, flick: 0, s: 0.01 };
  aim = { x: 195, y: 470 }; applyAim();
  $('#fight').style.display = '';
  later(() => { if (B.st === 'spotted') { setSt('fight'); startLoop(); } }, 1400);
  startLoop();
}
function nextHouse() {
  const n = pickNext(W.id);
  if (!n) { go('leaders'); return; }
  setTarget(n); setSt('nav');
}

/* fight loop */
function startLoop() { if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(tick); } }
function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
const hint = s => { const e = $('#hint'); if (e && e.textContent !== s) e.textContent = s; };

function tick(now) {
  raf = 0;
  if (cur !== 'beam' || !F) return;
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  const st = B.st;
  if (st === 'spotted') {
    F.s += (1 - F.s) * Math.min(1, dt * 4);
  } else if (st === 'fight' || st === 'stun') {
    F.s += (1 - F.s) * Math.min(1, dt * 6);
    const near = Math.hypot(aim.x - F.x, aim.y - F.y) < 100;
    if (st === 'fight') fightStep(dt, near); else stunStep(dt, near);
  }
  render();
  if (!raf && cur === 'beam' && ['spotted', 'fight', 'stun'].includes(B.st)) raf = requestAnimationFrame(tick);
}
function fightStep(dt, near) {
  const k = F.mode === 'tele' ? 3.2 : 2.4;
  F.x += (F.tx - F.x) * (1 - Math.exp(-dt * k)); F.y += (F.ty - F.y) * (1 - Math.exp(-dt * k));
  if (F.mode === 'drift') {
    if (near) F.hp = Math.max(0, F.hp - dt * 0.11);
    F.power = Math.min(100, F.power + dt * 6);
    F.dashT -= dt; F.atkT -= dt;
    if (F.dashT <= 0) {
      let best = null;
      for (let i = 0; i < 4; i++) {
        const p = { x: rand(95, 295), y: rand(410, 590) };
        if (!best || Math.hypot(p.x - aim.x, p.y - aim.y) > Math.hypot(best.x - aim.x, best.y - aim.y) || Math.random() < 0.3) best = p;
      }
      F.tx = best.x; F.ty = best.y; F.dashT = rand(1.5, 2.6);
    }
    if (F.hp <= 0) { F.mode = 'stun'; setSt('stun'); F.tx = 195; F.ty = 480; F.prog = 0; startLoop(); return; }
    if (F.atkT <= 0) { F.mode = 'tele'; F.tele = 0.9; F.tx = aim.x; F.ty = aim.y; scene.style.setProperty('--bc', '#ff8a5c'); vib(20); }
  } else if (F.mode === 'tele') {
    F.tele -= dt;
    if (F.tele <= 0) {
      if (Math.hypot(aim.x - F.x, aim.y - F.y) < 110) { F.power -= 34; F.flick = 0.8; vib([60, 40, 60]); scene.classList.remove('flicker'); void scene.getBoundingClientRect(); scene.classList.add('flicker'); }
      F.mode = 'strike'; F.tele = 0.5;
    }
  } else if (F.mode === 'strike') {
    F.tele -= dt;
    if (F.tele <= 0) { F.mode = 'drift'; F.atkT = rand(5, 7); F.dashT = 0.6; scene.style.setProperty('--bc', '#7ddc8a'); }
  }
  if (F.power <= 0) { F.power = 0; stopLoop(); setSt('escaped'); return; }
  const m = F.mode;
  hint(m === 'tele' ? 'DODGE! Sweep the beam away' : m === 'strike' ? (F.flick > 0 ? 'Ouch! Beam power drained' : 'Dodged it!') : near ? 'Hitting it! Keep the light on it' : 'Follow the ghost with the beam');
  if (F.flick > 0) F.flick -= dt;
}
function stunStep(dt, near) {
  F.x += (F.tx - F.x) * (1 - Math.exp(-dt * 2)); F.y += (F.ty - F.y) * (1 - Math.exp(-dt * 2));
  F.prog = clamp(F.prog + (near ? dt / 1.6 : -dt / 1.2), 0, 1);
  hint(near ? 'Hold it! Sucking it up…' : 'Stunned! Hold the beam on it to suck it up');
  if (F.prog >= 1) {
    S.caught[W.id] = caughtAt(W.id) + 1; S.total += 1;
    if (!S.visited.includes(W.id)) S.visited.push(W.id);
    save(); vib([80, 40, 120]); stopLoop(); setSt('caught');
  }
}
function render() {
  if (!F) return;
  const ang = F.mode === 'tele' || F.mode === 'strike';
  const sc = F.s * (ang ? (F.mode === 'tele' ? 1.1 + (0.9 - F.tele) * 0.5 : 1.55) : 1) * (B.st === 'stun' ? 0.75 : 1);
  const g = $('#ghost'); if (!g) return;
  const wob = B.st === 'stun' ? -12 : 0;
  g.setAttribute('transform', `translate(${F.x.toFixed(1)} ${F.y.toFixed(1)}) rotate(${wob}) scale(${sc.toFixed(3)})`);
  $('#gN').style.display = ang ? 'none' : ''; $('#gA').style.display = ang ? '' : 'none';
  $('#hpbar').setAttribute('width', Math.max(0, 160 * F.hp).toFixed(1));
  $('#hpLabel').textContent = B.st === 'stun' ? 'STUNNED' : 'GHOST POWER';
  const pw = $('#pwbar'); pw.setAttribute('width', (110 * F.power / 100).toFixed(1)); pw.setAttribute('fill', F.power < 40 ? '#ff8a5c' : '#7ddc8a');
  $('#ring').setAttribute('stroke-dashoffset', (352 * (1 - F.prog)).toFixed(1));
}

/* ---------- boot ---------- */
go(S.paired ? 'hunt' : 'welcome');
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
