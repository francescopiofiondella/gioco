import * as THREE from 'three';

// Sistema centrale di interazione: raycast dalla telecamera (PC) o dai controller (VR).
// Il primo oggetto colpito decide: se è un muro, l'interazione è bloccata.
export class InteractionSystem {
  constructor(game) {
    this.game = game;
    this.ray = new THREE.Raycaster();
    this.current = null;
    this.acc = 0;
    this._o = new THREE.Vector3(); this._d = new THREE.Vector3();
  }

  pick(origin, dir, far = 2.6) {
    this.ray.set(origin, dir);
    this.ray.far = far;
    const hits = this.ray.intersectObjects(this.game.world.rayTargets(), true);
    for (const h of hits) {
      for (let o = h.object; o; o = o.parent) {
        if (o.userData.interactable) return { it: o.userData.interactable, dist: h.distance, point: h.point };
      }
      return null; // colpito un muro/arredo prima di un oggetto interattivo
    }
    return null;
  }

  update(dt) {
    const g = this.game;
    if (g.vrActive || g.phase !== 'playing') return;
    this.acc += dt;
    if (this.acc < 0.033) return;
    this.acc = 0;
    if (g.car.driving) { this.current = null; g.hud.setPrompt(null); return; }
    if (g.player.hiding) {
      const it = g.world.interactables.find((i) => i.spot === g.player.hiding);
      this.current = it || null;
      g.hud.setPrompt(it ? `[E] ${it.prompt()}` : null);
      return;
    }
    g.camera.getWorldPosition(this._o);
    g.camera.getWorldDirection(this._d);
    const hit = this.pick(this._o, this._d, 2.6);
    this.current = hit ? hit.it : null;
    const text = this.current?.prompt?.();
    g.hud.setPrompt(text ? `[E] ${text}` : null);
  }

  useCurrent() {
    const g = this.game;
    if (g.phase !== 'playing' || g.vrActive) return;
    if (this.current) this.current.use?.();
  }
}
