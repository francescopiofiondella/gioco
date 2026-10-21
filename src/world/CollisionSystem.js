// Collisioni 2D (piano XZ) con AABB. Usate da giocatore, auto e IA (visibilità tramite raycast analitico).
export class CollisionSystem {
  constructor() { this.boxes = []; }

  add(minX, minZ, maxX, maxZ, tag = {}) {
    const b = { minX, minZ, maxX, maxZ, enabled: true, ...tag };
    this.boxes.push(b);
    return b;
  }

  /** Spinge fuori dai muri un cerchio {x,z} di raggio r. Ritorna true se ha corretto la posizione. */
  resolveCircle(pos, r) {
    let hit = false;
    for (let it = 0; it < 4; it++) {
      let moved = false;
      for (const b of this.boxes) {
        if (!b.enabled) continue;
        const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
        const dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2), push = r - d;
          pos.x += (dx / d) * push; pos.z += (dz / d) * push;
        } else { // centro dentro il box: esci dalla faccia più vicina
          const l = pos.x - b.minX, rr = b.maxX - pos.x, t = pos.z - b.minZ, bt = b.maxZ - pos.z;
          const m = Math.min(l, rr, t, bt);
          if (m === l) pos.x = b.minX - r; else if (m === rr) pos.x = b.maxX + r;
          else if (m === t) pos.z = b.minZ - r; else pos.z = b.maxZ + r;
        }
        moved = hit = true;
      }
      if (!moved) break;
    }
    return hit;
  }

  circleBlocked(x, z, r) {
    for (const b of this.boxes) {
      if (!b.enabled) continue;
      const cx = Math.max(b.minX, Math.min(x, b.maxX)), cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return true;
    }
    return false;
  }

  /** Raycast sul segmento A->B. Ritorna t in [0,1] del primo impatto oppure null. Ignora i box con noSight. */
  raycast(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    let best = null;
    for (const b of this.boxes) {
      if (!b.enabled || b.noSight) continue;
      let t0 = 0, t1 = 1;
      if (Math.abs(dx) < 1e-9) { if (ax < b.minX || ax > b.maxX) continue; }
      else {
        let ta = (b.minX - ax) / dx, tb = (b.maxX - ax) / dx;
        if (ta > tb) { const t = ta; ta = tb; tb = t; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) continue;
      }
      if (Math.abs(dz) < 1e-9) { if (az < b.minZ || az > b.maxZ) continue; }
      else {
        let ta = (b.minZ - az) / dz, tb = (b.maxZ - az) / dz;
        if (ta > tb) { const t = ta; ta = tb; tb = t; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) continue;
      }
      if (best === null || t0 < best) best = t0;
    }
    return best;
  }

  lineOfSight(ax, az, bx, bz) { return this.raycast(ax, az, bx, bz) === null; }
}
