import * as THREE from 'three';
import { settings } from '../config/Settings.js';
import { VRPanel } from '../ui/VRPanel.js';
import { DOCS } from '../world/WorldData.js';

// WebXR (immersive-vr): sessione, controller, locomozione fluida o a teletrasporto, rotazione a scatti o
// fluida, interazione con raggi, afferrare/osservare oggetti, torcia impugnata, UI 3D e comfort (vignettatura).
const DZ = 0.18;
export class VRController {
  constructor(game) {
    this.game = game; this.renderer = game.renderer; this.session = null; this.supported = false;
    this.ctrls = []; this.hand = { left: null, right: null };
    this.held = { left: null, right: null }; this.prev = {};
    this.snapCd = 0; this.exitHold = 0; this.vigAmt = 0; this.vigTarget = 0;
    this.tp = { aiming: false, valid: false, point: new THREE.Vector3() };
    this.driveIn = { thr: 0, steer: 0 };
    this._o = new THREE.Vector3(); this._d = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3();
    this.panel = new VRPanel(game);
    this.renderer.xr.setReferenceSpaceType('local-floor');
    this.setupControllers();
    this.setupComfort();
    this.setupTeleport();
    this.panel.attach();
    this.detect();
  }

  async detect() {
    try { this.supported = !!navigator.xr && await navigator.xr.isSessionSupported('immersive-vr'); } catch { this.supported = false; }
    return this.supported;
  }

  // ---------- sessione ----------
  /** DEVE essere chiamato direttamente dal gestore di un click (gesto dell'utente). */
  async enter() {
    if (!this.supported) throw new Error('WebXR immersive-vr non disponibile');
    if (this.session) return;
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
    this.renderer.xr.setFramebufferScaleFactor?.(0.9);
    await this.renderer.xr.setSession(session);
    this.session = session;
    session.addEventListener('end', () => this.onEnd(), { once: true });
    this.onStart(session);
  }
  exit() { try { this.session?.end(); } catch { /* ok */ } }
  onStart(session) {
    const g = this.game, p = g.player;
    g.vrActive = true;
    g.camera.position.set(0, 0, 0); g.camera.rotation.set(0, 0, 0);
    if (!session.enabledFeatures?.includes('local-floor')) p.rig.position.y = 1.5; // fallback senza pavimento
    p.rig.rotation.y = p.yaw;
    // riduzione effetti in VR
    g.world.setRain(false); g.audio?.setRain?.(false);
    p.torchLight.castShadow = false; this.renderer.shadowMap.enabled = false;
    this.attachTorch();
    g.camera.fov = 75; this.renderer.setPixelRatio(1);
    g.hud.vr = this.panel; this.panel.dirty(); g.missions.refresh(); this.panel.setObjective(g.missions.objectiveText());
    g.hud.renderQuick();
  }
  onEnd() {
    const g = this.game, p = g.player;
    this.session = null; g.vrActive = false; g.hud.vr = null;
    for (const h of ['left', 'right']) this.release(h, true);
    this.panel.close(); this.setTeleportVisible(false); this.vig.visible = false;
    p.attachTorch(g.camera, false); p.rig.position.y = 0; p.rig.rotation.y = p.yaw;
    g.camera.position.set(0, 1.65, 0); g.camera.rotation.set(0, 0, 0);
    g.applySettings(); g.applyTorch();
    if (g.phase === 'playing') g.pause();
  }
  attachTorch() {
    const r = this.ctrlOf('right') || this.ctrls[0];
    if (r) { this.game.player.attachTorch(r, true); this.game.applyTorch(); }
  }
  ctrlOf(hand) { return this.hand[hand]; }

  // ---------- controller ----------
  setupControllers() {
    const rig = this.game.player.rig;
    for (let i = 0; i < 2; i++) {
      const c = this.renderer.xr.getController(i);
      c.userData = { input: null, hand: null, i };
      const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0x88aaff, transparent: true, opacity: 0.5 }));
      ray.scale.z = 2.5; c.add(ray); c.userData.ray = ray;
      c.addEventListener('connected', (e) => {
        c.userData.input = e.data; c.userData.hand = e.data.handedness;
        if (e.data.handedness === 'left' || e.data.handedness === 'right') this.hand[e.data.handedness] = c;
        if (e.data.handedness === 'right') this.attachTorch();
        if (e.data.handedness === 'left') this.panel.wrist.parent !== c && c.add(this.panel.wrist);
      });
      c.addEventListener('disconnected', () => { const h = c.userData.hand; if (h && this.hand[h] === c) this.hand[h] = null; c.userData.input = null; });
      rig.add(c); this.ctrls.push(c);
      const grip = this.renderer.xr.getControllerGrip(i);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.14), new THREE.MeshLambertMaterial({ color: 0x1a1c22 }));
      body.position.z = 0.04; grip.add(body); rig.add(grip);
    }
  }
  setupComfort() {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    const gr = g.createRadialGradient(128, 128, 60, 128, 128, 128); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.85)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    this.vig = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
    this.vig.position.z = -0.5; this.vig.renderOrder = 999; this.vig.visible = false;
    this.game.camera.add(this.vig);
  }
  setupTeleport() {
    this.arcPts = Array.from({ length: 40 }, () => new THREE.Vector3());
    this.arc = new THREE.Line(new THREE.BufferGeometry().setFromPoints(this.arcPts), new THREE.LineBasicMaterial({ color: 0x40ff80 }));
    this.arc.frustumCulled = false; this.arc.visible = false;
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.3, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x40ff80 }));
    this.marker.visible = false;
    this.game.scene.add(this.arc, this.marker);
  }
  setTeleportVisible(v) { this.arc.visible = v; this.marker.visible = v; }

  // ---------- input ----------
  pad(hand) { return this.hand[hand]?.userData.input?.gamepad || null; }
  stick(hand) {
    const p = this.pad(hand); if (!p) return { x: 0, y: 0 };
    const a = p.axes, x = a.length >= 4 ? a[2] : a[0] || 0, y = a.length >= 4 ? a[3] : a[1] || 0;
    return { x: Math.abs(x) < DZ ? 0 : x, y: Math.abs(y) < DZ ? 0 : y };
  }
  btn(hand, i) { return !!this.pad(hand)?.buttons[i]?.pressed; }
  edge(hand, i) {
    const k = `${hand}${i}`, d = this.btn(hand, i), r = d && !this.prev[k]; this.prev[k] = d; return r;
  }
  /** Chiamato dall'auto: stick sinistro = acceleratore e sterzo. */
  driveInput() { return this.game.vrActive ? this.driveIn : null; }

  rayOf(c, o, d) {
    c.getWorldPosition(o); c.getWorldQuaternion(this._q); d.set(0, 0, -1).applyQuaternion(this._q).normalize();
  }

  update(dt) {
    const g = this.game, p = g.player;
    if (!g.vrActive) return;
    this.panel.update(dt);
    const ls = this.stick('left'), rs = this.stick('right');
    // esci dalla VR: Y tenuto premuto
    if (this.btn('left', 5)) { this.exitHold += dt; if (this.exitHold > 1.5) { this.exit(); return; } } else this.exitHold = 0;
    // pannelli
    if (this.edge('right', 5)) {
      if (g.phase === 'dead' || g.phase === 'won') { /* il grilletto gestisce la fine */ } else if (this.panel.mode === 'doc') this.panel.close(); else this.panel.toggleInv();
    }
    if (this.edge('left', 4) || this.edge('right', 4)) g.toggleTorch();
    this.driveIn.thr = 0; this.driveIn.steer = 0;
    if (g.phase !== 'playing') { this.updateInteraction(dt); this.vigTarget = 0; this.updateVig(dt); return; }

    p.yaw = p.rig.rotation.y;
    // altezza testa: accovacciarsi reale
    const hy = g.camera.position.y; p.crouching = hy > 0.2 && hy < 1.15;

    if (g.car.driving) {
      this.driveIn.thr = -ls.y; this.driveIn.steer = ls.x;
      p.rig.rotation.y = g.car.yaw; p.moving = false;
      this.vigTarget = Math.min(1, Math.abs(ls.x) * Math.abs(g.car.speed) / 10);
    } else if (!p.hiding) {
      this.locomotion(dt, ls, rs);
    } else this.vigTarget = 0;
    this.updateInteraction(dt);
    this.updateVig(dt);
  }

  locomotion(dt, ls, rs) {
    const g = this.game, p = g.player, cam = g.camera;
    let moved = 0, turned = 0;
    // rotazione
    if (settings.vrTurn === 'snap') {
      this.snapCd -= dt;
      if (Math.abs(rs.x) > 0.7 && this.snapCd <= 0) { const a = THREE.MathUtils.degToRad(settings.vrSnap) * -Math.sign(rs.x); p.rotateAroundHead(a); this.snapCd = 0.3; this.vigPulse = 0.12; }
    } else if (Math.abs(rs.x) > 0) { const a = -rs.x * THREE.MathUtils.degToRad(100) * dt; p.rotateAroundHead(a); turned = Math.abs(rs.x); }
    // movimento
    if (settings.vrLoco === 'teleport') this.teleportInput(ls);
    else {
      this.setTeleportVisible(false);
      const mag = Math.min(1, Math.hypot(ls.x, ls.y));
      if (mag > 0) {
        cam.getWorldDirection(this._d); this._d.y = 0; this._d.normalize();
        const fx = this._d.x, fz = this._d.z, rx = -fz, rz = fx;
        const run = this.btn('left', 3) && !g.state.inventory.heavy() && !p.exhausted && p.stamina > 0;
        const sp = (run ? 4.8 : p.crouching ? 1.4 : 2.8) * mag;
        const f = -ls.y, s = ls.x, len = Math.hypot(f, s) || 1;
        p.moveBy(((fx * f + rx * s) / len) * sp * dt, ((fz * f + rz * s) / len) * sp * dt);
        p.running = run; p.speed = sp; p.moving = sp > 0.3; moved = mag;
        if (run) { p.stamina -= 20 * dt; p.staminaDelay = 0.6; if (p.stamina <= 0) { p.stamina = 0; p.exhausted = true; g.msg('Sei senza fiato!'); } }
        p.stepAcc += sp * dt;
        const stride = run ? 2.2 : p.crouching ? 1.3 : 1.75;
        if (p.stepAcc > stride) {
          p.stepAcc = 0; const b = p.getBodyPos(this._v);
          g.audio?.footstep?.(null, run ? 1 : p.crouching ? 0.25 : 0.6, g.world.surfaceAt(b.x, b.z));
          g.emitNoise(b.x, b.z, run ? 14 : p.crouching ? 2 : 6.5);
        }
      } else { p.moving = false; p.running = false; p.speed = 0; }
    }
    if (!p.running) { p.staminaDelay -= dt; if (p.staminaDelay <= 0) p.stamina = Math.min(100, p.stamina + 13 * dt); if (p.exhausted && p.stamina > 25) p.exhausted = false; }
    this.vigTarget = Math.max(moved * 0.8, turned * 0.6, this.vigPulse > 0 ? 1 : 0);
    if (this.vigPulse > 0) this.vigPulse -= dt;
  }

  teleportInput(ls) {
    const g = this.game, c = this.ctrlOf('left') || this.ctrls[0], tp = this.tp;
    if (ls.y < -0.6) {
      tp.aiming = true;
      this.rayOf(c, this._o, this._d);
      const v = this._d.clone().multiplyScalar(7), pos = this._o.clone(); let landed = false, n = 0;
      for (let i = 0; i < 40; i++) {
        this.arcPts[i].copy(pos); n = i;
        v.y -= 9.8 * 0.035; pos.addScaledVector(v, 0.035);
        if (pos.y <= 0) { pos.y = 0.02; this.arcPts[i + 1 < 40 ? i + 1 : i].copy(pos); landed = true; n = i + 1; break; }
      }
      for (let i = n + 1; i < 40; i++) this.arcPts[i].copy(this.arcPts[n]);
      this.arc.geometry.setFromPoints(this.arcPts);
      const b = g.player.getBodyPos(this._v);
      const d = Math.hypot(pos.x - b.x, pos.z - b.z);
      tp.valid = landed && d < 10 && !g.collision.circleBlocked(pos.x, pos.z, 0.4) && g.collision.lineOfSight(b.x, b.z, pos.x, pos.z) && !g.player.hiding;
      tp.point.copy(pos);
      this.arc.material.color.set(tp.valid ? 0x40ff80 : 0xff4040); this.marker.material.color.set(tp.valid ? 0x40ff80 : 0xff4040);
      this.marker.position.copy(pos); this.setTeleportVisible(true);
    } else if (tp.aiming) {
      tp.aiming = false; this.setTeleportVisible(false);
      if (tp.valid) { g.player.placeBody(tp.point.x, tp.point.z); this.vigPulse = 0.18; g.emitNoise(tp.point.x, tp.point.z, 5); g.audio?.footstep?.(null, 0.5, g.world.surfaceAt(tp.point.x, tp.point.z)); }
    }
  }

  updateVig(dt) {
    const on = settings.vrVig; const target = on ? this.vigTarget * settings.vrVigStr : 0;
    this.vigAmt += (target - this.vigAmt) * Math.min(1, dt * 8);
    this.vig.visible = this.vigAmt > 0.01;
    this.vig.material.opacity = Math.min(1, this.vigAmt * 1.4);
    this.vig.scale.setScalar(2.4 - this.vigAmt * 1.5);
  }

  // ---------- interazione ----------
  updateInteraction(dt) {
    const g = this.game, ia = g.interaction;
    let promptPoint = null, promptText = null;
    for (const hand of ['right', 'left']) {
      const c = this.hand[hand]; if (!c) continue;
      const ray = c.userData.ray;
      this.rayOf(c, this._o, this._d);
      const o = this._o.clone(), d = this._d.clone();
      // pannello grande
      let hitPanel = null;
      if (this.panel.big.visible) {
        const rc = new THREE.Raycaster(o, d, 0, 4); const h = rc.intersectObject(this.panel.big)[0];
        if (h) hitPanel = h;
      }
      let hit = null;
      if (!hitPanel && g.phase === 'playing' && !g.player.hiding && !g.car.driving) hit = ia.pick(o, d, 3.2);
      ray.scale.z = hitPanel ? hitPanel.distance : hit ? hit.dist : 2.5;
      ray.material.color.set(hit || hitPanel ? 0xffa040 : 0x88aaff);
      if (hit && !promptText) { promptText = hit.it.prompt?.(); promptPoint = hit.point; }
      if (this.edge(hand, 0)) { // grilletto
        if (g.phase === 'dead' || g.phase === 'won') g.retry();
        else if (hitPanel) this.panel.clickUV(hitPanel.uv.x, hitPanel.uv.y);
        else if (this.panel.mode === 'doc') this.panel.close();
        else if (g.player.hiding) g.player.exitHide();
        else if (hit) hit.it.use?.();
      }
      // grip: afferra oggetti
      if (this.edge(hand, 1)) this.grab(hand, c);
      if (!this.btn(hand, 1) && this.held[hand]) this.release(hand);
    }
    g.hud.setPrompt(promptText ? `[E] ${promptText}` : null);
    this.panel.showPromptAt(promptPoint);
    // oggetti in mano: mostra il documento afferrato
  }

  grab(hand, c) {
    const g = this.game; if (this.held[hand] || g.phase !== 'playing') return;
    c.getWorldPosition(this._o);
    let best = null, bd = 0.32;
    for (const it of Object.values(g.world.pickups)) {
      if (!it.root.visible) continue;
      it.root.getWorldPosition(this._v); const d = this._v.distanceTo(this._o);
      if (d < bd) { bd = d; best = it; }
    }
    if (!best) { // raggio corto, per comodità
      this.rayOf(c, this._o, this._d); const h = g.interaction.pick(this._o, this._d, 1.1);
      if (h && h.it.kind === 'pickup') best = h.it;
    }
    if (!best) return;
    best.home = { parent: best.root.parent, pos: best.root.position.clone(), rot: best.root.rotation.clone() };
    c.attach(best.root); best.root.position.set(0, 0, -0.1); best.root.rotation.set(0, 0, 0);
    this.held[hand] = best;
    g.audio?.click?.();
    if (best.doc && DOCS[best.doc]) this.panel.showDoc(DOCS[best.doc].title, DOCS[best.doc].text);
  }
  release(hand, silent = false) {
    const it = this.held[hand]; if (!it) return;
    const g = this.game, c = this.hand[hand]; this.held[hand] = null;
    const handPos = it.root.getWorldPosition(new THREE.Vector3()), head = g.camera.getWorldPosition(new THREE.Vector3());
    const chest = new THREE.Vector3(head.x, head.y - 0.35, head.z);
    it.home.parent.attach(it.root);
    if (!silent && handPos.distanceTo(chest) < 0.4) { g.collectPickup(it); }
    else { it.root.position.copy(it.home.pos); it.root.rotation.copy(it.home.rot); if (!silent) g.msg('Avvicina l\'oggetto al petto per metterlo nell\'inventario.'); }
    if (it.doc) this.panel.hideDoc();
    void c;
  }
}
