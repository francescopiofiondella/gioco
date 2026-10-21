import * as THREE from 'three';

// Eventi ambientali casuali: cooldown globale e per tipo, mai durante inseguimenti o la fuga,
// con un budget di paura che impedisce raffiche di eventi e non interferisce con le missioni.
const rnd = (a, b) => a + Math.random() * (b - a);

export class EventDirector {
  constructor(game) {
    this.game = game; this.t = 0; this.next = 30; this.cool = {}; this.flashT = 0; this.steps = null; this.sil = null;
    this.events = [
      { id: 'thunder', w: 3, cd: 80, ok: () => true, run: () => this.thunder() },
      { id: 'window', w: 3, cd: 70, ok: () => true, run: () => this.windowLight() },
      { id: 'slam', w: 3, cd: 90, ok: () => true, run: () => this.slam() },
      { id: 'steps', w: 2, cd: 140, ok: () => this.killerQuiet(), run: () => this.distantSteps() },
      { id: 'whisper', w: 2, cd: 110, ok: () => true, run: () => this.whisper() },
      { id: 'knock', w: 1.5, cd: 150, ok: () => !this.game.player.hiding, run: () => this.knock() },
      { id: 'lamp', w: 2, cd: 100, ok: () => true, run: () => this.lampOut() },
      { id: 'silhouette', w: 2, cd: 160, ok: () => this.killerQuiet() && !this.game.player.hiding && this.game.state.flag('killer_intro'), run: () => this.silhouette() },
    ];
    this.buildSilhouette();
  }
  reset() { this.t = 0; this.next = 28; this.cool = {}; this.steps = null; this.setSil(false); }
  killerQuiet() { const k = this.game.killer; return !k.active || k.state === 'patrol' || k.state === 'return'; }

  update(dt) {
    const g = this.game;
    if (this.flashT > 0) { this.flashT -= dt; g.hemi.intensity = g.hemiBase * (this.flashT > 0 ? 2.5 : 1); }
    this.updateSteps(dt); this.updateSil(dt);
    const k = g.killer;
    if (g.car.driving || k.state === 'chase' || k.state === 'lost' || k.state === 'check_hide' || g.phase !== 'playing') return;
    this.t += dt;
    if (this.t < this.next) return;
    const diff = { easy: 1.4, normal: 1, hard: 0.75 }[g.state.difficulty] || 1;
    this.t = 0; this.next = rnd(28, 55) * diff;
    // prima dell'apparizione dell'assassino solo eventi leggeri, che non toccano la missione
    const pool = this.events.filter((e) => e.ok() && (g.time - (this.cool[e.id] ?? -999)) > e.cd && (g.state.flag('killer_intro') || ['thunder', 'window', 'lamp', 'whisper'].includes(e.id)));
    if (!pool.length) return;
    let r = Math.random() * pool.reduce((s, e) => s + e.w, 0), ev = pool[0];
    for (const e of pool) { r -= e.w; if (r <= 0) { ev = e; break; } }
    this.cool[ev.id] = g.time; ev.run();
  }

  playerPos() { return this.game.player.getBodyPos(new THREE.Vector3()); }
  thunder() { const g = this.game; this.flashT = 0.18; g.hud.flash(0.2); setTimeout(() => g.audio?.thunder?.(), rnd(500, 2500)); }
  windowLight() {
    const g = this.game, p = g.world.lightWindow(7);
    if (p) g.audio?.creak?.(p) ?? g.audio?.door?.(p, true);
  }
  slam() {
    const g = this.game, p = this.playerPos();
    const ds = Object.values(g.world.doors).filter((d) => !d.open && Math.hypot(d.pos.x - p.x, d.pos.z - p.z) > 8 && Math.hypot(d.pos.x - p.x, d.pos.z - p.z) < 45);
    if (ds.length) g.audio?.slam(ds[(Math.random() * ds.length) | 0].pos);
  }
  knock() {
    const g = this.game, p = this.playerPos();
    const ds = Object.values(g.world.doors).filter((d) => !d.open && Math.hypot(d.pos.x - p.x, d.pos.z - p.z) < 30);
    if (ds.length) g.audio?.knock(ds[(Math.random() * ds.length) | 0].pos);
  }
  whisper() {
    const p = this.playerPos(), a = Math.random() * 6.28;
    this.game.audio?.whisper({ x: p.x + Math.cos(a) * 3, y: 1.5, z: p.z + Math.sin(a) * 3 });
  }
  lampOut() {
    const g = this.game, p = this.playerPos(), near = g.world.lamps.filter((l) => Math.hypot(l.light.position.x - p.x, l.light.position.z - p.z) < 30);
    if (near.length) near[(Math.random() * near.length) | 0].off = rnd(3, 6);
  }
  distantSteps() {
    const p = this.playerPos(), a = Math.random() * 6.28;
    this.steps = { x: p.x + Math.cos(a) * 18, z: p.z + Math.sin(a) * 18, a, n: 0, acc: 0 };
  }
  updateSteps(dt) {
    const s = this.steps; if (!s) return;
    s.acc += dt; if (s.acc < 0.62) return; s.acc = 0;
    const p = this.playerPos(), d = Math.hypot(p.x - s.x, p.z - s.z);
    s.x += (p.x - s.x) / d * 1.4; s.z += (p.z - s.z) / d * 1.4;
    this.game.audio?.footstep({ x: s.x, y: 0.1, z: s.z }, 0.9, this.game.world.surfaceAt(s.x, s.z), true);
    if (++s.n > 8 || d < 7) this.steps = null;
  }

  // ---------- sagoma che scompare ----------
  buildSilhouette() {
    const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: 0x050506 });
    const add = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); g.add(o); };
    add(new THREE.CylinderGeometry(0.3, 0.4, 1.4, 8), m, 0, 0.9, 0); add(new THREE.SphereGeometry(0.22, 8, 6), m, 0, 1.85, 0);
    const eye = new THREE.MeshBasicMaterial({ color: 0xff8a20 });
    add(new THREE.SphereGeometry(0.035, 6, 4), eye, -0.07, 1.87, -0.19); add(new THREE.SphereGeometry(0.035, 6, 4), eye, 0.07, 1.87, -0.19);
    g.visible = false; this.silMesh = g; this.game.scene.add(g);
  }
  setSil(on) { this.silMesh.visible = on; if (!on) this.sil = null; }
  silhouette() {
    const g = this.game, p = this.playerPos(), dir = g.camera.getWorldDirection(new THREE.Vector3());
    for (let i = 0; i < 10; i++) {
      const a = Math.atan2(dir.x, dir.z) + rnd(-0.7, 0.7), d = rnd(22, 34), x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
      if (g.nav.isBlockedAt(x, z) || !g.collision.lineOfSight(p.x, p.z, x, z)) continue;
      this.silMesh.position.set(x, 0, z); this.silMesh.rotation.y = Math.atan2(p.x - x, p.z - z) + Math.PI;
      this.silMesh.visible = true; this.sil = { t: 0, seen: 0 }; return;
    }
  }
  updateSil(dt) {
    const s = this.sil; if (!s) return;
    s.t += dt;
    const g = this.game, cam = g.camera, to = this.silMesh.position.clone().setY(1.5).sub(cam.getWorldPosition(new THREE.Vector3())).normalize();
    const look = cam.getWorldDirection(new THREE.Vector3()).dot(to);
    if (look > 0.97) s.seen += dt; // il giocatore la sta guardando
    if (s.seen > 0.9 || s.t > 12) { this.setSil(false); g.audio?.whisper(this.silMesh.position); }
  }
}
