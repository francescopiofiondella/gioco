import * as THREE from 'three';
import {
  BOUNDS, BUILDINGS, FURNITURE, HIDE_SPOTS, ITEM_SPOTS, DRAWERS, WAYPOINTS, DOCS, GATE, PUMP, FUSE_BOX,
} from './WorldData.js';
import { ITEMS } from '../inventory/Inventory.js';
import * as Tex from './Textures.js';
import { settings, QUALITY } from '../config/Settings.js';

// Costruisce l'intera cittadina in modo procedurale: geometrie condivise, InstancedMesh per
// alberi/zucche/foglie, collisioni AABB, oggetti interattivi e nascondigli.
export class WorldBuilder {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.collision = game.collision;
    this.root = new THREE.Group();
    this.root.name = 'world';
    this.solids = [];          // mesh che bloccano il raggio di interazione
    this.interactables = [];
    this.pickups = {};
    this.doors = {};
    this.drawers = {};
    this.hideSpots = [];
    this.windows = [];
    this.lamps = [];
    this.interiorLights = [];
    this.waypoints = WAYPOINTS.map(([x, z]) => ({ x, z }));
    this.rects = {};           // id edificio -> rettangolo interno
    this.geoCache = new Map();
    this.matCache = new Map();
    this.gate = null;
    this.rain = null;
    this.t = 0;
    this._rng = 987654321;
    this.unitBox = new THREE.BoxGeometry(1, 1, 1);
  }

  rand() { this._rng = (this._rng * 16807) % 2147483647; return this._rng / 2147483647; }
  range(a, b) { return a + (b - a) * this.rand(); }

  // ---------- helper ----------
  mat(color, o = {}) {
    const key = `${color}|${o.emissive || 0}|${o.ei || 0}|${o.opacity ?? 1}|${o.basic ? 1 : 0}|${o.mapKey || ''}`;
    let m = this.matCache.get(key);
    if (m) return m;
    const params = { color };
    if (o.map) params.map = o.map;
    if (o.opacity !== undefined && o.opacity < 1) { params.transparent = true; params.opacity = o.opacity; }
    if (o.side) params.side = o.side;
    if (o.basic) m = new THREE.MeshBasicMaterial(params);
    else {
      if (o.emissive) { params.emissive = o.emissive; params.emissiveIntensity = o.ei ?? 1; }
      m = new THREE.MeshLambertMaterial(params);
    }
    this.matCache.set(key, m);
    return m;
  }
  texMat(name, texFn, color = 0xffffff) {
    const key = `tex:${name}`;
    let m = this.matCache.get(key);
    if (m) return m;
    const map = texFn();
    m = new THREE.MeshLambertMaterial(map ? { map, color } : { color: color === 0xffffff ? 0x555555 : color });
    this.matCache.set(key, m);
    return m;
  }
  boxGeo(w, h, d, unit = 2.5) {
    const key = `${w.toFixed(2)}|${h.toFixed(2)}|${d.toFixed(2)}|${unit}`;
    let g = this.geoCache.get(key);
    if (g) return g;
    g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / unit, (uv.getY(i) * dims[f][1]) / unit);
    }
    this.geoCache.set(key, g);
    return g;
  }
  /** Box con base a y. o.collide aggiunge un AABB; o.solid(default true) lo rende occlusore per i raggi. */
  box(w, h, d, material, x, y, z, o = {}) {
    const m = new THREE.Mesh(this.boxGeo(w, h, d, o.unit), material);
    m.position.set(x, y + h / 2, z);
    (o.parent || this.root).add(m);
    if (o.solid !== false) this.solids.push(m);
    if (o.collide) this.collision.add(x - w / 2, z - d / 2, x + w / 2, z + d / 2, { noSight: !!o.noSight });
    m.castShadow = !!o.cast;
    m.receiveShadow = true;
    return m;
  }
  addInteractable(it) {
    it.root.userData.interactable = it;
    this.interactables.push(it);
    return it;
  }
  rayTargets() {
    const out = this.solids.slice();
    for (const it of this.interactables) if (it.root.visible && it.enabled !== false) out.push(it.root);
    return out;
  }

  // ---------- costruzione progressiva ----------
  async build(progress = () => {}) {
    const steps = [
      ['Terreno e strade…', () => this.buildGround()],
      ['Edifici…', () => this.buildBuildings()],
      ['Arredi e oggetti…', () => this.buildInteriors()],
      ['Nascondigli e cassetti…', () => this.buildHideSpotsAndDrawers()],
      ['Stazione di servizio, cancello…', () => this.buildGasAndGate()],
      ['Illuminazione stradale…', () => this.buildLamps()],
      ['Decorazioni di Halloween…', () => this.buildDecor()],
      ['Bosco…', () => this.buildNature()],
      ['Pioggia…', () => this.buildRain()],
    ];
    for (let i = 0; i < steps.length; i++) {
      progress(i / steps.length, steps[i][0]);
      await new Promise((r) => setTimeout(r, 0));
      steps[i][1]();
    }
    this.scene.add(this.root);
    this.sync();
    progress(1, 'Pronto');
  }

  // ---------- terreno ----------
  buildGround() {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(170, 130), this.texMat('grass', () => Tex.grass(30, 24), 0xffffff));
    g.rotation.x = -Math.PI / 2; g.position.set(5, 0, 0); g.receiveShadow = true;
    this.root.add(g);
    const plane = (w, d, x, z, matFn, key, y = 0.02) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), this.texMat(key, matFn));
      m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; this.root.add(m); return m;
    };
    plane(140, 6, 10, 0, () => Tex.asphalt(17, 1), 'road');
    plane(140, 1.5, 10, -3.75, () => Tex.concrete(70, 1), 'walk_n', 0.05);
    plane(140, 1.5, 10, 3.75, () => Tex.concrete(70, 1), 'walk_s', 0.05);
    plane(14, 9, -29, 10, () => Tex.lot(4, 3), 'lot');
    // vialetti davanti alle porte e sentiero del bosco
    for (const b of BUILDINGS) {
      const zf = b.door === 's' ? b.z + b.d / 2 + 2.2 : b.z - b.d / 2 - 2.2;
      if (b.id === 'shed') continue;
      plane(2.2, 4.4, b.x, zf, () => Tex.concrete(1, 2), 'path_' + b.id, 0.03);
    }
    const dirt = this.mat(0x3a2a1a);
    for (const [x, z, w, d] of [[-42, -23, 4, 14], [-42, -31, 3, 8]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), dirt);
      m.rotation.x = -Math.PI / 2; m.position.set(x, 0.025, z); this.root.add(m);
    }
    // strisce del parcheggio
    const stripe = this.mat(0xb8b8a8, { basic: true });
    for (let i = 0; i < 6; i++) this.box(0.1, 0.01, 4.5, stripe, -34.5 + i * 2.6, 0.03, 10.2, { solid: false });
    // limiti del mondo
    const B = BOUNDS;
    this.collision.add(B.minX - 3, B.minZ - 3, B.minX, B.maxZ + 3);
    this.collision.add(B.minX - 3, B.minZ - 3, B.maxX + 20, B.minZ);
    this.collision.add(B.minX - 3, B.maxZ, B.maxX + 20, B.maxZ + 3);
    this.collision.add(B.maxX + 20, B.minZ - 3, B.maxX + 23, B.maxZ + 3);
  }

  // ---------- edifici ----------
  wallMat(color) {
    const hex = '#' + color.toString(16).padStart(6, '0');
    return this.texMat('wall_' + color, () => Tex.siding(hex, 1, 1));
  }

  buildBuildings() {
    const woodDoor = this.texMat('door', () => Tex.wood('#4a3320'));
    const floorMat = this.texMat('floor', () => Tex.wood('#3a2a1c', 1, 1));
    const ceilMat = this.mat(0x2a2420);
    const roofMat = this.mat(0x2a1d1a);
    const dark = this.mat(0x0c0f14, { basic: true });
    const lit = 0xffa347;
    const web = Tex.web();

    for (const b of BUILDINGS) {
      const t = 0.3, gap = 1.8, H = b.h || 3.2, doorH = 2.3;
      const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2, gx = b.x;
      const wm = this.wallMat(b.color);
      const wall = (a, b2, c, d, y0 = 0, h = H) => this.box(c - a, h, d - b2, wm, (a + c) / 2, y0, (b2 + d) / 2, { collide: y0 === 0, cast: false });
      for (const side of ['n', 's']) {
        const zA = side === 'n' ? z0 : z1 - t, zB = side === 'n' ? z0 + t : z1;
        if (b.door === side) {
          wall(x0, zA, gx - gap / 2, zB); wall(gx + gap / 2, zA, x1, zB);
          wall(gx - gap / 2, zA, gx + gap / 2, zB, doorH, H - doorH);
        } else wall(x0, zA, x1, zB);
      }
      wall(x0, z0, x0 + t, z1); wall(x1 - t, z0, x1, z1);
      this.rects[b.id] = { minX: x0 + t, maxX: x1 - t, minZ: z0 + t, maxZ: z1 - t };

      this.box(b.w - 0.1, 0.05, b.d - 0.1, floorMat, b.x, 0, b.z, { solid: false });
      this.box(b.w, 0.2, b.d, ceilMat, b.x, H, b.z, { solid: true });
      const roofH = b.h ? 1.2 : 2.0;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.7071, 1, 4), roofMat);
      roof.rotation.y = Math.PI / 4; roof.scale.set(b.w + 0.9, roofH, b.d + 0.9);
      roof.position.set(b.x, H + 0.2 + roofH / 2, b.z); this.root.add(roof);

      this.makeDoor(b, gx, gap, doorH, t, woodDoor, z0, z1);

      // finestre sulla facciata (accese o spente)
      const wz = b.door === 's' ? z1 + 0.02 : z0 - 0.02;
      for (const dx of [-b.w / 3, b.w / 3]) {
        const isLit = !!b.lit && this.rand() > 0.15;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.0), new THREE.MeshBasicMaterial({ color: isLit ? lit : 0x0c0f14 }));
        m.position.set(b.x + dx, 1.7, wz);
        if (b.door === 'n') m.rotation.y = Math.PI;
        this.root.add(m);
        this.windows.push({ mesh: m, lit: isLit, timer: 0 });
        if (b.ruin) { // assi di legno sulle finestre
          for (let k = 0; k < 3; k++) {
            const plank = new THREE.Mesh(this.unitBox, this.mat(0x3a2c1c));
            plank.scale.set(1.3, 0.12, 0.05); plank.position.set(b.x + dx, 1.4 + k * 0.28, wz + (b.door === 's' ? 0.04 : -0.04));
            plank.rotation.z = (this.rand() - 0.5) * 0.3; this.root.add(plank);
          }
        }
      }
      // luce interna
      if (b.lit) {
        const l = new THREE.PointLight(0xffb870, 9, 11, 2);
        l.position.set(b.x, H - 0.5, b.z); this.root.add(l); this.interiorLights.push(l);
      }
      // ragnatele nelle case abbandonate
      if (b.ruin && web) {
        const wm2 = new THREE.MeshBasicMaterial({ map: web, transparent: true, depthWrite: false, side: THREE.DoubleSide });
        for (const [cx, cz, ry] of [[x0 + t + 0.02, z0 + t + 0.6, Math.PI / 2], [x1 - t - 0.02, z1 - t - 0.6, -Math.PI / 2]]) {
          const p = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), wm2);
          p.position.set(cx, H - 0.75, cz); p.rotation.y = ry; this.root.add(p);
        }
      }
    }
  }

  makeDoor(b, gx, gap, doorH, t, woodDoor, z0, z1) {
    const side = b.door;
    const zc = side === 's' ? z1 - t / 2 : z0 + t / 2;
    const pivot = new THREE.Group();
    pivot.position.set(gx - gap / 2, 0, zc);
    const mesh = new THREE.Mesh(this.boxGeo(gap - 0.04, doorH, 0.08, 1.2), woodDoor);
    mesh.position.set(gap / 2, doorH / 2, 0);
    pivot.add(mesh);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), this.mat(0xb8a070));
    knob.position.set(gap - 0.2, 1.0, 0.07); pivot.add(knob);
    this.root.add(pivot);
    const collider = this.collision.add(gx - gap / 2, zc - t / 2, gx + gap / 2, zc + t / 2, { door: true, locked: false, noSight: false });
    const game = this.game;
    const door = {
      id: b.id, b, pivot, collider, lock: b.lock || null, open: false, angle: 0, target: 0,
      pos: new THREE.Vector3(gx, 1.1, zc), suspicious: false,
      openAngle: side === 's' ? Math.PI * 0.52 : -Math.PI * 0.52,
      isLocked: () => !!door.lock && !game.state.flag(`unlocked_${b.id}`),
      setOpen: (v, byPlayer = false) => {
        if (door.open === v) return;
        door.open = v; door.target = v ? door.openAngle : 0;
        collider.enabled = !v;
        game.state.setFlag(`open_${b.id}`, v);
        game.audio?.door?.(door.pos, v);
        if (byPlayer) { door.suspicious = v; game.emitNoise(door.pos.x, door.pos.z, v ? 9 : 11); }
      },
      sync: () => {
        const op = game.state.flag(`open_${b.id}`);
        door.open = op; door.target = op ? door.openAngle : 0; door.angle = door.target;
        pivot.rotation.y = door.angle; collider.enabled = !op; collider.locked = door.isLocked();
      },
    };
    this.doors[b.id] = door;
    this.addInteractable({
      id: `door_${b.id}`, kind: 'door', root: pivot, door,
      prompt: () => {
        if (door.isLocked()) {
          if (door.lock === 'power') return 'Saracinesca elettrica — manca la corrente';
          return game.state.inventory.has(door.lock) ? `Usa ${ITEMS[door.lock].name}` : 'Chiusa a chiave';
        }
        return door.open ? 'Chiudi la porta' : 'Apri la porta';
      },
      use: () => {
        if (door.isLocked()) {
          if (door.lock !== 'power' && game.state.inventory.has(door.lock)) {
            game.state.inventory.remove(door.lock);
            game.state.setFlag(`unlocked_${b.id}`);
            if (b.id === 'gs') game.state.setFlag('gs_opened');
            game.msg('Hai sbloccato la porta.');
            this.refreshLocks();
            door.setOpen(true, true);
          } else {
            game.msg(door.lock === 'power' ? 'La saracinesca non si muove: manca la corrente.' : 'È chiusa a chiave.');
            game.audio?.locked?.(door.pos);
          }
          return;
        }
        door.setOpen(!door.open, true);
      },
    });
  }

  refreshLocks() {
    for (const d of Object.values(this.doors)) d.collider.locked = d.isLocked();
    this.game.nav?.rebuild();
  }

  // ---------- interni ----------
  makeItemMesh(item, doc) {
    const g = new THREE.Group();
    const M = (c, o) => this.mat(c, o);
    const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; };
    if (doc) {
      add(new THREE.BoxGeometry(0.22, 0.012, 0.3), M(0xe8dcc0), 0, 0.006, 0);
      add(new THREE.BoxGeometry(0.16, 0.014, 0.01), M(0x333333), 0, 0.007, -0.05);
      add(new THREE.BoxGeometry(0.16, 0.014, 0.01), M(0x333333), 0, 0.007, 0.0);
    } else switch (item) {
      case 'torch':
        add(new THREE.CylinderGeometry(0.035, 0.03, 0.26, 10), M(0x2a2a2e), 0, 0.04, 0, 0, 0, Math.PI / 2);
        add(new THREE.CylinderGeometry(0.055, 0.04, 0.07, 10), M(0xd0a030, { emissive: 0x806010, ei: 0.6 }), 0.14, 0.04, 0, 0, 0, Math.PI / 2); break;
      case 'torch_cell':
        add(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 10), M(0x2a8a3a, { emissive: 0x104a1a, ei: 0.6 }), 0, 0.03, 0, 0, 0, Math.PI / 2);
        add(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 8), M(0xc0c0c0), 0.06, 0.03, 0, 0, 0, Math.PI / 2); break;
      case 'house_key': case 'car_keys': case 'shop_key': case 'gate_key': {
        const c = item === 'car_keys' ? 0xc0c0d0 : 0xc8a050;
        add(new THREE.TorusGeometry(0.035, 0.009, 6, 14), M(c), 0, 0.02, 0.07, Math.PI / 2, 0, 0);
        add(new THREE.BoxGeometry(0.014, 0.008, 0.11), M(c), 0, 0.012, -0.01);
        add(new THREE.BoxGeometry(0.04, 0.008, 0.02), M(c), 0.02, 0.012, -0.06);
        if (item === 'car_keys') add(new THREE.BoxGeometry(0.05, 0.02, 0.07), M(0x202020), 0, 0.015, 0.13); break;
      }
      case 'map': add(new THREE.BoxGeometry(0.3, 0.01, 0.22), M(0xc9b27a), 0, 0.005, 0); add(new THREE.BoxGeometry(0.2, 0.012, 0.01), M(0x7a3a2a), 0, 0.006, 0); break;
      case 'jerrycan': case 'jerrycan_full':
        add(new THREE.BoxGeometry(0.32, 0.42, 0.16), M(0xb02020), 0, 0.21, 0);
        add(new THREE.BoxGeometry(0.12, 0.05, 0.1), M(0x202020), -0.08, 0.45, 0); break;
      case 'fuse': add(new THREE.CylinderGeometry(0.014, 0.014, 0.06, 8), M(0xdddddd, { opacity: 0.8 }), 0, 0.035, 0, 0, 0, Math.PI / 2); add(new THREE.CylinderGeometry(0.016, 0.016, 0.01, 8), M(0xb0b0b0), 0.032, 0.035, 0, 0, 0, Math.PI / 2); break;
      case 'battery':
        add(new THREE.BoxGeometry(0.28, 0.2, 0.18), M(0x202428), 0, 0.1, 0);
        add(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8), M(0xc03030), 0.08, 0.215, 0); add(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8), M(0x303030), -0.08, 0.215, 0); break;
      case 'cables': add(new THREE.TorusGeometry(0.12, 0.014, 6, 20), M(0xc02020), 0, 0.03, 0, Math.PI / 2, 0, 0); add(new THREE.TorusGeometry(0.1, 0.014, 6, 20), M(0x202020), 0, 0.05, 0, Math.PI / 2, 0, 0); break;
      case 'wrench': add(new THREE.BoxGeometry(0.3, 0.025, 0.04), M(0x9aa0a8), 0, 0.012, 0); add(new THREE.TorusGeometry(0.035, 0.014, 6, 10, Math.PI * 1.5), M(0x9aa0a8), 0.16, 0.012, 0, Math.PI / 2, 0, 0); break;
      default: add(new THREE.BoxGeometry(0.1, 0.1, 0.1), M(0xff00ff), 0, 0.05, 0);
    }
    return g;
  }

  buildInteriors() {
    const game = this.game;
    for (const f of FURNITURE) {
      this.box(f.w, f.h, f.d, this.mat(f.c), f.x, 0, f.z, { collide: true, noSight: f.h < 1.2, unit: 1.5 });
    }
    // oggetti raccoglibili e documenti
    for (const s of ITEM_SPOTS) {
      const root = new THREE.Group();
      root.add(this.makeItemMesh(s.item, s.doc));
      const hit = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.y = 0.15; root.add(hit);
      const glowTex = Tex.radialGlow();
      if (glowTex) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: s.doc ? 0xffeecc : 0xffb050, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
        sp.scale.set(0.7, 0.7, 1); sp.position.y = 0.12; root.add(sp);
      }
      root.position.set(s.x, s.y, s.z);
      root.rotation.y = this.rand() * Math.PI * 2;
      this.root.add(root);
      const docDef = s.doc ? DOCS[s.doc] : null;
      const it = {
        id: s.id, kind: 'pickup', root, item: s.item || null, doc: s.doc || null, container: s.container || null,
        prompt: () => (docDef ? `Leggi: ${docDef.title}` : `Raccogli: ${ITEMS[s.item].name}`),
        use: () => game.collectPickup(it),
        sync: () => { root.visible = !game.state.flag(`picked_${s.id}`) && (!s.container || game.state.flag(`open_${s.container}`)); },
      };
      this.pickups[s.id] = it;
      this.addInteractable(it);
    }
  }

  // ---------- nascondigli e cassetti ----------
  buildHideSpotsAndDrawers() {
    const game = this.game;
    for (const h of HIDE_SPOTS) {
      const color = h.kind === 'wardrobe' ? 0x4a3222 : 0x2c4a38;
      const root = new THREE.Group();
      const body = new THREE.Mesh(this.boxGeo(h.w, h.h, h.d, 1.5), this.mat(color));
      body.position.set(0, h.h / 2, 0); root.add(body);
      this.solids.push(body);
      if (h.kind === 'wardrobe') {
        const line = new THREE.Mesh(this.unitBox, this.mat(0x1a110a));
        line.scale.set(0.03, h.h * 0.9, 0.02); line.position.set(0.0, h.h / 2, h.exit[1] > h.z ? h.d / 2 + 0.01 : -h.d / 2 - 0.01);
        if (h.exit[0] > h.x) { line.scale.set(0.02, h.h * 0.9, 0.03); line.position.set(h.w / 2 + 0.01, h.h / 2, 0); }
        root.add(line);
      } else {
        const lid = new THREE.Mesh(this.boxGeo(h.w + 0.1, 0.08, h.d + 0.1, 1), this.mat(0x1e2e24));
        lid.position.set(0, h.h + 0.04, 0); root.add(lid);
      }
      root.position.set(h.x, 0, h.z);
      this.root.add(root);
      this.collision.add(h.x - h.w / 2, h.z - h.d / 2, h.x + h.w / 2, h.z + h.d / 2, { noSight: true });
      const spot = { id: h.id, name: h.name, pos: new THREE.Vector3(h.pos[0], 0, h.pos[1]), exit: new THREE.Vector3(h.exit[0], 0, h.exit[1]), root };
      this.hideSpots.push(spot);
      this.addInteractable({
        id: h.id, kind: 'hide', root, spot,
        prompt: () => (game.player.hiding === spot ? `Esci dal ${h.name}` : `Nasconditi nel ${h.name}`),
        use: () => (game.player.hiding === spot ? game.player.exitHide() : game.player.enterHide(spot)),
      });
    }
    for (const d of DRAWERS) {
      if (d.y === undefined) this.box(d.w, 0.72, d.d, this.mat(0x5a4430), d.x, 0, d.z, { collide: true, noSight: true, unit: 1.5 });
      const grp = new THREE.Group();
      const trayTop = d.y ?? 0.76;
      const front = new THREE.Mesh(this.boxGeo(d.w * 0.85, 0.2, 0.05, 1), this.mat(0x7a5a3a));
      front.position.set(0, 0, 0.2); grp.add(front);
      const tray = new THREE.Mesh(this.boxGeo(d.w * 0.8, 0.06, 0.45, 1), this.mat(0x3a2a1c));
      tray.position.set(0, -0.1, -0.03); grp.add(tray);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(d.w * 0.9, 0.35, 0.5), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(0, 0, 0); grp.add(hit);
      const closedZ = d.z + d.d / 2 - 0.2, openZ = d.z + d.d / 2 + 0.25;
      grp.position.set(d.x, trayTop + 0.1, closedZ);
      this.root.add(grp);
      const dr = {
        id: d.id, root: grp, open: false, closedZ, openZ,
        sync: () => { dr.open = game.state.flag(`open_${d.id}`); grp.position.z = dr.open ? openZ : closedZ; },
      };
      this.drawers[d.id] = dr;
      this.addInteractable({
        id: d.id, kind: 'drawer', root: grp,
        prompt: () => (dr.open ? 'Chiudi il cassetto' : 'Apri il cassetto'),
        use: () => {
          game.state.setFlag(`open_${d.id}`, !dr.open);
          game.audio?.drawer?.(new THREE.Vector3(d.x, 1, d.z));
          game.emitNoise(d.x, d.z, 5);
        },
        sync: dr.sync,
      });
      // posiziona gli oggetti contenuti sulla vaschetta aperta
      for (const p of Object.values(this.pickups)) {
        if (p.container === d.id) p.root.position.set(d.x, trayTop + 0.02, openZ + 0.02);
      }
    }
  }

  // ---------- stazione di servizio e cancello ----------
  buildGasAndGate() {
    const game = this.game;
    const red = this.mat(0xb02a22), white = this.mat(0xd8d8d0), metal = this.mat(0x3a3d42);
    // tettoia
    this.box(12.4, 0.3, 5.4, this.mat(0xd8d0c0), 30, 4.0, -6.3, { solid: false });
    this.box(12.4, 0.35, 0.3, red, 30, 3.98, -9.05, { solid: false });
    for (const [x, z] of [[24.5, -8.6], [35.5, -8.6], [24.5, -4.0], [35.5, -4.0]]) this.box(0.4, 4.0, 0.4, white, x, 0, z, { collide: true, noSight: true });
    // pompe
    const pumpDisplay = this.mat(0x30ff60, { emissive: 0x20c040, ei: 1.2, basic: true });
    for (const px of [PUMP.x, PUMP.x + 4]) {
      const root = new THREE.Group();
      const body = new THREE.Mesh(this.boxGeo(0.7, 1.5, 0.5, 1), red);
      body.position.y = 0.75; root.add(body);
      const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.2), pumpDisplay); disp.position.set(0, 1.2, 0.26); root.add(disp);
      root.position.set(px, 0, PUMP.z); this.root.add(root);
      this.solids.push(body);
      this.collision.add(px - 0.4, PUMP.z - 0.3, px + 0.4, PUMP.z + 0.3, { noSight: true });
      if (px === PUMP.x) {
        this.addInteractable({
          id: 'pump', kind: 'pump', root,
          prompt: () => (game.state.inventory.has('jerrycan') ? 'Riempi la tanica' : game.state.inventory.has('jerrycan_full') ? 'La tanica è già piena' : 'Pompa di benzina (serve una tanica)'),
          use: () => {
            const inv = game.state.inventory;
            if (inv.has('jerrycan')) {
              if (inv.has('battery')) { game.msg('Hai le mani occupate dalla batteria.'); return; }
              inv.remove('jerrycan'); inv.add('jerrycan_full');
              game.state.setFlag('jerrycan_filled'); game.msg('Hai riempito la tanica. È pesante: hai le mani occupate.');
              game.audio?.pour?.(root.position);
            } else if (inv.has('jerrycan_full')) game.msg('La tanica è già piena.');
            else game.msg('Ti serve una tanica.');
          },
        });
      }
    }
    // cassetta dei fusibili dell'officina
    const fb = new THREE.Group();
    const fbody = new THREE.Mesh(this.boxGeo(0.5, 0.6, 0.15, 1), this.mat(0x3a4a3a)); fbody.position.y = 1.4; fb.add(fbody);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 })); led.position.set(0.15, 1.6, -0.09); fb.add(led);
    fb.position.set(FUSE_BOX.x, 0, FUSE_BOX.z); this.root.add(fb); this.solids.push(fbody);
    this.addInteractable({
      id: 'fusebox', kind: 'fusebox', root: fb,
      prompt: () => (game.state.flag('garage_powered') ? 'Corrente ripristinata' : game.state.inventory.has('fuse') ? 'Inserisci il fusibile' : 'Cassetta dei fusibili (manca il fusibile)'),
      use: () => {
        if (game.state.flag('garage_powered')) { game.msg('La corrente è già attiva.'); return; }
        if (!game.state.inventory.has('fuse')) { game.msg('Manca un fusibile.'); return; }
        game.state.inventory.remove('fuse');
        game.state.setFlag('garage_powered'); game.state.setFlag('unlocked_garage');
        this.refreshLocks();
        game.msg('Corrente ripristinata: la saracinesca si apre.');
        game.audio?.zap?.(fb.position);
        this.doors.garage.setOpen(true, true);
      },
      sync: () => { led.material.color.set(game.state.flag('garage_powered') ? 0x20ff60 : 0xff2020); },
    });

    // cancello
    const G = GATE, wallMat = this.texMat('gatewall', () => Tex.concrete(8, 1), 0xffffff);
    // muro lungo il confine est con varco per il cancello (nord e sud)
    this.box(0.8, 3.2, BOUNDS.maxZ - G.half, wallMat, G.x, 0, (BOUNDS.minZ - G.half) / 2, { solid: true });
    this.collision.add(G.x - 0.4, BOUNDS.minZ, G.x + 0.4, -G.half);
    this.collision.add(G.x - 0.4, G.half, G.x + 0.4, BOUNDS.maxZ);
    this.box(0.8, 3.2, (BOUNDS.maxZ - G.half), wallMat, G.x, 0, (G.half + BOUNDS.maxZ) / 2, { solid: true });
    for (const s of [-1, 1]) this.box(0.9, 3.6, 0.9, this.mat(0x5a5a58), G.x, 0, s * (G.half + 0.45), { collide: false });
    const leafMat = this.mat(0x2a2e34);
    const leaves = [-1, 1].map((s) => {
      const lf = new THREE.Mesh(this.boxGeo(0.15, 2.6, G.half - 0.05, 1), leafMat);
      lf.position.set(G.x - 0.6, 1.3, s * (G.half / 2)); this.root.add(lf); this.solids.push(lf); return lf;
    });
    const gateCol = this.collision.add(G.x - 0.4, -G.half, G.x + 0.4, G.half);
    this.gate = { collider: gateCol, leaves, open: false, t: 0 };
    // pannello di controllo
    const pn = new THREE.Group();
    const pbody = new THREE.Mesh(this.boxGeo(0.5, 1.2, 0.3, 1), this.mat(0x30363e)); pbody.position.y = 0.6; pn.add(pbody);
    const pled = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.02), new THREE.MeshBasicMaterial({ color: 0xff2020 })); pled.position.set(0, 1.0, -0.16); pn.add(pled);
    pn.position.set(G.panel.x, 0, G.panel.z); this.root.add(pn); this.solids.push(pbody);
    this.collision.add(G.panel.x - 0.3, G.panel.z - 0.2, G.panel.x + 0.3, G.panel.z + 0.2, { noSight: true });
    this.addInteractable({
      id: 'gatepanel', kind: 'gatepanel', root: pn,
      prompt: () => (game.state.flag('gate_open') ? 'Il cancello è aperto' : game.state.inventory.has('gate_key') ? 'Usa la chiave del cancello' : 'Pannello del cancello (serve la chiave)'),
      use: () => {
        if (game.state.flag('gate_open')) return;
        if (!game.state.inventory.has('gate_key')) { game.msg('Il pannello è bloccato. Serve la chiave del cancello.'); return; }
        game.state.inventory.remove('gate_key');
        game.state.setFlag('gate_open');
        game.msg('Il motore del cancello si avvia con un forte rumore!');
        game.audio?.gateMotor?.(pn.position);
        game.emitNoise(G.x, 0, 30);
      },
      sync: () => { pled.material.color.set(game.state.flag('gate_open') ? 0x20ff60 : 0xff2020); },
    });
  }

  // ---------- lampioni ----------
  buildLamps() {
    const pole = this.mat(0x1c1c20), head = this.mat(0xffd9a0, { basic: true });
    const xs = [-52, -34, -16, 2, 20, 40, 48];
    xs.forEach((x, i) => {
      const z = -4.4;
      this.box(0.12, 4.2, 0.12, pole, x, 0, z, { collide: true, noSight: true, solid: false });
      this.box(0.9, 0.08, 0.1, pole, x + 0.35, 4.12, z, { solid: false });
      const hd = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.3), head); hd.position.set(x + 0.7, 4.0, z); this.root.add(hd);
      if (i < 6) {
        const l = new THREE.PointLight(0xffc878, 26, 17, 2);
        l.position.set(x + 0.7, 3.8, z); this.root.add(l);
        this.lamps.push({ light: l, base: 26, phase: this.rand() * 10, flicker: i === 0 || i === 3 ? 1 : 0.15, head: hd });
      }
    });
  }

  // ---------- decorazioni ----------
  buildDecor() {
    // zucche istanziate con faccia intagliata (texture) e luce emissiva
    const faceTex = typeof document !== 'undefined' ? (() => {
      const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
      g.fillStyle = '#e8700a'; g.fillRect(0, 0, 128, 128);
      for (let x = 0; x < 128; x += 14) { g.fillStyle = 'rgba(120,40,0,.35)'; g.fillRect(x, 0, 4, 128); }
      g.fillStyle = '#ffe070';
      g.beginPath(); g.moveTo(24, 50); g.lineTo(46, 50); g.lineTo(35, 34); g.fill();
      g.beginPath(); g.moveTo(66, 50); g.lineTo(88, 50); g.lineTo(77, 34); g.fill();
      g.beginPath(); g.moveTo(26, 74); g.lineTo(86, 74); g.lineTo(76, 96); g.lineTo(60, 86); g.lineTo(44, 96); g.fill();
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })() : null;
    const pm = new THREE.MeshLambertMaterial({ map: faceTex, color: faceTex ? 0xffffff : 0xff7a10, emissive: 0xff5a00, emissiveIntensity: 0.9, emissiveMap: faceTex || null });
    const spots = [];
    for (const b of BUILDINGS) {
      if (b.id === 'shed') continue;
      const front = b.door === 's' ? b.z + b.d / 2 : b.z - b.d / 2, dir = b.door === 's' ? 1 : -1;
      for (const dx of [-1.8, -1.2, 1.3, 2.0]) spots.push([b.x + dx, front + dir * (0.8 + this.rand() * 0.6), dir > 0 ? 0 : Math.PI]);
    }
    for (let i = 0; i < 18; i++) spots.push([this.range(-56, 46), this.rand() > 0.5 ? this.range(-7.2, -5.2) : this.range(5.2, 7.2), this.rand() * 6.28]);
    spots.push([-42, -21.5, 0.2], [-42.5, -21.2, 1], [-41.5, -22, 2]);
    const pump = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 12, 9), pm, spots.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    spots.forEach(([x, z, ry], i) => {
      const k = 0.7 + this.rand() * 0.7; s.set(k, k * 0.85, k); p.set(x, 0.25 * k, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry); m4.compose(p, q, s); pump.setMatrixAt(i, m4);
    });
    this.root.add(pump);

    // scheletri seduti su panchine davanti alle case
    const bone = this.mat(0xd8d0b8);
    const skel = (x, z, ry) => {
      const g = new THREE.Group();
      const bench = new THREE.Mesh(this.boxGeo(1.4, 0.06, 0.4, 1), this.mat(0x4a3322)); bench.position.y = 0.45; g.add(bench);
      for (const lx of [-0.6, 0.6]) { const l = new THREE.Mesh(this.boxGeo(0.06, 0.45, 0.35, 1), this.mat(0x4a3322)); l.position.set(lx, 0.22, 0); g.add(l); }
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.5, 8), bone); torso.position.y = 0.76; g.add(torso);
      for (let i = 0; i < 3; i++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 4, 10), bone); rib.rotation.x = Math.PI / 2; rib.position.y = 0.68 + i * 0.1; g.add(rib); }
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), bone); skull.position.y = 1.15; g.add(skull);
      for (const ex of [-0.05, 0.05]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), this.mat(0x050505)); eye.position.set(ex, 1.17, -0.11); g.add(eye); }
      for (const lx of [-0.1, 0.1]) { const th = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 6), bone); th.rotation.x = Math.PI / 2; th.position.set(lx, 0.52, -0.22); g.add(th); }
      g.position.set(x, 0, z); g.rotation.y = ry; this.root.add(g);
      this.collision.add(x - 0.7, z - 0.25, x + 0.7, z + 0.25, { noSight: true });
    };
    skel(-26, -6.4, 0); skel(18, 6.4, Math.PI); skel(-3, -6.4, 0.3); skel(40, 6.4, Math.PI);

    // foglie secche istanziate
    const q2 = QUALITY[settings.quality] || QUALITY.medium;
    const nLeaves = Math.floor(700 * q2.leaves);
    const leaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, color: 0xffffff }), nLeaves);
    const cols = [0x7a3a10, 0x9a5a18, 0x5a2a0c, 0x8a6a20, 0x6a3a14];
    const col = new THREE.Color(), e = new THREE.Euler();
    for (let i = 0; i < nLeaves; i++) {
      p.set(this.range(-58, 50), 0.04, this.range(-40, 40));
      e.set(-Math.PI / 2, 0, this.rand() * 6.28); q.setFromEuler(e); s.setScalar(0.6 + this.rand() * 0.9);
      m4.compose(p, q, s); leaves.setMatrixAt(i, m4); leaves.setColorAt(i, col.setHex(cols[i % cols.length]));
    }
    this.root.add(leaves);
  }

  // ---------- bosco ----------
  buildNature() {
    const q = QUALITY[settings.quality] || QUALITY.medium;
    const B = BOUNDS;
    const inRect = (x, z, r, m) => x > r.minX - m && x < r.maxX + m && z > r.minZ - m && z < r.maxZ + m;
    const keepClear = [
      ...BUILDINGS.map((b) => ({ minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2, m: 4 })),
      { minX: -70, maxX: 90, minZ: -7.5, maxZ: 7.5, m: 0 },              // strada
      { minX: -37, maxX: -21, minZ: 4, maxZ: 16, m: 0 },                // parcheggio
      { minX: -45, maxX: -39, minZ: -32, maxZ: -9, m: 0 },              // vicolo e sentiero
      { minX: -46, maxX: -38, minZ: -40, maxZ: -30, m: 0 },             // capanno
      { minX: 44, maxX: 90, minZ: -9, maxZ: 9, m: 0 },                  // cancello
      { minX: -55, maxX: -45, minZ: -9, maxZ: -4, m: 0 },               // spawn
    ];
    const target = Math.floor(260 * q.trees);
    const pts = [];
    let tries = 0;
    while (pts.length < target && tries++ < 6000) {
      const x = this.range(B.minX + 1, B.maxX - 1), z = this.range(B.minZ + 1, B.maxZ - 1);
      const forest = z < -25 || z > 22 || x < -55 || x > 46;
      if (!forest && this.rand() > 0.04) continue;
      if (keepClear.some((r) => inRect(x, z, r, r.m))) continue;
      pts.push([x, z, 0.8 + this.rand() * 0.9]);
    }
    for (let i = 0; i < 40 * q.trees; i++) { // alberi oltre il cancello (solo visuali)
      const x = this.range(54, 80), z = this.rand() > 0.5 ? this.range(7, 40) : this.range(-40, -7);
      pts.push([x, z, 0.9 + this.rand() * 0.8, true]);
    }
    const n = pts.length;
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.22, 3, 6), this.texMat('bark', () => Tex.bark()), n);
    const low = new THREE.InstancedMesh(new THREE.ConeGeometry(1.7, 3.2, 7), this.mat(0x16301c), n);
    const high = new THREE.InstancedMesh(new THREE.ConeGeometry(1.2, 2.8, 7), this.mat(0x1c3a22), n);
    const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    pts.forEach(([x, z, k, visual], i) => {
      qq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.rand() * 6.28); s.set(k, k, k);
      p.set(x, 1.5 * k, z); m4.compose(p, qq, s); trunk.setMatrixAt(i, m4);
      p.set(x, 3.4 * k, z); m4.compose(p, qq, s); low.setMatrixAt(i, m4);
      p.set(x, 5.0 * k, z); m4.compose(p, qq, s); high.setMatrixAt(i, m4);
      if (!visual) this.collision.add(x - 0.35 * k, z - 0.35 * k, x + 0.35 * k, z + 0.35 * k, { noSight: true });
    });
    this.root.add(trunk, low, high);
    // muro vegetale verso il confine ovest per nascondere il bordo del mondo
    for (let z = -44; z < 44; z += 3) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(2.2, 6, 6), this.mat(0x12281a));
      t.position.set(B.minX - 1.5, 3, z + this.rand() * 2); this.root.add(t);
    }
  }

  // ---------- pioggia ----------
  buildRain() {
    const q = QUALITY[settings.quality] || QUALITY.medium;
    const n = q.rain;
    this.rainN = n;
    this.rainDrops = new Float32Array(n * 3);
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      this.rainDrops[i * 3] = this.range(-16, 16); this.rainDrops[i * 3 + 1] = this.range(0, 14); this.rainDrops[i * 3 + 2] = this.range(-16, 16);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x9fb4d0, transparent: true, opacity: 0.32, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = !!settings.rain;
    this.scene.add(this.rain);
  }
  setRain(on) { if (this.rain) this.rain.visible = !!on; }

  // ---------- stato / aggiornamento ----------
  sync() {
    for (const d of Object.values(this.doors)) d.sync();
    for (const it of this.interactables) it.sync?.();
    const open = this.game.state.flag('gate_open');
    if (this.gate) {
      this.gate.open = open; this.gate.t = open ? 1 : 0; this.gate.collider.enabled = !open;
      this.gate.leaves[0].position.z = -GATE.half / 2 - this.gate.t * GATE.half;
      this.gate.leaves[1].position.z = GATE.half / 2 + this.gate.t * GATE.half;
    }
    this.game.nav?.rebuild();
  }
  /** Aggiornamento leggero dopo un singolo flag, senza ricostruire tutto. */
  onFlag() {
    for (const it of this.interactables) it.sync?.();
    if (this.gate) { this.gate.open = this.game.state.flag('gate_open'); this.gate.collider.enabled = !this.gate.open; }
    for (const d of Object.values(this.doors)) d.collider.locked = d.isLocked();
  }
  surfaceAt(x, z) {
    for (const r of Object.values(this.rects)) if (x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ) return 'wood';
    return Math.abs(z) < 3.2 ? 'asphalt' : 'grass';
  }
  insideBuilding(id, x, z) {
    const r = this.rects[id];
    return !!r && x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ;
  }

  update(dt, playerPos) {
    this.t += dt;
    for (const d of Object.values(this.doors)) {
      if (Math.abs(d.angle - d.target) > 0.002) { d.angle += (d.target - d.angle) * Math.min(1, dt * 5); d.pivot.rotation.y = d.angle; }
    }
    if (this.gate) {
      const tgt = this.gate.open ? 1 : 0;
      if (Math.abs(this.gate.t - tgt) > 0.001) {
        this.gate.t += Math.sign(tgt - this.gate.t) * dt * 0.25; this.gate.t = Math.max(0, Math.min(1, this.gate.t));
        this.gate.leaves[0].position.z = -GATE.half / 2 - this.gate.t * GATE.half;
        this.gate.leaves[1].position.z = GATE.half / 2 + this.gate.t * GATE.half;
      }
    }
    for (const l of this.lamps) { // lampioni tremolanti
      if (l.off > 0) { l.off -= dt; l.light.intensity = l.base * 0.02; continue; }
      const n = Math.sin(this.t * 17 + l.phase) * Math.sin(this.t * 5.3 + l.phase * 2);
      const off = l.flicker > 0.5 && Math.sin(this.t * 0.7 + l.phase) > 0.93;
      l.light.intensity = off ? l.base * 0.1 : l.base * (1 - l.flicker * 0.35 * Math.max(0, n));
    }
    for (const w of this.windows) { // finestre che si accendono per un evento
      if (w.timer > 0) { w.timer -= dt; if (w.timer <= 0) w.mesh.material.color.set(w.lit ? 0xffa347 : 0x0c0f14); }
    }
    if (this.rain?.visible && playerPos) {
      this.rain.position.set(playerPos.x, 0, playerPos.z);
      const a = this.rain.geometry.attributes.position.array, d = this.rainDrops;
      for (let i = 0; i < this.rainN; i++) {
        let y = d[i * 3 + 1] - 16 * dt; if (y < 0) y += 14;
        d[i * 3 + 1] = y;
        const x = d[i * 3], z = d[i * 3 + 2];
        a[i * 6] = x; a[i * 6 + 1] = y; a[i * 6 + 2] = z; a[i * 6 + 3] = x + 0.03; a[i * 6 + 4] = y + 0.55; a[i * 6 + 5] = z;
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
  }
  lightWindow(seconds = 6) {
    const cand = this.windows.filter((w) => !w.lit && w.timer <= 0);
    if (!cand.length) return null;
    const w = cand[(this.rand() * cand.length) | 0];
    w.mesh.material.color.set(0xffa347); w.timer = seconds;
    return w.mesh.position;
  }
  setInteriorLights(on) { for (const l of this.interiorLights) l.visible = on; }
}
