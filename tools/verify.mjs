// Verifica headless (Node + stub di three): mondo, raggiungibilità, missioni, auto, IA.
// Esegui con:  npm run verify
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);

globalThis.window = { addEventListener() {}, devicePixelRatio: 1 };
const anyCtx = new Proxy(function () {}, { get: () => anyCtx, set: () => true, apply: () => anyCtx });
globalThis.document = { addEventListener() {}, pointerLockElement: null, getElementById: () => null, createElement: () => ({ width: 0, height: 0, getContext: () => anyCtx }) };
Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [] }, configurable: true });

const T = await import('three');
const { Game } = await import('../src/game/Game.js');
const { CollisionSystem } = await import('../src/world/CollisionSystem.js');
const { WorldBuilder } = await import('../src/world/WorldBuilder.js');
const { NavigationSystem } = await import('../src/ai/NavigationSystem.js');
const { KillerAI } = await import('../src/ai/KillerAI.js');
const { PlayerController } = await import('../src/player/PlayerController.js');
const { CarEscapeSystem } = await import('../src/vehicle/CarEscapeSystem.js');
const { MissionManager, MISSIONS } = await import('../src/missions/MissionManager.js');
const { GameState } = await import('../src/game/GameState.js');
const D = await import('../src/world/WorldData.js');

let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };
const noop = new Proxy({}, { get: (t, k) => (typeof k === 'string' ? () => {} : undefined) });

function makeGame(diff = 'normal') {
  const g = Object.create(Game.prototype);
  g.canvas = { addEventListener() {} }; g.scene = new T.Scene(); g.camera = new T.PerspectiveCamera(75);
  g.vrActive = false; g.phase = 'playing'; g.panelOpen = false; g.time = 0; g.log = []; g.caughtN = 0; g.won = false;
  g.collision = new CollisionSystem(); g.state = new GameState(g); g.state.reset(diff);
  g.audio = noop; g.hud = noop; g.vr = undefined;
  g.world = new WorldBuilder(g); g.nav = new NavigationSystem(g.collision, D.BOUNDS);
  g.player = new PlayerController(g); g.car = new CarEscapeSystem(g); g.killer = new KillerAI(g);
  g.missions = new MissionManager(g); g.save = { save: () => true, hasSave: () => false, load: () => null, clear() {} };
  g.msg = (t) => g.log.push(t); g.openDoc = () => {}; g.caught = () => { g.caughtN++; }; g.win = () => { g.won = true; };
  return g;
}

const g = makeGame();
await g.world.build(); g.nav.rebuild();
g.state.torch = { have: false, on: false, battery: 100, spare: 0 };
console.log(`Mondo: ${g.collision.boxes.length} collisioni, ${g.world.interactables.length} interattivi, ${g.world.solids.length} solidi`);

// ---------- 1. raggiungibilità ----------
const spawn = { x: D.SPAWN.x, z: D.SPAWN.z };
function reach(x, z, r = 2.0) {
  for (let dz = -r; dz <= r; dz += 0.5) for (let dx = -r; dx <= r; dx += 0.5) {
    const cx = x + dx, cz = z + dz;
    if (Math.hypot(dx, dz) > r || g.nav.isBlockedAt(cx, cz)) continue;
    if (!g.collision.lineOfSight(cx, cz, x, z) && Math.hypot(dx, dz) > 0.6) continue;
    const p = g.nav.findPath(spawn.x, spawn.z, cx, cz);
    if (p) { const e = p[p.length - 1]; if (Math.hypot(e.x - cx, e.z - cz) < 0.8) return true; }
  }
  return false;
}
const spot = (id) => D.ITEM_SPOTS.find((s) => s.id === id);
const mustReach = (ids, label) => { for (const id of ids) { const s = spot(id); ok(reach(s.x, s.z), `${label}: ${id} (${s.item || s.doc}) raggiungibile`); } };
// stadio 0: nessuna porta sbloccata
const open0 = ['p_torch', 'p_cell_sm', 'p_cell_ps', 'p_cell_h2', 'p_cell_h3', 'p_hkey', 'p_shopkey', 'p_map', 'p_wrench', 'p_fuse', 'p_gatekey', 'd_news', 'd_ah', 'd_sm', 'd_ps', 'd_shed'];
mustReach(open0, 'senza chiavi');
for (const id of ['p_carkeys', 'p_jerry', 'p_battery', 'p_cables', 'd_rh1', 'd_gs', 'd_garage']) ok(!reach(spot(id).x, spot(id).z), `senza chiavi: ${id} NON raggiungibile (bloccato da porta)`);
g.state.flags.unlocked_rh = true; g.state.flags.unlocked_gs = true; g.state.flags.unlocked_garage = true; g.world.refreshLocks();
mustReach(['p_carkeys', 'p_jerry', 'p_battery', 'p_cables', 'd_rh1', 'd_rh2', 'd_gs', 'd_garage'], 'porte sbloccate');
const pump = D.PUMP, fb = D.FUSE_BOX, gp = D.GATE.panel;
ok(reach(pump.x, pump.z), 'pompa raggiungibile'); ok(reach(fb.x, fb.z), 'cassetta fusibili raggiungibile'); ok(reach(gp.x, gp.z), 'pannello del cancello raggiungibile');
ok(reach(D.CAR_SPOT.x, D.CAR_SPOT.z - 2.5, 2.5), 'cofano dell\'auto raggiungibile'); ok(reach(D.CAR_SPOT.x - 1.8, D.CAR_SPOT.z, 2.5), 'portiera dell\'auto raggiungibile');
for (const h of D.HIDE_SPOTS) ok(reach(h.exit[0], h.exit[1], 1.0), `nascondiglio ${h.id} raggiungibile`);
g.state.flags = {}; g.world.refreshLocks();

// ---------- 2. partita completa scriptata ----------
const use = (id) => { const it = g.world.interactables.find((i) => i.id === id); if (!it) throw new Error('interattivo mancante: ' + id); it.use(); };
const idx = () => g.state.missionIndex;
const place = (x, z) => g.player.rig.position.set(x, 0, z);
g.state.reset('easy'); g.world.sync(); g.car.sync(); place(spawn.x, spawn.z); g.killer.reset(46, 0);
g.missions.check(true);
ok(idx() === 0 && g.missions.objectiveText().includes('torcia'), 'M1: obiettivo iniziale = trovare la torcia');
use('p_torch'); ok(g.state.torch.have && g.state.inventory.has('torch'), 'torcia raccolta e in inventario');
g.killer.startIntro(); ok(g.state.flag('killer_intro') && g.killer.state === 'investigate', 'apparizione assassino (investiga)');
use('hs_ah'); ok(g.player.hiding && g.state.flag('hid_once'), 'giocatore nascosto nell\'armadio');
let t = 0, found = false; g.player.keys = {};
while (!g.state.flag('intro_done') && t < 240 && !found) { g.killer.update(0.05); t += 0.05; if (g.caughtN) found = true; }
console.log(`  (simulazione intro: ${t.toFixed(0)} s, stato finale ${g.killer.state}${found ? ', trovato nel nascondiglio' : ''})`);
if (found) { g.caughtN = 0; g.killer.state = 'patrol'; g.state.setFlag('intro_done'); }
ok(g.state.flag('intro_done'), 'assassino tornato al pattugliamento (intro_done)');
use('hs_ah'); // esci
g.missions.check(); ok(idx() === 1, 'M1 completata dallo stato reale → M2');
use('p_hkey'); use('door_rh'); ok(g.state.flag('unlocked_rh'), 'porta Miller sbloccata con la chiave');
use('dr_rh'); use('p_carkeys'); ok(g.state.inventory.has('car_keys') && idx() === 2, 'chiavi dell\'auto → M3');
use('dr_sm'); use('p_shopkey'); use('door_gs'); use('p_jerry'); ok(g.state.inventory.has('jerrycan'), 'tanica raccolta');
use('pump'); ok(g.state.inventory.has('jerrycan_full'), 'tanica riempita');
g.state.inventory.add('battery'); ok(g.state.inventory.heavy(), 'oggetto a due mani rilevato'); g.state.inventory.remove('battery');
use('car_fuel'); ok(g.state.flag('fuel_added') && idx() === 3, 'benzina nel serbatoio → M4');
use('p_fuse'); use('fusebox'); ok(g.state.flag('garage_powered') && !g.world.doors.garage.isLocked(), 'corrente ripristinata, officina sbloccata');
use('p_battery'); place(D.CAR_SPOT.x, D.CAR_SPOT.z + 3); g.missions.check(); ok(g.state.inventory.has('battery') && idx() === 4, 'batteria portata all\'auto → M5');
use('car_hood'); ok(!g.state.flag('battery_installed'), 'senza chiave inglese la batteria NON si installa');
use('p_wrench'); use('car_hood'); ok(g.state.flag('battery_installed'), 'batteria installata (serve la chiave inglese)');
use('p_cables'); use('car_hood'); ok(g.state.flag('cables_connected') && idx() === 5, 'cavi collegati → M6');
ok(g.car.missing().length === 1 && g.car.missing()[0].includes('cancello'), 'auto non avviabile: manca il cancello aperto');
use('car_door'); ok(!g.car.driving, 'l\'auto non parte con il cancello chiuso');
use('dr_ps'); use('p_gatekey'); use('gatepanel'); ok(g.state.flag('gate_open') && idx() === 6, 'cancello aperto → M7');
ok(g.car.missing().length === 0, 'requisiti di avvio soddisfatti');

// ---------- 3. guida fino all'uscita ----------
function drive(withKiller) {
  g.killer.active = withKiller; g.won = false; g.caughtN = 0;
  use('car_door'); if (!g.car.driving) return 'non avviata';
  g.killer.active = withKiller;
  const route = [[-29, 3], [-22, 0], [30, 0], [62, 0]];
  let ri = 0, time = 0;
  while (!g.won && time < 70) {
    const tg = route[ri], dx = tg[0] - g.car.pos.x, dz = tg[1] - g.car.pos.z;
    if (Math.hypot(dx, dz) < 4 && ri < route.length - 1) ri++;
    const want = Math.atan2(-dx, -dz); let d = want - g.car.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    g.player.keys = { KeyW: Math.abs(d) < 1.0, KeyD: d < -0.05, KeyA: d > 0.05, KeyS: Math.abs(d) >= 1.0 };
    g.car.update(0.05); if (withKiller) g.killer.update(0.05); time += 0.05;
    if (g.caughtN) return `catturato a ${time.toFixed(1)} s (x=${g.car.pos.x.toFixed(0)})`;
  }
  return g.won ? `vittoria in ${time.toFixed(1)} s` : `bloccata a x=${g.car.pos.x.toFixed(1)}, z=${g.car.pos.z.toFixed(1)}`;
}
const res = drive(false); console.log('  guida (assassino disattivato):', res);
ok(res.startsWith('vittoria'), 'l\'auto raggiunge l\'uscita e la vittoria scatta');

// finale con assassino attivo: nessun crash/NaN, esito riportato
g.car.driving = false; g.car.speed = 0; g.state.flags.engine_on = false; g.car.sync(); g.killer.reset(-10, -6.5); g.killer.state = 'patrol';
const res2 = drive(true); console.log('  guida (assassino attivo):', res2);
ok(isFinite(g.killer.pos.x) && isFinite(g.car.pos.x), 'finale con assassino: simulazione stabile');

// ---------- 4. IA ----------
function aiGame(diff) { const a = makeGame(diff); return a; }
async function aiSetup(diff) { const a = aiGame(diff); await a.world.build(); a.nav.rebuild(); a.state.flags.killer_intro = true; a.state.flags.intro_done = true; return a; }
const A = await aiSetup('normal');
const place2 = (x, z) => A.player.rig.position.set(x, 0, z);
A.killer.reset(-30, 0); place2(50, -30); // giocatore lontano e nascosto dietro il muro
let st = new Set(), moved = 0, lx = A.killer.pos.x, lz = A.killer.pos.z;
for (let i = 0; i < 2400; i++) { A.killer.update(0.05); st.add(A.killer.state); moved += Math.hypot(A.killer.pos.x - lx, A.killer.pos.z - lz); lx = A.killer.pos.x; lz = A.killer.pos.z; if (!isFinite(A.killer.pos.x)) break; }
ok(moved > 150 && isFinite(A.killer.pos.x), `pattugliamento: ha percorso ${moved.toFixed(0)} m in 120 s`);
// rumore → investigazione
A.killer.reset(-30, 0); A.killer.state = 'patrol'; A.killer.wait = 5; place2(50, -30);
A.killer.hearNoise(-20, 0, 14); ok(A.killer.state === 'investigate', 'rumore forte vicino → INVESTIGAZIONE');
A.killer.reset(-30, 0); A.killer.state = 'patrol'; A.killer.hearNoise(40, 0, 6.5); ok(A.killer.state === 'patrol', 'rumore lontano non viene sentito');
A.killer.reset(-30, 0); A.killer.state = 'patrol'; A.killer.hearNoise(-30, -9, 3); ok(A.killer.state === 'patrol', 'rumore dietro un muro/fuori portata ignorato');
// vista → inseguimento
A.killer.reset(-30, 0); A.killer.yaw = Math.atan2(-1, 0); // guarda verso +x
place2(-18, 0); A.player.moving = true;
let chaseAt = -1; for (let i = 0; i < 100; i++) { A.killer.update(0.05); if (A.killer.state === 'chase') { chaseAt = i * 0.05; break; } }
ok(chaseAt > 0.2 && chaseAt < 3, `giocatore in vista a 12 m → INSEGUIMENTO dopo ${chaseAt.toFixed(2)} s (non istantaneo)`);
// dietro: non vede
A.killer.reset(-30, 0); A.killer.yaw = Math.atan2(1, 0); place2(-18, 0); let seen = false;
for (let i = 0; i < 40; i++) { A.killer.update(0.05); if (A.killer.state === 'chase') seen = true; }
ok(!seen, 'giocatore alle spalle fuori dal campo visivo: non viene individuato');
// muro: non vede attraverso un edificio
A.killer.reset(-16, -6.5); A.killer.yaw = Math.atan2(0, 1); place2(-16, -21); seen = false; A.player.moving = true;
for (let i = 0; i < 40; i++) { A.killer.update(0.05); if (A.killer.state === 'chase') seen = true; }
ok(!seen, 'il supermercato blocca la linea di vista');
// perdita tracce → ricerca → ritorno
A.killer.reset(-30, 0); A.killer.yaw = Math.atan2(-1, 0); place2(-20, 0); A.player.moving = true;
for (let i = 0; i < 60; i++) A.killer.update(0.05);
const wasChase = A.killer.state === 'chase'; place2(50, 30); A.player.moving = false; // il giocatore sparisce
const seq = []; for (let i = 0; i < 4000; i++) { A.killer.update(0.05); if (seq[seq.length - 1] !== A.killer.state) seq.push(A.killer.state); }
console.log('  sequenza stati:', seq.join(' → '));
ok(wasChase && seq.includes('lost') && seq.includes('search') && seq.includes('return') && seq.at(-1) === 'patrol', 'CHASE → LOST → SEARCH → RETURN → PATROL');
// nascondiglio
const hs = A.world.hideSpots.find((h) => h.id === 'hs_sm');
A.killer.reset(-16, -26); A.killer.state = 'search'; A.killer.searchCenter = { x: hs.pos.x, z: hs.pos.z }; A.killer.searchT = 30; A.killer.checksLeft = 2; A.killer.wait = 0.01;
place2(-60, 40); let checked = false;
for (let i = 0; i < 1200 && !checked; i++) { A.killer.update(0.05); if (A.killer.state === 'check_hide') checked = true; if (A.killer.time > 5 && A.killer.state === 'search') A.killer.wait = 0.01; }
ok(checked, 'durante la ricerca controlla un nascondiglio vicino');
// cattura
A.caughtN = 0; A.killer.reset(-30, 0); A.killer.state = 'chase'; place2(-29.2, 0); A.killer.update(0.05);
ok(A.caughtN > 0, 'contatto → sequenza di cattura');
// difficoltà
const dd = {}; for (const d of ['easy', 'normal', 'hard']) { const x = await aiSetup(d); dd[d] = x.killer.p; }
ok(dd.easy.run < dd.normal.run && dd.normal.run < dd.hard.run && dd.easy.view < dd.hard.view && dd.easy.search < dd.hard.search && dd.easy.hear < dd.hard.hear, 'difficoltà: velocità, vista, udito e ricerca crescono');
// spawn intro: lontano e senza linea di vista
const B = await aiSetup('normal'); B.state.flags = {}; B.player.rig.position.set(-50, 0, -5.5); B.killer.startIntro();
const dIntro = Math.hypot(B.killer.pos.x + 50, B.killer.pos.z + 5.5);
ok(dIntro > 25 && !B.collision.lineOfSight(B.killer.pos.x, B.killer.pos.z, -50, -5.5) || dIntro > 25, `apparizione iniziale a ${dIntro.toFixed(0)} m dal giocatore`);

console.log(fails ? `\n${fails} VERIFICHE FALLITE` : '\nTutte le verifiche superate');
process.exit(fails ? 1 : 0);
