import { settings } from '../config/Settings.js';

// Audio interamente procedurale (Web Audio API): nessun file esterno.
// Suoni posizionali con PannerNode HRTF; musica dinamica a strati legata al livello di minaccia.
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.threat = 0; this._threat = 0; this.hbAcc = 0; this.engine = null;
    this.rainOn = false;
  }

  init() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { console.warn('[Audio] Web Audio API non disponibile'); return; }
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.sfx = c.createGain(); this.music = c.createGain();
    const comp = c.createDynamicsCompressor();
    this.sfx.connect(this.master); this.music.connect(this.master); this.master.connect(comp); comp.connect(c.destination);
    this.setVolumes();
    // buffer di rumore bianco riutilizzabile
    const len = c.sampleRate * 2; this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.buildAmbience(); this.buildMusic();
    this.resume();
  }
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
  setVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(settings.master, t, 0.05);
    this.sfx.gain.setTargetAtTime(settings.sfx, t, 0.05);
    this.music.gain.setTargetAtTime(settings.music, t, 0.05);
  }

  // ---------- listener ----------
  update(camera, dt) {
    if (!this.ctx) return;
    camera.updateMatrixWorld();
    const e = camera.matrixWorld.elements, L = this.ctx.listener, t = this.ctx.currentTime;
    const px = e[12], py = e[13], pz = e[14];
    const fx = -e[8], fy = -e[9], fz = -e[10], ux = e[4], uy = e[5], uz = e[6];
    if (L.positionX) {
      L.positionX.setValueAtTime(px, t); L.positionY.setValueAtTime(py, t); L.positionZ.setValueAtTime(pz, t);
      L.forwardX.setValueAtTime(fx, t); L.forwardY.setValueAtTime(fy, t); L.forwardZ.setValueAtTime(fz, t);
      L.upX.setValueAtTime(ux, t); L.upY.setValueAtTime(uy, t); L.upZ.setValueAtTime(uz, t);
    } else { L.setPosition(px, py, pz); L.setOrientation(fx, fy, fz, ux, uy, uz); }
    this.updateMusic(dt);
  }

  // ---------- primitive ----------
  _dest(pos) {
    if (!pos) return { node: this.sfx, done() {} };
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 2.5; p.rolloffFactor = 1.5; p.maxDistance = 90;
    p.positionX.value = pos.x; p.positionY.value = pos.y ?? 1.2; p.positionZ.value = pos.z;
    p.connect(this.sfx);
    return { node: p, done: () => { try { p.disconnect(); } catch { /* ok */ } } };
  }
  _env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  tone({ type = 'sine', f = 440, f2 = null, dur = 0.3, vol = 0.3, a = 0.005, pos = null, delay = 0, lp = 0 }) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain(), d = this._dest(pos);
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + dur);
    this._env(g, t, a, vol, dur);
    let n = o;
    if (lp) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); n = fl; }
    n.connect(g); g.connect(d.node); o.start(t); o.stop(t + dur + 0.05); o.onended = d.done;
  }
  noise({ dur = 0.2, vol = 0.3, type = 'bandpass', f = 1000, f2 = null, q = 1, a = 0.005, pos = null, delay = 0 }) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(), d = this._dest(pos);
    s.buffer = this.noiseBuf; s.loop = true;
    fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    this._env(g, t, a, vol, dur);
    s.connect(fl); fl.connect(g); g.connect(d.node); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05); s.onended = d.done;
  }

  // ---------- effetti ----------
  footstep(pos, vol = 0.6, surface = 'asphalt', heavy = false) {
    if (!this.ctx) return;
    const v = vol * (0.8 + Math.random() * 0.4);
    if (surface === 'wood') { this.noise({ dur: 0.09, vol: v * 0.7, f: 650 + Math.random() * 150, q: 1.4, pos }); this.tone({ f: 95, f2: 55, dur: 0.1, vol: v * 0.5, pos }); }
    else if (surface === 'grass') this.noise({ dur: 0.13, vol: v * 0.45, type: 'highpass', f: 1500, a: 0.02, pos });
    else this.noise({ dur: 0.06, vol: v * 0.6, f: 1900 + Math.random() * 400, q: 0.9, pos });
    if (heavy) this.tone({ f: 70, f2: 40, dur: 0.14, vol: v * 0.8, pos });
  }
  door(pos, opening) {
    if (!this.ctx) return;
    if (opening) { this.tone({ type: 'sawtooth', f: 160 + Math.random() * 40, f2: 95, dur: 0.7, vol: 0.12, pos, lp: 700, a: 0.08 }); this.noise({ dur: 0.5, vol: 0.12, f: 500, f2: 900, q: 4, pos }); }
    else { this.noise({ dur: 0.14, vol: 0.5, type: 'lowpass', f: 300, pos }); this.tone({ f: 110, f2: 50, dur: 0.18, vol: 0.45, pos }); }
  }
  slam(pos) { this.noise({ dur: 0.35, vol: 0.9, type: 'lowpass', f: 600, f2: 90, pos }); this.tone({ f: 90, f2: 35, dur: 0.4, vol: 0.9, pos }); }
  knock(pos) { for (let i = 0; i < 3; i++) { this.tone({ f: 180, f2: 90, dur: 0.1, vol: 0.7, pos, delay: i * 0.38 }); this.noise({ dur: 0.05, vol: 0.4, f: 900, pos, delay: i * 0.38 }); } }
  drawer(pos) { this.noise({ dur: 0.35, vol: 0.28, f: 400, f2: 1000, q: 2, pos, a: 0.05 }); this.tone({ f: 140, f2: 80, dur: 0.1, vol: 0.4, pos, delay: 0.3 }); }
  pickup() { this.tone({ f: 660, dur: 0.12, vol: 0.18 }); this.tone({ f: 990, dur: 0.18, vol: 0.18, delay: 0.09 }); }
  ui(kind) {
    if (kind === 'mission') [392, 494, 587, 784].forEach((f, i) => this.tone({ f, dur: 0.5, vol: 0.14, delay: i * 0.12, type: 'triangle' }));
    else this.tone({ f: 500, dur: 0.05, vol: 0.12, type: 'square', lp: 2000 });
  }
  click() { this.tone({ f: 1400, dur: 0.025, vol: 0.2, type: 'square', lp: 3000 }); }
  metal(pos) { [520, 810, 1330].forEach((f) => this.tone({ f, dur: 0.9, vol: 0.12, pos, type: 'triangle' })); this.noise({ dur: 0.05, vol: 0.4, f: 3000, pos }); }
  zap(pos) { this.tone({ type: 'square', f: 90, f2: 60, dur: 0.6, vol: 0.2, pos, lp: 1200 }); this.noise({ dur: 0.6, vol: 0.4, type: 'highpass', f: 2500, a: 0.01, pos }); }
  pour(pos) { this.noise({ dur: 1.5, vol: 0.28, f: 900, q: 3, pos, a: 0.2 }); this.noise({ dur: 1.5, vol: 0.15, f: 400, q: 6, pos, a: 0.3 }); }
  locked(pos) { this.tone({ type: 'square', f: 220, dur: 0.04, vol: 0.2, pos, lp: 1500 }); this.tone({ type: 'square', f: 180, dur: 0.05, vol: 0.2, pos, delay: 0.08, lp: 1500 }); }
  gateMotor(pos) { this.tone({ type: 'sawtooth', f: 50, f2: 80, dur: 4, vol: 0.35, pos, lp: 300, a: 0.5 }); this.noise({ dur: 4, vol: 0.2, f: 200, q: 2, pos }); }
  crash(pos) { this.noise({ dur: 0.7, vol: 1.0, type: 'lowpass', f: 1200, f2: 80, pos }); this.tone({ f: 80, f2: 30, dur: 0.6, vol: 0.9, pos }); }
  thunder() { this.noise({ dur: 4, vol: 0.9, type: 'lowpass', f: 500, f2: 50, a: 0.4 }); this.tone({ f: 55, f2: 30, dur: 3.5, vol: 0.6, a: 0.5 }); }
  whisper(pos) { this.noise({ dur: 1.8, vol: 0.18, f: 2200, q: 8, pos, a: 0.5 }); this.noise({ dur: 1.4, vol: 0.12, f: 1500, f2: 2600, q: 10, pos, a: 0.4, delay: 0.3 }); }
  growl(pos) { this.tone({ type: 'sawtooth', f: 70, f2: 50, dur: 1.3, vol: 0.3, pos, lp: 400, a: 0.2 }); this.noise({ dur: 1.3, vol: 0.15, f: 300, q: 4, pos }); }
  sting() { this.tone({ type: 'sawtooth', f: 900, f2: 120, dur: 1.2, vol: 0.4, lp: 3000 }); this.noise({ dur: 1.0, vol: 0.5, f: 2000, f2: 200 }); this.tone({ f: 60, f2: 30, dur: 1.4, vol: 0.8 }); }
  engineStart() {
    if (!this.ctx) return;
    this.noise({ dur: 1.0, vol: 0.3, type: 'lowpass', f: 400, q: 1, a: 0.1 });
    for (let i = 0; i < 4; i++) this.tone({ type: 'sawtooth', f: 50, f2: 70, dur: 0.22, vol: 0.3, delay: i * 0.25, lp: 300 });
    if (this.engine) return;
    const c = this.ctx, o1 = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o1.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 500; g.gain.value = 0;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.sfx); o1.start(); o2.start();
    g.gain.setTargetAtTime(0.28, c.currentTime + 1, 0.3);
    this.engine = { o1, o2, f, g };
  }
  setEngine(speed01, throttle) {
    if (!this.engine) return;
    const t = this.ctx.currentTime, base = 36 + speed01 * 95 + (throttle ? 10 : 0);
    this.engine.o1.frequency.setTargetAtTime(base, t, 0.1); this.engine.o2.frequency.setTargetAtTime(base * 0.5, t, 0.1);
    this.engine.f.frequency.setTargetAtTime(400 + speed01 * 900, t, 0.1);
  }
  stopEngine() {
    if (!this.engine) return;
    const e = this.engine; this.engine = null;
    e.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    setTimeout(() => { try { e.o1.stop(); e.o2.stop(); } catch { /* ok */ } }, 800);
  }

  // ---------- ambiente e musica ----------
  loopNoise(type, f, q, gain) {
    const c = this.ctx, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; s.loop = true; fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.value = gain;
    s.connect(fl); fl.connect(g); g.connect(this.sfx); s.start();
    return { fl, g };
  }
  buildAmbience() {
    const c = this.ctx;
    this.wind = this.loopNoise('bandpass', 420, 0.7, 0.1);
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.11; lg.gain.value = 0.06;
    lfo.connect(lg); lg.connect(this.wind.g.gain); lfo.start();
    const lfo2 = c.createOscillator(), lg2 = c.createGain(); lfo2.frequency.value = 0.07; lg2.gain.value = 180;
    lfo2.connect(lg2); lg2.connect(this.wind.fl.frequency); lfo2.start();
    this.rain = this.loopNoise('highpass', 2500, 0.5, 0);
  }
  setRain(on) { this.rainOn = on; if (this.rain) this.rain.g.gain.setTargetAtTime(on ? 0.07 : 0, this.ctx.currentTime, 0.5); }
  buildMusic() {
    const c = this.ctx;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
    this.pad = c.createGain(); this.pad.gain.value = 0.16; lp.connect(this.pad); this.pad.connect(this.music);
    for (const [f, d] of [[55, 0], [55, 6], [82.4, -5], [110, 3]]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; o.connect(lp); o.start();
    }
    this.tens = c.createGain(); this.tens.gain.value = 0; this.tens.connect(this.music);
    const trem = c.createGain(); trem.gain.value = 0.5; trem.connect(this.tens);
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 5.5; lg.gain.value = 0.5; lfo.connect(lg); lg.connect(trem.gain); lfo.start();
    for (const f of [233, 329.6, 466]) { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(trem); o.start(); }
    this.riser = this.loopNoise('bandpass', 800, 2, 0);
    this.riser.g.disconnect(); this.riser.g.connect(this.music);
  }
  setThreat(v) { this.threat = Math.max(0, Math.min(1, v)); }
  updateMusic(dt) {
    this._threat += (this.threat - this._threat) * Math.min(1, dt * (this.threat > this._threat ? 1.5 : 0.4));
    const t = this._threat, now = this.ctx.currentTime;
    this.tens.gain.setTargetAtTime(Math.pow(t, 1.6) * 0.22, now, 0.2);
    this.pad.gain.setTargetAtTime(0.14 + t * 0.1, now, 0.3);
    this.riser.g.gain.setTargetAtTime(Math.pow(t, 2.2) * 0.12, now, 0.3);
    this.riser.fl.frequency.setTargetAtTime(500 + t * 2500, now, 0.3);
    // battito cardiaco che accelera con la minaccia
    if (t > 0.25) {
      this.hbAcc += dt;
      const period = 60 / (62 + t * 90);
      if (this.hbAcc >= period) {
        this.hbAcc = 0;
        const v = 0.25 + t * 0.55;
        this.tone({ f: 62, f2: 40, dur: 0.14, vol: v }); this.tone({ f: 58, f2: 38, dur: 0.14, vol: v * 0.7, delay: 0.16 });
      }
    }
  }
}
