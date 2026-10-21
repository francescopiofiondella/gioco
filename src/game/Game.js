import * as THREE from 'three';
import { settings, QUALITY } from '../config/Settings.js';
import { BOUNDS, SPAWN } from '../world/WorldData.js';
import { CollisionSystem } from '../world/CollisionSystem.js';
import { WorldBuilder } from '../world/WorldBuilder.js';
import { NavigationSystem } from '../ai/NavigationSystem.js';
import { KillerAI } from '../ai/KillerAI.js';
import { PlayerController } from '../player/PlayerController.js';
import { VRController } from '../player/VRController.js';
import { InteractionSystem } from '../interaction/InteractionSystem.js';
import { CarEscapeSystem } from '../vehicle/CarEscapeSystem.js';
import { ITEMS } from '../inventory/Inventory.js';
import { MissionManager, MISSIONS } from '../missions/MissionManager.js';
import { AudioManager } from '../audio/AudioManager.js';
import { HUD } from '../ui/HUD.js';
import { MainMenu } from '../ui/MainMenu.js';
import { TouchControls, isTouchDevice } from '../ui/TouchControls.js';
import { SaveManager } from '../save/SaveManager.js';
import { GameState } from './GameState.js';
import { EventDirector } from './EventDirector.js';

const $ = (id) => document.getElementById(id);
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Coordinatore: possiede il renderer Three.js, il ciclo di gioco e tutti i sistemi.
export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.phase = 'loading'; this.mode = 'pc'; this.vrActive = false; this.panelOpen = false;
    this.time = 0; this.introT = 0; this._intentional = false; this.pausedAt = 0; this.capture = null;

    const q = QUALITY[settings.quality];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: q.antialias, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.xr.enabled = true;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070c);
    this.scene.fog = new THREE.FogExp2(0x070a12, 0.034);
    this.camera = new THREE.PerspectiveCamera(settings.fov, innerWidth / innerHeight, 0.05, 170);
    this.hemiBase = 0.9;
    this.hemi = new THREE.HemisphereLight(0x3a4a70, 0x120e0a, this.hemiBase);
    const moon = new THREE.DirectionalLight(0x6a7aa8, 0.35); moon.position.set(-30, 60, 20);
    this.scene.add(this.hemi, moon);

    this.collision = new CollisionSystem();
    this.state = new GameState(this);
    this.audio = new AudioManager();
    this.world = new WorldBuilder(this);
    this.nav = new NavigationSystem(this.collision, BOUNDS);
    this.player = new PlayerController(this);
    this.car = new CarEscapeSystem(this);
    this.killer = new KillerAI(this);
    this.interaction = new InteractionSystem(this);
    this.hud = new HUD(this);
    this.missions = new MissionManager(this);
    this.events = new EventDirector(this);
    this.save = new SaveManager();
    this.vr = new VRController(this);
    this.menu = new MainMenu(this);
    this.touch = isTouchDevice() ? new TouchControls(this) : null;
    this.clock = new THREE.Clock();

    addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.phase === 'playing' && !this.vrActive) this.pause(); });
    this.applySettings();
  }

  // ---------- avvio ----------
  async init() {
    const bar = $('loading-bar'), txt = $('loading-text');
    try {
      await this.world.build((p, label) => { bar.style.width = `${Math.round(p * 100)}%`; txt.textContent = label; });
    } catch (e) { console.error(e); txt.textContent = `Errore nella costruzione del mondo: ${e.message}`; throw e; }
    this.nav.rebuild();
    const q = QUALITY[settings.quality];
    if (q.lamps < 6) this.world.lamps.forEach((l, i) => { if (i % 2) l.light.visible = false; });
    if (q.shadows) {
      this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      const tl = this.player.torchLight; tl.castShadow = true; tl.shadow.mapSize.set(1024, 1024); tl.shadow.camera.near = 0.3; tl.shadow.camera.far = 30; tl.shadow.bias = -0.0006;
      this.world.solids.forEach((m) => { m.castShadow = true; });
    }
    this.resetWorld('normal');
    this.phase = 'menu';
    this.renderer.setAnimationLoop(() => this.tick());
    this.menu.showMenu();
  }

  applySettings() {
    const q = QUALITY[settings.quality];
    this.renderer.toneMappingExposure = settings.brightness;
    if (!this.vrActive) { this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio)); this.renderer.setSize(innerWidth, innerHeight, false); }
    this.world.setRain(settings.rain && !this.vrActive);
    this.audio.setVolumes(); this.audio.setRain(settings.rain && !this.vrActive);
    this.hud?.applyScale();
  }
  onResize() {
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    if (!this.vrActive) this.renderer.setSize(innerWidth, innerHeight, false);
  }

  /** @param {{mode:string, difficulty?:string, load?:boolean}} o  Chiamato dentro un gestore di click. */
  async startGame(o) {
    this.audio.init();
    this.mode = o.mode;
    if (o.mode === 'pc' && !this.touch) this.player.lockPointer();
    if (this.touch) { try { document.documentElement.requestFullscreen?.()?.catch?.(() => {}); screen.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch { /* ok */ } }
    let data = null;
    if (o.load) data = this.save.load();
    this.resetWorld(data ? data.difficulty : o.difficulty || 'normal');
    if (data) this.applySave(data);
    if (o.mode === 'vr') {
      try { await this.vr.enter(); } catch (e) {
        console.warn('[VR] sessione non avviata:', e); this.mode = 'pc'; this.msg('Impossibile avviare la VR: modalità PC.'); if (!this.touch) this.player.lockPointer();
      }
    }
    this.phase = 'playing';
    this.hud.show(true);
    this.missions.check(true); this.missions.refresh();
    this.msg(this.state.flag('killer_intro') ? 'Partita caricata.' : 'Halloween, 23:40. Trova qualcosa per vederci nel buio.', 4000);
  }
  resetWorld(difficulty) {
    const st = this.state; st.reset(difficulty);
    this.capture = null; this.introT = 0; this.panelOpen = false; this.time = 0;
    this.player.stamina = 100; this.player.exhausted = false; this.player.hiding = null; this.player.pitch = 0;
    this.player.teleportTo(SPAWN.x, SPAWN.z, SPAWN.yaw);
    this.car.driving = false; this.car.speed = 0; this.car.sync();
    this.audio.stopEngine(); this.audio.setThreat(0);
    this.world.sync(); this.nav.rebuild();
    this.killer.reset(46, 0); this.events.reset();
    this.applyTorch(); this.hud.renderQuick(); this.hud.hideCar(); this.hud.hideEnd(); this.hud.closePanel();
    this.hud.mapOpen = false; this.hud.mapCanvas.style.display = 'none';
    this.missions.lastText = '';
    $('pause').classList.add('hidden');
  }
  applySave(d) {
    const st = this.state;
    st.reset(d.difficulty);
    st.flags = { ...d.flags }; st.missionIndex = d.missionIndex || 0;
    st.inventory.load(d.inventory, d.docs);
    st.torch = { have: false, battery: 100, spare: 0, ...d.torch, on: false };
    st.playTime = d.playTime || 0;
    this.world.sync(); this.car.sync();
    this.player.teleportTo(d.player.x, d.player.z, d.player.yaw || 0);
    // l'assassino riparte da una posizione sicura (mai addosso al giocatore appena caricato)
    let kx = d.killer?.x ?? 46, kz = d.killer?.z ?? 0;
    if (Math.hypot(kx - d.player.x, kz - d.player.z) < 25) {
      const far = this.world.waypoints.filter((w) => Math.hypot(w.x - d.player.x, w.z - d.player.z) > 35);
      if (far.length) { const w = far[(Math.random() * far.length) | 0]; kx = w.x; kz = w.z; }
    }
    this.killer.reset(kx, kz);
    this.applyTorch(); this.hud.renderQuick(); this.nav.rebuild();
  }

  // ---------- ciclo ----------
  tick() {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.vrActive) this.vr.update(dt);
    if (this.phase === 'playing' && !this.panelOpen) this.update(dt);
    else if (this.phase === 'capture') this.updateCapture(dt);
    this.touch?.update();
    this.audio.update(this.camera, dt);
    this.renderer.render(this.scene, this.camera);
  }
  update(dt) {
    const st = this.state;
    this.time += dt; st.playTime += dt;
    this.player.update(dt);
    this.interaction.update(dt);
    this.car.update(dt);
    if (this.phase !== 'playing') return;
    this.killer.update(dt);
    if (this.phase !== 'playing') return;
    const pp = this.player.getBodyPos();
    this.world.update(dt, pp);
    this.events.update(dt);
    this.updateTorch(dt);
    this.missions.update(dt);
    if (st.torch.have && !st.flag('killer_intro') && !this.player.hiding) { this.introT += dt; if (this.introT > 12) this.killer.startIntro(); }
    const th = this.killer.threat();
    this.audio.setThreat(th); this.hud.setFear(Math.max(0, th - 0.45));
    this.hud.update(dt);
  }
  updateTorch(dt) {
    const t = this.state.torch;
    if (t.on && t.have && !this.player.hiding) {
      t.battery -= 0.33 * dt;
      if (t.battery <= 0) {
        t.battery = 0;
        if (t.spare > 0) { t.spare--; t.battery = 100; this.msg('Hai cambiato la pila della torcia.'); this.hud.renderQuick(); }
        else { t.on = false; this.msg('La torcia si è spenta: batteria scarica.'); }
      }
    }
    this.applyTorch();
  }
  applyTorch() {
    const t = this.state.torch, p = this.player;
    const on = t.on && t.have && t.battery > 0 && !p.hiding && !this.car.driving;
    const k = on && t.battery < 15 ? (Math.random() < 0.1 ? 0.2 : 0.85) : 1;
    p.torchLight.intensity = on ? p.torchPower * k : 0;
    if (p.torchLight.shadow) p.torchLight.shadow.autoUpdate = on;
    p.torchModel.visible = t.have && !this.car.driving;
  }
  toggleTorch() {
    const t = this.state.torch;
    if (this.phase !== 'playing' || this.car.driving) return;
    if (!t.have) { this.msg('Non hai ancora una torcia.'); return; }
    if (t.battery <= 0) {
      if (t.spare > 0) { t.spare--; t.battery = 100; this.msg('Pila sostituita.'); this.hud.renderQuick(); } else { this.msg('La batteria è scarica.'); return; }
    }
    t.on = !t.on; this.audio.click(); this.applyTorch();
    if (t.on) this.emitNoise(this.player.getBodyPos().x, this.player.getBodyPos().z, 1.5);
  }

  // ---------- input ----------
  onKey(e) {
    const c = e.code;
    if (c === 'Escape') {
      if (this.phase === 'paused') { if (performance.now() - this.pausedAt > 300) this.resume(); }
      else if (this.phase === 'playing') { if (this.hud.docOpen()) this.closeDoc(); else if (this.panelOpen) this.closePanel(); else this.pause(); }
      return;
    }
    if (this.phase !== 'playing') return;
    if (c === 'Tab') { if (this.panelOpen) this.closePanel(); else this.openPanel(); return; }
    if (this.panelOpen) return;
    if (c === 'KeyE') this.interaction.useCurrent();
    else if (c === 'KeyF') this.toggleTorch();
    else if (c === 'KeyM') this.hud.toggleMap();
  }
  releasePointer() { if (document.pointerLockElement) { this._intentional = true; this.player.unlockPointer(); } }
  onPointerUnlocked() {
    if (this._intentional) { this._intentional = false; return; }
    if (this.phase === 'playing' && !this.panelOpen && !this.vrActive) this.pause();
  }
  togglePause() { if (this.phase === 'paused') this.resume(); else this.pause(); }
  pause() {
    if (this.phase !== 'playing') return;
    this.phase = 'paused'; this.pausedAt = performance.now();
    this.releasePointer(); this.audio.suspend();
    $('pause').classList.remove('hidden');
  }
  resume() {
    if (this.phase !== 'paused') return;
    $('pause').classList.add('hidden'); $('modal-settings').classList.add('hidden'); $('modal-controls').classList.add('hidden');
    this.phase = 'playing'; this.audio.resume(); this.clock.getDelta();
    if (!this.vrActive && !this.touch) this.player.lockPointer();
  }
  openPanel() { this.panelOpen = true; this.hud.openPanel(); this.releasePointer(); }
  closePanel() { this.panelOpen = false; this.hud.closePanel(); if (!this.vrActive && !this.touch && this.phase === 'playing') this.player.lockPointer(); }
  openDoc(id) { this.panelOpen = true; this.hud.showDoc(id); this.releasePointer(); }
  closeDoc() {
    const fromPanel = this.hud.docFromPanel;
    this.hud.closeDoc();
    if (!fromPanel) { this.panelOpen = false; if (!this.vrActive && !this.touch && this.phase === 'playing') this.player.lockPointer(); }
    else this.hud.docFromPanel = false;
  }

  // ---------- azioni di gioco ----------
  msg(t, ms = 3200) { this.hud?.toast(t, ms); }
  emitNoise(x, z, r) { this.killer?.hearNoise(x, z, r); }
  onFlagChanged(k) {
    this.world.onFlag();
    if (k === 'gate_open' || k.startsWith('unlocked_')) this.nav.rebuild();
    this.missions?.check();
  }
  collectPickup(it) {
    const st = this.state, inv = st.inventory;
    if (it.doc) {
      inv.addDoc(it.doc); st.setFlag(`picked_${it.id}`);
      this.audio.pickup(); this.msg('Documento aggiunto al diario.');
      if (this.vrActive) this.hud.showDoc(it.doc); else this.openDoc(it.doc);
      this.hud.renderQuick(); this.missions.check(); return true;
    }
    const def = ITEMS[it.item];
    if (it.item === 'torch_cell') st.torch.spare++;
    else if (def.twoHands && inv.heavy()) { this.msg('Hai già le mani occupate: usa prima ciò che stai portando.'); return false; }
    else if (!inv.add(it.item)) { this.msg('Inventario pieno.'); return false; }
    if (it.item === 'torch') { st.torch.have = true; this.applyTorch(); this.msg('Hai trovato una torcia. Premi F per accenderla.'); }
    else this.msg(`Raccolto: ${def.name}`);
    st.setFlag(`picked_${it.id}`);
    const p = it.root.getWorldPosition(new THREE.Vector3());
    this.audio.pickup(); this.emitNoise(p.x, p.z, 3);
    this.hud.renderQuick(); this.missions.check();
    return true;
  }
  saveGame(silent = false) {
    const ok = this.save.save(this);
    if (ok && silent) this.msg('Progresso salvato.', 1800);
    return ok;
  }

  // ---------- fine partita ----------
  caught() {
    if (this.phase !== 'playing') return;
    this.phase = 'capture'; this.capture = { t: 0 };
    const k = this.killer, p = this.player.getBodyPos();
    k.onCapture(); k.yaw = Math.atan2(-(p.x - k.pos.x), -(p.z - k.pos.z)); k.syncMesh();
    if (this.player.hiding) this.player.exitHide();
    if (this.car.driving) { this.car.speed = 0; this.audio.stopEngine(); }
    this.audio.sting(); this.audio.setThreat(1); this.hud.flash(0.6); this.hud.setPrompt(null);
    this.state.torch.on = this.state.torch.on && !this.car.driving;
  }
  updateCapture(dt) {
    const c = this.capture, k = this.killer, p = this.player; c.t += dt;
    if (!this.vrActive) {
      const pp = p.getBodyPos(), want = Math.atan2(-(k.pos.x - pp.x), -(k.pos.z - pp.z));
      let d = want - p.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      p.yaw += d * Math.min(1, dt * 7); p.carLook = 0; p.rig.rotation.y = p.yaw;
      p.pitch += (0.25 - p.pitch) * Math.min(1, dt * 4); p.camera.rotation.set(p.pitch, 0, 0, 'YXZ');
      p.camera.position.set((Math.random() - 0.5) * 0.04, 1.5 + (Math.random() - 0.5) * 0.04, 0);
    }
    k.update(dt); this.world.update(dt, p.getBodyPos()); this.hud.update(dt);
    if (c.t > 1.8) {
      this.phase = 'dead'; this.releasePointer(); this.audio.setThreat(0.4);
      this.hud.showEnd(false, `The Pumpkin Killer ti ha raggiunto.\nTempo di gioco: ${fmt(this.state.playTime)}.\nPuoi riprovare dall'ultimo salvataggio automatico.`);
    }
  }
  win() {
    if (this.phase !== 'playing') return;
    this.state.setFlag('escaped'); this.state.missionIndex = MISSIONS.length;
    this.phase = 'won'; this.audio.stopEngine(); this.audio.setThreat(0);
    this.save.clear(); this.releasePointer(); this.hud.hideCar();
    this.hud.showEnd(true, `Hai lasciato Hollow Creek alle spalle.\nTempo di gioco: ${fmt(this.state.playTime)}. Difficoltà: ${this.state.difficulty}.`);
  }
  retry() {
    this.hud.hideEnd();
    this.menu.start({ mode: this.mode, difficulty: this.state.difficulty, load: this.save.hasSave() });
  }
  quitToMenu() {
    this.phase = 'menu'; this.capture = null; this.panelOpen = false;
    $('pause').classList.add('hidden'); $('modal-settings').classList.add('hidden'); $('modal-controls').classList.add('hidden');
    this.hud.hideEnd(); this.hud.closePanel(); this.hud.hideCar(); this.hud.show(false);
    this.releasePointer(); this.audio.stopEngine(); this.audio.setThreat(0); this.audio.resume();
    if (this.vrActive) this.vr.exit();
    this.menu.showMenu();
  }
}
