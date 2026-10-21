import * as THREE from 'three';

// The Pumpkin Killer: macchina a stati con navigazione A*, vista (cono + raycast), udito (propagazione
// del rumore con occlusione dei muri), indagine su porte aperte, controllo dei nascondigli.
export const S = {
  INACTIVE: 'inactive', PATROL: 'patrol', INVESTIGATE: 'investigate', SEARCH: 'search',
  CHASE: 'chase', LOST: 'lost', CHECK_HIDE: 'check_hide', RETURN: 'return', STUN: 'stun',
};

// Difficoltà: velocità, campo visivo, sensibilità ai rumori, durata ricerca.
const DIFF = {
  easy:   { walk: 1.7, run: 4.2, view: 15, fov: 90,  hear: 0.7, search: 14, lose: 3.0, findHide: 0.2, alert: 0.7 },
  normal: { walk: 2.0, run: 4.9, view: 20, fov: 110, hear: 1.0, search: 22, lose: 2.2, findHide: 0.4, alert: 1.0 },
  hard:   { walk: 2.3, run: 5.5, view: 26, fov: 130, hear: 1.3, search: 32, lose: 1.5, findHide: 0.6, alert: 1.5 },
};
const CATCH_DIST = 1.1;
const rnd = (a, b) => a + Math.random() * (b - a);

export class KillerAI {
  constructor(game) {
    this.game = game;
    this.pos = { x: 0, z: 0 }; this.yaw = 0;
    this.state = S.INACTIVE; this.active = false; this.final = false;
    this.path = null; this.pathIdx = 0; this.target = null;
    this.lastKnown = { x: 0, z: 0 }; this.lastVel = { x: 0, z: 0 }; this.prevPlayer = null;
    this.alert = 0; this.lostT = 0; this.searchT = 0; this.searchCenter = { x: 0, z: 0 };
    this.wait = 0; this.repathT = 0; this.stuckT = 0; this.stuckPos = { x: 0, z: 0 };
    this.hideTarget = null; this.sawHide = null; this.hideChecked = new Map(); this.hideStage = 0; this.hideT = 0; this.checksLeft = 2;
    this.recent = []; this.stunT = 0; this.visible = false; this.time = 0;
    this.phase = 0; this.stepAcc = 0; this.look = 0; this.speedNow = 0; this.doorT = 0; this.catching = false;
    this.growlCd = 0;
    this._pp = new THREE.Vector3(); this._v = new THREE.Vector3();
    this.build();
    game.scene.add(this.group);
    this.group.visible = false;
  }
  get p() { return DIFF[this.game.state.difficulty] || DIFF.normal; }

  // ---------- modello procedurale ----------
  build() {
    const L = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
    const coat = L(0x17181d), dark = L(0x0e0f12), steel = L(0x9aa0a8);
    const pumpkin = L(0xc85a0a, { emissive: 0x6a2400, emissiveIntensity: 0.9 });
    const g = this.group = new THREE.Group(); g.name = 'killer';
    const add = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
    this.body = new THREE.Group(); g.add(this.body);
    add(new THREE.CylinderGeometry(0.26, 0.34, 0.95, 10), coat, 0, 1.22, 0, this.body);
    add(new THREE.CylinderGeometry(0.34, 0.42, 0.5, 10), coat, 0, 0.72, 0, this.body);
    add(new THREE.BoxGeometry(0.7, 0.14, 0.32), coat, 0, 1.66, 0, this.body);
    const limb = (w, h, d, x, y, mat, hand) => {
      const grp = new THREE.Group(); grp.position.set(x, y, 0); this.body.add(grp);
      add(new THREE.BoxGeometry(w, h, d), mat, 0, -h / 2, 0, grp);
      if (hand) add(new THREE.BoxGeometry(w * 1.1, 0.1, d * 1.1), L(0x2a2a2e), 0, -h - 0.04, 0, grp);
      return grp;
    };
    this.legL = limb(0.16, 0.85, 0.18, -0.13, 0.85, dark); this.legR = limb(0.16, 0.85, 0.18, 0.13, 0.85, dark);
    this.armL = limb(0.11, 0.72, 0.12, -0.4, 1.62, coat, true); this.armR = limb(0.11, 0.72, 0.12, 0.4, 1.62, coat, true);
    add(new THREE.BoxGeometry(0.04, 0.62, 0.012), steel, 0, -0.95, -0.05, this.armR); // machete
    // testa di zucca deforme
    this.head = new THREE.Group(); this.head.position.set(0, 1.86, 0); this.body.add(this.head);
    const sk = add(new THREE.SphereGeometry(1, 14, 10), pumpkin, 0, 0, 0, this.head); sk.scale.set(0.27, 0.24, 0.25); sk.rotation.z = 0.12;
    add(new THREE.SphereGeometry(0.1, 8, 6), pumpkin, 0.17, 0.1, 0.1, this.head);
    add(new THREE.SphereGeometry(0.08, 8, 6), pumpkin, -0.15, -0.1, 0.12, this.head);
    const stem = add(new THREE.CylinderGeometry(0.03, 0.05, 0.14, 6), L(0x2f3a14), 0.03, 0.28, 0, this.head); stem.rotation.z = 0.35;
    const tex = this.faceTexture();
    const face = add(new THREE.PlaneGeometry(0.46, 0.4), tex ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.1 }) : new THREE.MeshBasicMaterial({ color: 0xffd040 }), 0, 0, -0.262, this.head);
    face.rotation.y = Math.PI; // il piano guarda verso -z
    this.glow = new THREE.PointLight(0xff7a20, 0, 8, 2); this.glow.position.set(0, 0, -0.35); this.head.add(this.glow);
  }
  faceTexture() {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas'); c.width = 128; c.height = 112; const g = c.getContext('2d');
    const shapes = [
      (o) => { g.beginPath(); g.moveTo(20 - o, 48 + o); g.lineTo(50 + o, 48 + o); g.lineTo(38, 22 - o); g.closePath(); },
      (o) => { g.beginPath(); g.moveTo(78 - o, 48 + o); g.lineTo(108 + o, 48 + o); g.lineTo(90, 22 - o); g.closePath(); },
      (o) => { g.beginPath(); g.moveTo(16 - o, 70); g.lineTo(112 + o, 70); g.lineTo(100, 100 + o); g.lineTo(84, 84); g.lineTo(64, 104 + o); g.lineTo(44, 84); g.lineTo(28, 100 + o); g.closePath(); },
    ];
    g.fillStyle = 'rgba(10,0,0,.85)'; shapes.forEach((s) => { s(4); g.fill(); });
    g.fillStyle = '#ffd040'; shapes.forEach((s) => { s(0); g.fill(); });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  // ---------- ciclo di vita ----------
  setPos(x, z) { this.pos.x = x; this.pos.z = z; this.group.position.set(x, 0, z); }
  /** Dopo il caricamento/nuova partita. */
  reset(x, z) {
    const st = this.game.state;
    this.final = false; this.catching = false;
    this.active = st.flag('killer_intro');
    this.setPos(x, z); this.state = this.active ? S.PATROL : S.INACTIVE;
    this.path = null; this.target = null; this.alert = 0; this.sawHide = null; this.hideChecked.clear(); this.stunT = 0;
    this.group.rotation.set(0, 0, 0); this.body.position.y = 0; this.body.rotation.x = 0;
    this.group.visible = this.active; this.wait = rnd(1, 2);
    if (this.active) this.nextPatrol();
  }
  /** Prima apparizione (missione 1): compare lontano e investiga la zona del giocatore. */
  startIntro() {
    const g = this.game, pp = g.player.getBodyPos(this._pp);
    const cands = g.world.waypoints.filter((w) => {
      const d = Math.hypot(w.x - pp.x, w.z - pp.z);
      return d > 28 && d < 55 && !g.collision.lineOfSight(w.x, w.z, pp.x, pp.z);
    });
    const w = cands.length ? cands[(Math.random() * cands.length) | 0] : { x: pp.x + 35, z: 0 };
    this.active = true; this.group.visible = true; this.setPos(w.x, w.z);
    g.state.setFlag('killer_intro');
    this.investigate(pp.x + rnd(-3, 3), pp.z + rnd(-3, 3));
    g.audio?.thunder?.();
    g.msg('Passi pesanti sulla strada… qualcuno ti ha sentito. Nasconditi!', 5000);
  }
  /** Fuga in auto: l'assassino diventa più aggressivo e punta all'auto. */
  startFinal() {
    const g = this.game; this.final = true; this.active = true; this.group.visible = true;
    this.state = S.CHASE; this.alert = 1; this.sawHide = null; this.path = null; this.stunT = 0;
    if (Math.hypot(this.pos.x - g.car.pos.x, this.pos.z - g.car.pos.z) > 38) {
      // troppo lontano: sbuca dal margine della strada davanti all'auto per garantire tensione
      const c = g.nav.nearestFree(Math.max(g.car.pos.x + 30, 5), -7.5, 8);
      if (c) { const w = g.nav.toWorld(c[0], c[1]); this.setPos(w.x, w.z); }
    }
    g.audio?.growl?.(this.group.position);
  }

  onPlayerHid(spot) {
    if (!this.active || this.final) return;
    const pp = this.game.player.getBodyPos(this._pp);
    const d = Math.hypot(pp.x - this.pos.x, pp.z - this.pos.z);
    const sees = d < 26 && this.game.collision.lineOfSight(this.pos.x, this.pos.z, pp.x, pp.z);
    if (sees && (this.state === S.CHASE || this.alert > 0.3 || d < 9)) {
      this.sawHide = spot; this.hideTarget = spot; this.hideStage = 0; this.state = S.CHECK_HIDE; this.path = null;
    }
  }

  // ---------- udito ----------
  hearNoise(x, z, radius) {
    if (!this.active || this.final || this.state === S.STUN || this.catching) return;
    const r = radius * this.p.hear, d = Math.hypot(x - this.pos.x, z - this.pos.z);
    if (d > r) return;
    const los = this.game.collision.lineOfSight(this.pos.x, this.pos.z, x, z);
    if (d * (los ? 1 : 1.6) > r) return; // i muri attutiscono
    if (this.state === S.CHASE) return;
    if (los && d < r * 0.35 && d < 8) this.alert = Math.min(1, this.alert + 0.35);
    if (this.state === S.CHECK_HIDE && this.sawHide) return;
    this.investigate(x + rnd(-1.5, 1.5), z + rnd(-1.5, 1.5));
  }
  investigate(x, z) {
    this.state = S.INVESTIGATE; this.target = { x, z }; this.wait = 0; this.looking = false;
    if (!this.setPath(x, z)) { this.beginSearch(x, z, this.p.search * 0.5); }
  }

  // ---------- navigazione ----------
  setPath(x, z) {
    const nav = this.game.nav, p = nav.findPath(this.pos.x, this.pos.z, x, z);
    this.path = p; this.pathIdx = p && p.length > 1 ? 1 : 0;
    return !!p;
  }
  follow(dt, speed) {
    if (!this.path || this.pathIdx >= this.path.length) { this.speedNow = 0; return true; }
    const t = this.path[this.pathIdx], dx = t.x - this.pos.x, dz = t.z - this.pos.z, d = Math.hypot(dx, dz), step = speed * dt;
    if (d <= step + 0.05) { this.pos.x = t.x; this.pos.z = t.z; this.pathIdx++; this.speedNow = speed; return this.pathIdx >= this.path.length; }
    this.pos.x += (dx / d) * step; this.pos.z += (dz / d) * step; this.speedNow = speed;
    this.faceTo(dx, dz, dt);
    return false;
  }
  faceTo(dx, dz, dt, rate = 9) {
    const want = Math.atan2(-dx, -dz);
    let diff = want - this.yaw; while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
    this.yaw += diff * Math.min(1, dt * rate);
  }
  nextPatrol() {
    const g = this.game, wps = g.world.waypoints;
    for (let tries = 0; tries < 12; tries++) {
      const w = wps[(Math.random() * wps.length) | 0], d = Math.hypot(w.x - this.pos.x, w.z - this.pos.z);
      if (d < 12 || this.recent.includes(w)) continue;
      if (this.setPath(w.x, w.z)) { this.target = w; this.recent.push(w); if (this.recent.length > 5) this.recent.shift(); return; }
    }
    this.path = null; this.wait = 1;
  }
  beginSearch(x, z, dur) {
    this.state = S.SEARCH; this.searchCenter = { x, z }; this.searchT = dur; this.wait = 0; this.path = null; this.checksLeft = 2; this.looking = false;
    this.pickSearchPoint(true);
  }
  pickSearchPoint(first = false) {
    const g = this.game, c = this.searchCenter;
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2, r = first ? rnd(0, 3) : rnd(2, 9), x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (g.nav.isBlockedAt(x, z)) continue;
      if (this.setPath(x, z)) return;
    }
    this.path = null; this.wait = 1.5;
  }
  beginRecover() {
    this.state = S.RETURN; this.alert = 0; this.sawHide = null;
    const g = this.game, wps = g.world.waypoints.slice().sort((a, b) => Math.hypot(a.x - this.pos.x, a.z - this.pos.z) - Math.hypot(b.x - this.pos.x, b.z - this.pos.z));
    for (const w of wps.slice(0, 6)) if (this.setPath(w.x, w.z)) return;
    this.state = S.PATROL; this.nextPatrol();
  }
  tryCheckHide() {
    if (this.checksLeft <= 0 || this.final) return false;
    const g = this.game, c = this.searchCenter, now = this.time;
    const spots = g.world.hideSpots
      .filter((s) => Math.hypot(s.pos.x - c.x, s.pos.z - c.z) < 11 && (now - (this.hideChecked.get(s.id) ?? -99)) > 40)
      .sort((a, b) => Math.hypot(a.pos.x - c.x, a.pos.z - c.z) - Math.hypot(b.pos.x - c.x, b.pos.z - c.z));
    if (!spots.length) return false;
    const spot = spots[0];
    if (!this.setPath(spot.exit.x, spot.exit.z)) { this.hideChecked.set(spot.id, now); return false; }
    this.checksLeft--; this.hideTarget = spot; this.hideStage = 0; this.state = S.CHECK_HIDE;
    return true;
  }

  // ---------- vista ----------
  perceive(dt, pp) {
    const g = this.game, pl = g.player, p = this.p;
    const dx = pp.x - this.pos.x, dz = pp.z - this.pos.z, dist = Math.hypot(dx, dz);
    this.visible = false;
    if (!pl.hiding) {
      let mult = 1;
      if (g.state.torch.on) mult *= 1.45;
      if (pl.crouching) mult *= 0.55;
      if (!pl.moving && !g.state.torch.on) mult *= 0.55;
      if (pl.running) mult *= 1.2;
      const eff = p.view * mult;
      if (dist < eff) {
        const half = (this.state === S.CHASE ? p.fov * 1.4 : p.fov) * Math.PI / 360;
        const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
        const ang = Math.acos(Math.max(-1, Math.min(1, (fx * dx + fz * dz) / Math.max(dist, 1e-4))));
        if ((dist < 2.2 || ang <= half) && g.collision.lineOfSight(this.pos.x, this.pos.z, pp.x, pp.z)) {
          this.visible = true;
          const gain = p.alert * (0.9 + 2 * (1 - dist / eff));
          this.alert = Math.min(1, this.alert + gain * dt);
        }
      }
    }
    if (!this.visible) this.alert = Math.max(0, this.alert - 0.5 * dt);
    if (this.prevPlayer && dt > 0) { this.lastVel.x = (pp.x - this.prevPlayer.x) / dt; this.lastVel.z = (pp.z - this.prevPlayer.z) / dt; }
    this.prevPlayer = { x: pp.x, z: pp.z };
    return dist;
  }

  // ---------- aggiornamento ----------
  update(dt) {
    if (!this.active) { this.group.visible = false; return; }
    this.time += dt; this.growlCd -= dt;
    const g = this.game, pp = g.player.getBodyPos(this._pp);
    if (this.catching) { this.animate(dt); return; }
    if (this.state === S.STUN) {
      this.stunT -= dt; this.speedNow = 0;
      if (this.stunT <= 0) { this.state = S.CHASE; this.body.rotation.x = 0; this.body.position.y = 0; }
      this.animate(dt); this.syncMesh(); return;
    }
    const dist = this.final ? Math.hypot(this.game.car.pos.x - this.pos.x, this.game.car.pos.z - this.pos.z) : this.perceive(dt, pp);
    this.speedNow = 0;
    if (this.final) this.updateFinal(dt);
    else {
      if (this.alert >= 1 && this.state !== S.CHASE && this.state !== S.CHECK_HIDE) this.startChase();
      switch (this.state) {
        case S.PATROL: this.doPatrol(dt); break;
        case S.INVESTIGATE: this.doInvestigate(dt); break;
        case S.CHASE: this.doChase(dt, pp); break;
        case S.LOST: this.doLost(dt); break;
        case S.SEARCH: this.doSearch(dt); break;
        case S.CHECK_HIDE: this.doCheckHide(dt); break;
        case S.RETURN: if (this.follow(dt, this.p.walk) || !this.path) { this.state = S.PATROL; this.nextPatrol(); this.markIntroDone(); } break;
        default: break;
      }
      if (this.state === S.PATROL) this.watchDoors(dt);
      this.checkStuck(dt);
    }
    this.openDoorsAhead(dt);
    this.stepSounds(dt);
    this.animate(dt);
    this.syncMesh();
    if (!this.final && dist < CATCH_DIST && !g.player.hiding && this.state !== S.STUN) g.caught();
  }
  markIntroDone() {
    const s = this.game.state;
    if (s.flag('killer_intro') && !s.flag('intro_done')) s.setFlag('intro_done');
  }
  startChase() {
    this.state = S.CHASE; this.lostT = 0; this.path = null; this.repathT = 0; this.sawHide = null;
    if (this.growlCd <= 0) { this.game.audio?.growl?.(this.group.position); this.growlCd = 12; }
    this.game.audio?.sting?.();
  }
  doPatrol(dt) {
    if (this.wait > 0) { this.wait -= dt; this.look = Math.sin(this.time * 1.3) * 0.9; return; }
    if (!this.path || this.follow(dt, this.p.walk)) {
      this.wait = rnd(1, 2.6); this.nextPatrol(); this.markIntroDone();
    }
  }
  doInvestigate(dt) {
    if (this.wait > 0) { this.wait -= dt; this.look = Math.sin(this.time * 2) * 1.1; if (this.wait <= 0) this.beginSearch(this.target.x, this.target.z, this.p.search * 0.5); return; }
    if (!this.path || this.follow(dt, this.p.walk * 1.35)) { this.wait = 2.5; }
  }
  doChase(dt, pp) {
    const g = this.game, run = this.p.run;
    if (this.visible) {
      this.lostT = 0; this.lastKnown = { x: pp.x, z: pp.z };
      if (g.nav.lineClear(this.pos.x, this.pos.z, pp.x, pp.z)) { this.path = [{ x: this.pos.x, z: this.pos.z }, { x: pp.x, z: pp.z }]; this.pathIdx = 1; }
      else { this.repathT -= dt; if (this.repathT <= 0 || !this.path) { this.setPath(pp.x, pp.z); this.repathT = 0.35; } }
    } else {
      this.lostT += dt;
      if (this.lostT > this.p.lose) { this.state = S.LOST; this.path = null; this.lastKnown = { x: this.lastKnown.x + this.lastVel.x * 0.6, z: this.lastKnown.z + this.lastVel.z * 0.6 }; this.setPath(this.lastKnown.x, this.lastKnown.z); return; }
      this.repathT -= dt;
      if (this.repathT <= 0 || !this.path) { this.setPath(this.lastKnown.x, this.lastKnown.z); this.repathT = 0.5; }
    }
    this.follow(dt, run);
  }
  doLost(dt) {
    if (this.alert >= 1) { this.startChase(); return; }
    if (!this.path || this.follow(dt, this.p.run * 0.6)) this.beginSearch(this.lastKnown.x, this.lastKnown.z, this.p.search);
  }
  doSearch(dt) {
    this.searchT -= dt;
    if (this.searchT <= 0) { this.beginRecover(); return; }
    if (this.wait > 0) {
      this.wait -= dt; this.look = Math.sin(this.time * 2.4) * 1.2;
      if (this.wait <= 0) { if (Math.random() < 0.45 && this.tryCheckHide()) return; this.pickSearchPoint(); }
      return;
    }
    if (!this.path || this.follow(dt, this.p.walk * 1.15)) this.wait = rnd(1.2, 2.2);
  }
  doCheckHide(dt) {
    const s = this.hideTarget, g = this.game;
    if (!s) { this.state = S.SEARCH; return; }
    if (this.hideStage === 0) {
      if (!this.path) this.setPath(s.exit.x, s.exit.z);
      if (this.follow(dt, this.sawHide ? this.p.run : this.p.walk * 1.2) || !this.path) { this.hideStage = 1; this.hideT = 1.1; g.audio?.door?.(s.pos, true); }
      return;
    }
    this.hideT -= dt; this.look = 0;
    if (this.hideT > 0) return;
    this.hideChecked.set(s.id, this.time);
    if (g.player.hiding === s && (this.sawHide === s || Math.random() < this.p.findHide)) { g.caught(); return; }
    if (g.player.hiding === s) g.audio?.door?.(s.pos, false);
    this.sawHide = null; this.hideTarget = null;
    this.state = S.SEARCH; this.wait = 1; this.path = null; if (this.searchT <= 0) this.searchT = 6;
  }
  updateFinal(dt) {
    const g = this.game, car = g.car;
    this.repathT -= dt;
    const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw), lead = Math.max(0, car.speed) * 1.1;
    const tx = car.pos.x + fx * lead, tz = car.pos.z + fz * lead;
    if (this.repathT <= 0 || !this.path) {
      if (g.nav.lineClear(this.pos.x, this.pos.z, tx, tz)) { this.path = [{ x: this.pos.x, z: this.pos.z }, { x: tx, z: tz }]; this.pathIdx = 1; }
      else this.setPath(tx, tz);
      this.repathT = 0.3;
    }
    this.follow(dt, this.p.run * 1.12);
    const d = Math.hypot(car.pos.x - this.pos.x, car.pos.z - this.pos.z);
    if (d < 2.3) {
      if (Math.abs(car.speed) > 7) { // investito
        this.state = S.STUN; this.stunT = 3.5; this.path = null;
        const k = 1 / Math.max(d, 0.1); this.pos.x += (this.pos.x - car.pos.x) * k * 3; this.pos.z += (this.pos.z - car.pos.z) * k * 3;
        car.speed *= 0.85; g.audio?.crash?.(this.group.position); g.hud.flash(0.3); g.msg('Lo hai investito! Vai, vai!', 2500);
      } else if (d < 1.9) g.caught();
    }
  }
  watchDoors(dt) {
    this.doorT -= dt; if (this.doorT > 0) return; this.doorT = 0.8;
    const g = this.game;
    for (const d of Object.values(g.world.doors)) {
      if (!d.open || !d.suspicious) continue;
      const dist = Math.hypot(d.pos.x - this.pos.x, d.pos.z - this.pos.z);
      if (dist < 16 && g.collision.lineOfSight(this.pos.x, this.pos.z, d.pos.x, d.pos.z + (d.pos.z > this.pos.z ? 1.2 : -1.2))) {
        d.suspicious = false; this.investigate(d.pos.x, d.pos.z + (d.b.door === 's' ? 1.5 : -1.5)); return;
      }
    }
  }
  openDoorsAhead() {
    for (const d of Object.values(this.game.world.doors)) {
      if (d.open || d.isLocked()) continue;
      if (Math.hypot(d.pos.x - this.pos.x, d.pos.z - this.pos.z) < 1.8) d.setOpen(true, false);
    }
  }
  checkStuck(dt) {
    if (this.speedNow === 0) { this.stuckT = 0; return; }
    this.stuckT += dt;
    if (this.stuckT > 1.5) {
      const moved = Math.hypot(this.pos.x - this.stuckPos.x, this.pos.z - this.stuckPos.z);
      if (moved < 0.15) { this.path = null; this.repathT = 0; if (this.state === S.PATROL) this.nextPatrol(); }
      this.stuckPos = { x: this.pos.x, z: this.pos.z }; this.stuckT = 0;
    }
  }
  /** Chiamato quando il giocatore viene catturato. */
  onCapture() { this.catching = true; this.speedNow = 0; }
  stepSounds(dt) {
    if (this.speedNow <= 0.1) return;
    this.stepAcc += this.speedNow * dt;
    const stride = this.speedNow > 3.5 ? 1.7 : 1.15;
    if (this.stepAcc > stride) {
      this.stepAcc = 0;
      const g = this.game, v = this._v.set(this.pos.x, 0.1, this.pos.z);
      g.audio?.footstep?.(v, this.speedNow > 3.5 ? 1.0 : 0.75, g.world.surfaceAt(this.pos.x, this.pos.z), true);
    }
  }

  // ---------- animazione e mesh ----------
  animate(dt) {
    const sp = this.speedNow, run = sp > 3.5;
    this.phase += dt * (sp > 0.1 ? sp * (run ? 2.4 : 3.4) : 0);
    const amp = sp > 0.1 ? (run ? 0.95 : 0.5) : 0, s = Math.sin(this.phase) * amp;
    this.legL.rotation.x = s; this.legR.rotation.x = -s;
    const t = this.time;
    if (this.catching) { this.armR.rotation.x = -2.4 + Math.sin(t * 12) * 0.4; this.armL.rotation.x = -1.6; }
    else if (this.state === S.CHASE || this.final) { this.armL.rotation.x = -s * 0.4 - 0.4; this.armR.rotation.x = -1.1 + s * 0.2; }
    else { this.armL.rotation.x = -s * 0.6; this.armR.rotation.x = s * 0.6 + Math.sin(t * 1.1) * 0.04; }
    if (this.state !== S.STUN) { this.body.rotation.x += ((run ? 0.28 : 0) - this.body.rotation.x) * Math.min(1, dt * 6); this.body.position.y = Math.abs(Math.sin(this.phase)) * amp * 0.05; }
    else { this.body.rotation.x += (-1.45 - this.body.rotation.x) * Math.min(1, dt * 8); this.body.position.y = 0.15; }
    const lookTarget = sp > 0.1 || this.state === S.CHASE ? 0 : this.look;
    this.head.rotation.y += (lookTarget - this.head.rotation.y) * Math.min(1, dt * 5);
    const fl = 0.5 + 0.5 * Math.sin(t * 13) * Math.sin(t * 3.1);
    this.glow.intensity = (this.state === S.CHASE ? 7 : 3.2) * (0.7 + 0.3 * fl);
  }
  syncMesh() {
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.yaw;
  }
  /** Livello di minaccia 0..1 per musica e battito. */
  threat() {
    if (!this.active) return 0;
    const g = this.game, pp = g.player.getBodyPos(this._pp), d = Math.hypot(pp.x - this.pos.x, pp.z - this.pos.z);
    if (this.final) return 0.9;
    switch (this.state) {
      case S.CHASE: return Math.max(0.6, 1 - d / 45);
      case S.LOST: case S.CHECK_HIDE: return Math.max(0.35, 0.8 - d / 40);
      case S.SEARCH: case S.INVESTIGATE: return Math.max(0.12, 0.6 - d / 30);
      default: return Math.max(0, 0.3 - d / 60);
    }
  }
}
