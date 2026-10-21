// Navigazione a griglia (celle da 0.5 m) con A* a 8 direzioni e smoothing del percorso.
// Le porte chiuse ma non bloccate a chiave sono attraversabili (l'assassino le apre);
// le porte a chiave e i muri bloccano la griglia.
export class NavigationSystem {
  constructor(collision, bounds, cell = 0.5) {
    this.collision = collision;
    this.b = bounds;
    this.cell = cell;
    this.w = Math.ceil((bounds.maxX - bounds.minX) / cell);
    this.h = Math.ceil((bounds.maxZ - bounds.minZ) / cell);
    this.blocked = new Uint8Array(this.w * this.h);
    this.g = new Float32Array(this.w * this.h);
    this.parent = new Int32Array(this.w * this.h);
    this.stamp = new Uint32Array(this.w * this.h);
    this.run = 0;
  }

  rebuild(radius = 0.42) {
    this.blocked.fill(0);
    const { minX, minZ } = this.b, c = this.cell;
    for (const b of this.collision.boxes) {
      const blocks = b.door ? b.locked : b.enabled;
      if (!blocks) continue;
      const x0 = Math.max(0, Math.floor((b.minX - radius - minX) / c)), x1 = Math.min(this.w - 1, Math.ceil((b.maxX + radius - minX) / c));
      const z0 = Math.max(0, Math.floor((b.minZ - radius - minZ) / c)), z1 = Math.min(this.h - 1, Math.ceil((b.maxZ + radius - minZ) / c));
      for (let iz = z0; iz <= z1; iz++) {
        const cz = minZ + (iz + 0.5) * c;
        for (let ix = x0; ix <= x1; ix++) {
          const cx = minX + (ix + 0.5) * c;
          const dx = Math.max(b.minX - cx, 0, cx - b.maxX), dz = Math.max(b.minZ - cz, 0, cz - b.maxZ);
          if (dx * dx + dz * dz < radius * radius) this.blocked[iz * this.w + ix] = 1;
        }
      }
    }
  }

  toCell(x, z) {
    return [
      Math.max(0, Math.min(this.w - 1, Math.floor((x - this.b.minX) / this.cell))),
      Math.max(0, Math.min(this.h - 1, Math.floor((z - this.b.minZ) / this.cell))),
    ];
  }
  toWorld(ix, iz) { return { x: this.b.minX + (ix + 0.5) * this.cell, z: this.b.minZ + (iz + 0.5) * this.cell }; }
  isBlockedAt(x, z) { const [ix, iz] = this.toCell(x, z); return this.blocked[iz * this.w + ix] === 1; }

  nearestFree(x, z, maxR = 12) {
    let [ix, iz] = this.toCell(x, z);
    if (!this.blocked[iz * this.w + ix]) return [ix, iz];
    for (let r = 1; r <= maxR / this.cell; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const nx = ix + dx, nz = iz + dz;
        if (nx < 0 || nz < 0 || nx >= this.w || nz >= this.h) continue;
        if (!this.blocked[nz * this.w + nx]) return [nx, nz];
      }
    }
    return null;
  }

  lineClear(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / (this.cell * 0.5));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (this.isBlockedAt(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  /** Ritorna un array di punti {x,z} dal punto di partenza alla destinazione, oppure null se irraggiungibile. */
  findPath(sx, sz, tx, tz) {
    const s = this.nearestFree(sx, sz, 3), t = this.nearestFree(tx, tz, 3);
    if (!s || !t) return null;
    const W = this.w, start = s[1] * W + s[0], goal = t[1] * W + t[0];
    this.run++;
    const run = this.run, open = [];
    const push = (idx, f) => { open.push([f, idx]); let i = open.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (open[p][0] <= open[i][0]) break; [open[p], open[i]] = [open[i], open[p]]; i = p; } };
    const pop = () => { const top = open[0], last = open.pop(); if (open.length) { open[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === i) break; [open[m], open[i]] = [open[i], open[m]]; i = m; } } return top; };
    this.stamp[start] = run; this.g[start] = 0; this.parent[start] = -1;
    push(start, 0);
    const gx = goal % W, gz = (goal / W) | 0;
    const closed = new Set();
    let iter = 0, found = false;
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
    while (open.length && iter++ < 60000) {
      const [, cur] = pop();
      if (cur === goal) { found = true; break; }
      if (closed.has(cur)) continue;
      closed.add(cur);
      const cx = cur % W, cz = (cur / W) | 0;
      for (const [dx, dz, cost] of dirs) {
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= this.h) continue;
        const ni = nz * W + nx;
        if (this.blocked[ni]) continue;
        if (dx && dz && (this.blocked[cz * W + nx] || this.blocked[nz * W + cx])) continue; // niente tagli d'angolo
        const ng = this.g[cur] + cost;
        if (this.stamp[ni] === run && ng >= this.g[ni]) continue;
        this.stamp[ni] = run; this.g[ni] = ng; this.parent[ni] = cur;
        const ddx = Math.abs(nx - gx), ddz = Math.abs(nz - gz);
        push(ni, ng + (ddx + ddz) + (1.4142 - 2) * Math.min(ddx, ddz));
      }
    }
    if (!found) return null;
    const cells = [];
    for (let c = goal; c !== -1; c = this.parent[c]) cells.push(c);
    cells.reverse();
    let pts = cells.map((c) => this.toWorld(c % W, (c / W) | 0));
    // smoothing: salta i punti intermedi se il segmento è libero
    const out = [pts[0]];
    let anchor = 0;
    for (let i = 2; i < pts.length; i++) {
      if (!this.lineClear(pts[anchor].x, pts[anchor].z, pts[i].x, pts[i].z)) { out.push(pts[i - 1]); anchor = i - 1; }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
}
