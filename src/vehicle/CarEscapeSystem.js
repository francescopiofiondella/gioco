import * as THREE from 'three';
import { CAR_SPOT, GATE } from '../world/WorldData.js';

// L'auto del protagonista: riparazione interattiva (carburante, batteria, cavi), avvio e guida arcade
// in prima persona fino al cancello. La guida è un gioco reale, non un filmato.
export class CarEscapeSystem {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.pos = { x: CAR_SPOT.x, z: CAR_SPOT.z };
    this.yaw = CAR_SPOT.yaw;
    this.speed = 0;
    this.driving = false;
    this.seat = new THREE.Vector3(-0.45, 1.12, 0.25);
    this.build();
    game.scene.add(this.group);
    this.parkCol = game.collision.add(this.pos.x - 1.1, this.pos.z - 2.3, this.pos.x + 1.1, this.pos.z + 2.3, { noSight: true });
    this.addInteractables();
    this.sync();
  }

  build() {
    const L = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
    const add = (geo, mat, x, y, z, parent = this.group) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
    add(new THREE.BoxGeometry(1.9, 0.6, 4.2), L(0x7a1a1a), 0, 0.62, 0);
    add(new THREE.BoxGeometry(1.7, 0.55, 2.1), L(0x161c28), 0, 1.2, 0.35);
    add(new THREE.BoxGeometry(1.72, 0.08, 2.0), L(0x7a1a1a), 0, 1.51, 0.35);
    for (const sx of [-1, 1]) for (const sz of [-1.35, 1.35]) {
      const w = add(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 14), L(0x111111), sx * 0.95, 0.36, sz);
      w.rotation.z = Math.PI / 2;
    }
    const head = new THREE.MeshBasicMaterial({ color: 0xfff2c0 }), tail = new THREE.MeshBasicMaterial({ color: 0xb01010 });
    for (const sx of [-0.65, 0.65]) { add(new THREE.SphereGeometry(0.14, 8, 6), head, sx, 0.72, -2.1); add(new THREE.SphereGeometry(0.1, 8, 6), tail, sx, 0.72, 2.1); }
    // cofano incernierato
    this.hood = new THREE.Group(); this.hood.position.set(0, 0.95, -0.75);
    add(new THREE.BoxGeometry(1.8, 0.07, 1.4), L(0x7a1a1a), 0, 0, -0.7, this.hood);
    this.group.add(this.hood);
    // fari reali (attivi solo con il motore acceso)
    this.lights = [];
    for (const sx of [-0.65, 0.65]) {
      const s = new THREE.SpotLight(0xfff0d0, 0, 45, 0.5, 0.5, 2); s.userData.power = 400;
      s.position.set(sx, 0.75, -2.0); s.target.position.set(sx, 0.4, -20);
      this.group.add(s, s.target); this.lights.push(s);
    }
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.yaw;
  }

  addInteractables() {
    const g = this.game, st = g.state;
    const hit = (w, h, d, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
      m.position.set(x, y, z); this.group.add(m); return m;
    };
    const mk = (id, mesh, prompt, use) => g.world.addInteractable({ id, kind: 'car', root: mesh, prompt, use });
    mk('car_hood', hit(1.9, 0.9, 1.6, 0, 0.8, -1.6),
      () => {
        if (!st.flag('battery_installed')) {
          const inv = st.inventory;
          if (inv.has('battery') && inv.has('wrench')) return 'Installa la batteria';
          if (inv.has('battery')) return 'Serve la chiave inglese per i morsetti';
          return 'Cofano: manca la batteria';
        }
        if (!st.flag('cables_connected')) return st.inventory.has('cables') ? 'Collega i cavi' : 'Cofano: servono i cavi elettrici';
        return 'Il motore è pronto';
      },
      () => {
        const inv = st.inventory;
        if (!st.flag('battery_installed')) {
          if (inv.has('battery') && inv.has('wrench')) {
            inv.remove('battery'); st.setFlag('battery_installed'); g.msg('Hai fissato la batteria con la chiave inglese.'); g.audio?.metal?.(this.hood.getWorldPosition(new THREE.Vector3()));
          } else g.msg(inv.has('battery') ? 'Ti serve una chiave inglese per fissare i morsetti.' : 'Manca la batteria.');
        } else if (!st.flag('cables_connected')) {
          if (inv.has('cables')) { inv.remove('cables'); st.setFlag('cables_connected'); g.msg('Hai collegato i cavi alla batteria.'); g.audio?.zap?.(this.hood.getWorldPosition(new THREE.Vector3())); }
          else g.msg('Servono i cavi elettrici.');
        } else g.msg('Il vano motore è a posto.');
        this.sync();
      });
    mk('car_fuel', hit(0.6, 0.6, 0.6, 1.0, 0.85, 1.6),
      () => (st.flag('fuel_added') ? 'Serbatoio pieno' : st.inventory.has('jerrycan_full') ? 'Versa la benzina nel serbatoio' : 'Tappo del serbatoio (serve una tanica piena)'),
      () => {
        if (st.flag('fuel_added')) { g.msg('Il serbatoio è già pieno.'); return; }
        if (!st.inventory.has('jerrycan_full')) { g.msg('Il serbatoio è vuoto. Ti serve una tanica piena.'); return; }
        st.inventory.remove('jerrycan_full'); st.setFlag('fuel_added');
        g.msg('Hai versato la benzina nel serbatoio.'); g.audio?.pour?.(this.group.position);
      });
    mk('car_door', hit(0.6, 1.1, 1.3, -1.0, 0.95, 0.3),
      () => { const m = this.missing(); return m.length ? `Non puoi partire: ${m[0]}` : 'Sali in auto e avvia il motore'; },
      () => { const m = this.missing(); if (m.length) { g.msg(`Non puoi ancora partire: ${m.join(', ')}.`); g.audio?.locked?.(this.group.position); } else this.enter(); });
  }

  /** Requisiti per l'avvio. */
  missing() {
    const st = this.game.state, out = [];
    if (!st.inventory.has('car_keys')) out.push('mancano le chiavi dell\'auto');
    if (!st.flag('fuel_added')) out.push('manca la benzina');
    if (!st.flag('battery_installed')) out.push('manca la batteria');
    else if (!st.flag('cables_connected')) out.push('i cavi non sono collegati');
    if (!st.flag('gate_open')) out.push('il cancello è chiuso');
    return out;
  }

  sync() {
    const st = this.game.state;
    this.hood.rotation.x = st.flag('battery_installed') && !st.flag('engine_on') ? 1.0 : 0;
    if (!this.driving) {
      this.pos = { x: CAR_SPOT.x, z: CAR_SPOT.z }; this.yaw = CAR_SPOT.yaw; this.speed = 0;
      this.group.position.set(this.pos.x, 0, this.pos.z); this.group.rotation.y = this.yaw;
      this.parkCol.enabled = true;
      this.lights.forEach((l) => { l.intensity = 0; });
    }
  }

  enter() {
    const g = this.game;
    this.driving = true; this.parkCol.enabled = false;
    g.state.torch.on = false; g.applyTorch();
    g.state.setFlag('car_entered'); g.state.setFlag('engine_on');
    this.lights.forEach((l) => { l.intensity = l.userData.power; });
    this.hood.rotation.x = 0;
    g.player.camera.position.set(0, this.seat.y, 0);
    g.audio?.engineStart?.();
    g.emitNoise(this.pos.x, this.pos.z, 40);
    g.killer.startFinal();
    g.msg('Il motore si accende! W/S acceleratore e freno, A/D sterzo. Vai verso il cancello!');
  }

  update(dt) {
    if (!this.driving) return;
    const g = this.game, k = g.player.keys;
    let thr = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    let steer = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    let brake = !!k.Space;
    const ext = g.vr?.driveInput?.();         // input VR (stick sinistro)
    if (ext) { thr += ext.thr; steer += ext.steer; }
    const pad = navigator.getGamepads?.()[0];
    if (pad) { thr += -(Math.abs(pad.axes[1]) > 0.15 ? pad.axes[1] : 0); steer += Math.abs(pad.axes[0]) > 0.15 ? pad.axes[0] : 0; brake = brake || !!pad.buttons[0]?.pressed; }
    thr = Math.max(-1, Math.min(1, thr)); steer = Math.max(-1, Math.min(1, steer));

    if (thr > 0) this.speed += (this.speed < 0 ? 16 : 8) * thr * dt;
    else if (thr < 0) this.speed -= (this.speed > 0 ? 16 : 5) * -thr * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 3 * dt);
    if (brake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 20 * dt);
    this.speed = Math.max(-5, Math.min(17, this.speed));

    this.yaw -= steer * Math.min(1, Math.abs(this.speed) / 5) * 1.5 * dt * (this.speed >= 0 ? 1 : -1);
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    this.pos.x += fx * this.speed * dt; this.pos.z += fz * this.speed * dt;

    // collisioni: due cerchi (muso e coda)
    let crashed = false;
    for (const off of [-1.3, 1.3]) {
      const p = { x: this.pos.x + fx * off, z: this.pos.z + fz * off };
      const bx = p.x, bz = p.z;
      if (g.collision.resolveCircle(p, 1.0)) { this.pos.x += p.x - bx; this.pos.z += p.z - bz; crashed = true; }
    }
    if (crashed && Math.abs(this.speed) > 2) {
      g.audio?.crash?.(this.group.position); g.emitNoise(this.pos.x, this.pos.z, 28);
      this.speed *= -0.25; g.hud.flash(0.35);
    } else if (crashed) this.speed *= 0.6;

    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.yaw;
    // camera nell'abitacolo
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const rig = g.player.rig;
    rig.position.set(this.pos.x + this.seat.x * c + this.seat.z * s, 0, this.pos.z - this.seat.x * s + this.seat.z * c);
    if (!g.vrActive) g.player.camera.position.y = this.seat.y;
    g.audio?.setEngine?.(Math.abs(this.speed) / 17, thr > 0);
    g.hud.setCarSpeed(Math.abs(this.speed) * 3.6);

    if (this.pos.x > GATE.exitX) g.win();
  }
}
