import * as THREE from 'three';
import { settings } from '../config/Settings.js';

const EYE = 1.65, EYE_CROUCH = 1.05, EYE_HIDE = 1.15, RADIUS = 0.35;
const WALK = 2.8, RUN = 5.2, CROUCH = 1.5;

// Controller in prima persona (PC) e corpo del giocatore condiviso con la VR.
// Il "rig" è il corpo: in PC la camera è figlia del rig; in VR il visore sposta la camera dentro il rig
// e il rig viene spostato (locomozione) senza contrastare i movimenti reali della testa.
export class PlayerController {
  constructor(game) {
    this.game = game;
    this.camera = game.camera;
    this.rig = new THREE.Group();
    this.rig.name = 'playerRig';
    this.rig.add(this.camera);
    game.scene.add(this.rig);

    this.yaw = 0; this.pitch = 0; this.carLook = 0;
    this.vel = new THREE.Vector2();
    this.vy = 0;
    this.keys = {};
    this.stamina = 100; this.exhausted = false; this.staminaDelay = 0;
    this.crouchT = 0; this.bob = 0; this.stepAcc = 0;
    this.hiding = null;
    this.running = false; this.crouching = false; this.moving = false; this.speed = 0;
    this.pointerLocked = false;
    this._v = new THREE.Vector3(); this._d = new THREE.Vector3();
    this.padPrev = {}; this.touch = null;

    // Torcia: SpotLight collegato alla camera (PC) o al controller destro (VR)
    this.torchPower = 170;
    this.torchLight = new THREE.SpotLight(0xffe6b8, 0, 34, 0.46, 0.55, 2);
    this.torchTarget = new THREE.Object3D();
    this.torchTarget.position.set(0, 0, -6);
    this.torchLight.target = this.torchTarget;
    this.torchModel = this.makeTorchModel();
    this.attachTorch(this.camera, false);
    this.bindInput();
  }

  makeTorchModel() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.24, 10), new THREE.MeshLambertMaterial({ color: 0x25272c }));
    body.rotation.x = Math.PI / 2;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.034, 0.07, 10), new THREE.MeshLambertMaterial({ color: 0x555a60, emissive: 0x806020, emissiveIntensity: 0.3 }));
    head.rotation.x = Math.PI / 2; head.position.z = -0.14;
    g.add(body, head);
    return g;
  }
  /** Collega torcia e modello a un genitore (camera in PC, controller in VR). */
  attachTorch(parent, vr) {
    this.torchLight.removeFromParent(); this.torchTarget.removeFromParent(); this.torchModel.removeFromParent();
    parent.add(this.torchLight, this.torchTarget, this.torchModel);
    if (vr) {
      this.torchLight.position.set(0, 0, -0.12); this.torchTarget.position.set(0, 0, -6);
      this.torchModel.position.set(0, 0, 0.02); this.torchModel.rotation.set(0, 0, 0);
    } else {
      this.torchLight.position.set(0.18, -0.14, -0.15); this.torchTarget.position.set(0.18, -0.1, -6);
      this.torchModel.position.set(0.22, -0.2, -0.38); this.torchModel.rotation.set(0.05, -0.08, 0);
    }
    this.torchModel.visible = this.game.state.torch.have;
  }
  setTorchVisible(on) { this.torchLight.intensity = on && !this.hiding ? this.torchPower : 0; }

  // ---------- input ----------
  bindInput() {
    const canvas = this.game.canvas;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) { if (e.code === 'Tab') e.preventDefault(); return; }
      this.keys[e.code] = true;
      if (e.code === 'Tab') e.preventDefault();
      this.game.onKey(e);
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; });
    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked || this.game.phase !== 'playing' || this.game.vrActive) return;
      const s = 0.0022 * settings.sensitivity;
      if (this.game.car.driving) this.carLook = Math.max(-1.4, Math.min(1.4, this.carLook - e.movementX * s));
      else this.yaw -= e.movementX * s;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - e.movementY * s));
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
      if (!this.pointerLocked) this.game.onPointerUnlocked();
    });
    canvas.addEventListener('click', () => {
      if (this.game.phase === 'playing' && !this.game.vrActive && !this.pointerLocked && !this.game.panelOpen) this.lockPointer();
    });
  }
  lockPointer() {
    try { const p = this.game.canvas.requestPointerLock(); p?.catch?.(() => {}); } catch { /* ignora */ }
  }
  unlockPointer() { if (document.pointerLockElement) document.exitPointerLock(); }

  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads && [...pads].find((x) => x && x.connected);
    if (!p) return null;
    const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
    const edge = (i) => { const d = !!p.buttons[i]?.pressed; const r = d && !this.padPrev[i]; this.padPrev[i] = d; return r; };
    if (edge(0)) this.game.interaction.useCurrent();
    if (edge(2)) this.game.toggleTorch();
    if (edge(9)) this.game.togglePause();
    return { mx: dz(p.axes[0]), mz: dz(p.axes[1]), lx: dz(p.axes[2] || 0), ly: dz(p.axes[3] || 0), run: !!p.buttons[10]?.pressed, crouch: !!p.buttons[1]?.pressed };
  }

  // ---------- posizione ----------
  getBodyPos(out = new THREE.Vector3()) {
    if (this.game.vrActive) { this.camera.getWorldPosition(out); out.y = this.rig.position.y; return out; }
    return out.copy(this.rig.position);
  }
  getEyePos(out = new THREE.Vector3()) { return this.camera.getWorldPosition(out); }
  /** Porta il corpo (la testa in VR) sulla posizione x,z. */
  placeBody(x, z) {
    if (this.game.vrActive) { const b = this.getBodyPos(new THREE.Vector3()); this.rig.position.x += x - b.x; this.rig.position.z += z - b.z; }
    else { this.rig.position.x = x; this.rig.position.z = z; }
  }
  teleportTo(x, z, yaw = this.yaw) {
    this.yaw = yaw; this.pitch = 0;
    if (!this.game.vrActive) this.rig.rotation.y = yaw;
    this.placeBody(x, z);
    this.vel.set(0, 0); this.hiding = null;
  }
  /** Sposta il corpo con collisioni. In VR corregge il rig in modo che la testa non attraversi i muri. */
  moveBy(dx, dz) {
    const bp = this.getBodyPos(this._v);
    const p = { x: bp.x + dx, z: bp.z + dz };
    const hit = this.game.collision.resolveCircle(p, RADIUS);
    this.rig.position.x += p.x - bp.x; this.rig.position.z += p.z - bp.z;
    return hit;
  }
  rotateAroundHead(angle) { // rotazione del corpo mantenendo ferma la posizione della testa (VR)
    const a = this.getBodyPos(new THREE.Vector3());
    this.rig.rotation.y += angle; this.rig.updateMatrixWorld(true);
    const b = this.getBodyPos(new THREE.Vector3());
    this.rig.position.x += a.x - b.x; this.rig.position.z += a.z - b.z;
  }

  // ---------- nascondigli ----------
  enterHide(spot) {
    if (this.hiding || this.game.car.driving) return;
    this.hiding = spot;
    this.placeBody(spot.pos.x, spot.pos.z);
    this.vel.set(0, 0);
    this.yaw = Math.atan2(-(spot.exit.x - spot.pos.x), -(spot.exit.z - spot.pos.z));
    this.torchLight.intensity = 0;
    if (this.game.state.flag('killer_intro')) this.game.state.setFlag('hid_once');
    this.game.audio?.door?.(spot.pos, false);
    this.game.killer.onPlayerHid(spot);
    this.game.msg('Resti immobile. Trattieni il respiro…');
  }
  exitHide() {
    if (!this.hiding) return;
    const s = this.hiding; this.hiding = null;
    this.placeBody(s.exit.x, s.exit.z);
    this.game.audio?.door?.(s.pos, true);
    this.game.emitNoise(s.exit.x, s.exit.z, 4);
    this.game.applyTorch();
  }

  // ---------- aggiornamento ----------
  update(dt) {
    const g = this.game;
    if (g.vrActive) return;           // la VR muove il rig tramite VRController
    this.rig.rotation.y = this.yaw + (g.car.driving ? this.carLook : 0);
    this.camera.rotation.set(this.pitch, 0, 0, 'YXZ');
    if (g.car.driving) return;        // posizione gestita dall'auto

    if (this.hiding) {
      this.camera.position.set(0, EYE_HIDE, 0);
      this.moving = false; this.running = false; this.speed = 0;
      return;
    }
    const pad = this.pollGamepad();
    const k = this.keys;
    let fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    let str = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    if (pad) { fwd += -pad.mz; str += pad.mx; this.yaw -= pad.lx * 2.4 * dt * settings.sensitivity; this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - pad.ly * 2.0 * dt)); }
    if (this.touch) { fwd += -this.touch.y; str += this.touch.x; }
    const len = Math.hypot(fwd, str); if (len > 1) { fwd /= len; str /= len; }
    const wantCrouch = !!(k.ControlLeft || k.ControlRight || k.KeyC || pad?.crouch || this.touch?.crouch);
    const wantRun = !!(k.ShiftLeft || k.ShiftRight || pad?.run || this.touch?.run) && !g.state.inventory.heavy();
    this.crouching = wantCrouch;
    this.crouchT += ((wantCrouch ? 1 : 0) - this.crouchT) * Math.min(1, dt * 10);

    const moving = len > 0.05;
    this.running = moving && wantRun && !wantCrouch && !this.exhausted && this.stamina > 0 && fwd > 0;
    const target = wantCrouch ? CROUCH : this.running ? RUN : WALK;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const tx = (-sy * fwd + cy * str) * target, tz = (-cy * fwd - sy * str) * target;
    const rate = moving ? 11 : 14;           // accelerazione / decelerazione
    const kf = 1 - Math.exp(-rate * dt);
    this.vel.x += (tx - this.vel.x) * kf; this.vel.y += (tz - this.vel.y) * kf;
    this.speed = Math.hypot(this.vel.x, this.vel.y);
    this.moving = this.speed > 0.3;

    // resistenza
    if (this.running) { this.stamina -= 20 * dt; this.staminaDelay = 0.6; if (this.stamina <= 0) { this.stamina = 0; this.exhausted = true; g.msg('Sei senza fiato!'); } }
    else { this.staminaDelay -= dt; if (this.staminaDelay <= 0) this.stamina = Math.min(100, this.stamina + 13 * dt); if (this.exhausted && this.stamina > 25) this.exhausted = false; }

    this.moveBy(this.vel.x * dt, this.vel.y * dt);

    // gravità (il terreno è piatto, ma il sistema resta corretto se si aggiungono dislivelli)
    this.vy -= 20 * dt; this.rig.position.y += this.vy * dt;
    if (this.rig.position.y <= 0) { this.rig.position.y = 0; this.vy = 0; }

    // passi, rumore e head-bob
    this.stepAcc += this.speed * dt;
    const stride = this.running ? 2.2 : wantCrouch ? 1.3 : 1.75;
    if (this.stepAcc > stride && this.moving) {
      this.stepAcc = 0;
      const p = this.rig.position;
      g.audio?.footstep?.(null, this.running ? 1 : wantCrouch ? 0.25 : 0.6, g.world.surfaceAt(p.x, p.z));
      g.emitNoise(p.x, p.z, this.running ? 14 : wantCrouch ? 2 : 6.5);
    }
    this.bob += this.speed * dt * (this.running ? 2.0 : 2.6);
    const bobAmt = this.moving ? Math.min(1, this.speed / RUN) * 0.045 : 0;
    this.camera.position.set(Math.cos(this.bob * 0.5) * bobAmt * 0.5, EYE - this.crouchT * (EYE - EYE_CROUCH) + Math.sin(this.bob) * bobAmt, 0);

    const fov = settings.fov + (this.running ? 6 : 0);
    if (Math.abs(this.camera.fov - fov) > 0.05) { this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 6); this.camera.updateProjectionMatrix(); }
  }
}
