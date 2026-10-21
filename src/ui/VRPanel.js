import * as THREE from 'three';
import { ITEMS } from '../inventory/Inventory.js';

// Interfaccia 3D per la VR: pannello al polso (obiettivo, torcia, inventario), messaggi fluttuanti,
// suggerimento sull'oggetto puntato e pannello grande (inventario/obiettivi/diario, mappa, documenti, fine partita).
function wrap(g, text, x, y, maxW, lh, maxLines = 99) {
  const words = String(text).split(/\s+/); let line = '', n = 0;
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y); y += lh; line = w; if (++n >= maxLines) return y; } else line = t;
  }
  if (line) { g.fillText(line, x, y); y += lh; }
  return y;
}
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

export class VRPanel {
  constructor(game) {
    this.game = game; this.objective = ''; this.prompt = null; this.msg = ''; this.msgT = 0; this.needs = true; this.acc = 0;
    this.mode = null; this.docTitle = ''; this.docText = ''; this.endTitle = ''; this.endText = ''; this.rows = []; this.bigNeeds = false;
    // pannello al polso
    this.wc = makeCanvas(512, 320); this.wt = new THREE.CanvasTexture(this.wc); this.wt.colorSpace = THREE.SRGBColorSpace;
    this.wrist = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.125), new THREE.MeshBasicMaterial({ map: this.wt, transparent: true, depthWrite: false }));
    this.wrist.position.set(0, 0.08, 0.02); this.wrist.rotation.x = -Math.PI / 2.4;
    // messaggio fluttuante (figlio della camera)
    this.mc = makeCanvas(768, 128); this.mt = new THREE.CanvasTexture(this.mc); this.mt.colorSpace = THREE.SRGBColorSpace;
    this.msgMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.15), new THREE.MeshBasicMaterial({ map: this.mt, transparent: true, depthTest: false, depthWrite: false }));
    this.msgMesh.position.set(0, -0.32, -1.1); this.msgMesh.renderOrder = 998; this.msgMesh.visible = false;
    // suggerimento 3D sull'oggetto puntato
    this.pc = makeCanvas(512, 96); this.pt = new THREE.CanvasTexture(this.pc); this.pt.colorSpace = THREE.SRGBColorSpace;
    this.promptMesh = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.pt, transparent: true, depthTest: false }));
    this.promptMesh.scale.set(0.5, 0.094, 1); this.promptMesh.renderOrder = 997; this.promptMesh.visible = false;
    // pannello grande
    this.bc = makeCanvas(1024, 704); this.bt = new THREE.CanvasTexture(this.bc); this.bt.colorSpace = THREE.SRGBColorSpace;
    this.big = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.894), new THREE.MeshBasicMaterial({ map: this.bt, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.big.visible = false; this.big.renderOrder = 996;
  }
  attach() {
    const g = this.game; g.camera.add(this.msgMesh); g.scene.add(this.promptMesh, this.big);
  }
  setObjective(t) { this.objective = t; this.needs = true; }
  setPrompt(t) { this.prompt = t; this.needs = true; this.drawPrompt(); }
  dirty() { this.needs = true; this.bigNeeds = true; }
  showMessage(t, secs) { this.msg = t; this.msgT = secs; this.drawMsg(); this.msgMesh.visible = true; }
  get bigOpen() { return this.big.visible; }

  // ---------- pannello grande ----------
  open(mode) {
    this.mode = mode; const g = this.game, cam = g.camera;
    const p = cam.getWorldPosition(new THREE.Vector3()), d = cam.getWorldDirection(new THREE.Vector3()); d.y = 0; d.normalize();
    this.big.position.set(p.x + d.x * 1.3, p.y - 0.05, p.z + d.z * 1.3);
    this.big.lookAt(p.x, p.y - 0.05, p.z);
    this.big.visible = true; this.bigNeeds = true; this.drawBig();
  }
  close() { this.big.visible = false; this.mode = null; }
  toggleInv() {
    const g = this.game, hasMap = g.state.inventory.has('map');
    if (!this.big.visible) this.open('inv');
    else if (this.mode === 'inv' && hasMap) this.open('map');
    else this.close();
  }
  showDoc(t, x) { this.docTitle = t; this.docText = x; this.open('doc'); }
  hideDoc() { if (this.mode === 'doc') this.close(); }
  showEnd(t, x) { this.endTitle = t; this.endText = x; this.open('end'); }
  hideEnd() { if (this.mode === 'end') this.close(); }
  /** Click con il raggio sul pannello grande: uv in [0,1]. */
  clickUV(u, v) {
    if (this.mode === 'doc') { this.close(); return true; }
    if (this.mode === 'end') { this.game.retry(); return true; }
    const id = this.mode === 'inv' ? this.docAt(u, v) : null;
    const d = id && this.game.state.inventory.docs.find((q) => q.id === id);
    if (d) { this.showDoc(d.title, d.text); return true; }
    return false;
  }

  drawBig() {
    const g = this.bc.getContext('2d'), G = this.game, st = G.state;
    g.clearRect(0, 0, 1024, 704);
    g.fillStyle = this.mode === 'doc' ? 'rgba(216,200,162,.97)' : 'rgba(10,6,6,.93)'; g.fillRect(0, 0, 1024, 704);
    g.strokeStyle = '#8a5a2a'; g.lineWidth = 4; g.strokeRect(2, 2, 1020, 700);
    g.textAlign = 'left'; this.rows = [];
    if (this.mode === 'inv') {
      g.fillStyle = '#ff7a1a'; g.font = 'bold 34px Georgia'; g.fillText('INVENTARIO', 30, 52);
      g.font = '40px serif';
      const inv = st.inventory;
      for (let i = 0; i < inv.capacity; i++) {
        const x = 30 + (i % 6) * 160, y = 80 + ((i / 6) | 0) * 80; g.strokeStyle = '#4a2d18'; g.lineWidth = 2; g.strokeRect(x, y, 150, 70);
        const id = inv.items[i]; if (id) { g.fillStyle = '#fff'; g.fillText(ITEMS[id].icon, x + 6, y + 50); g.font = '17px Georgia'; g.fillStyle = '#f1e3d0'; g.fillText(ITEMS[id].name.slice(0, 15), x + 52, y + 42); g.font = '40px serif'; }
      }
      g.fillStyle = '#ff7a1a'; g.font = 'bold 28px Georgia'; g.fillText('OBIETTIVI', 30, 280);
      g.font = '22px Georgia'; let y = 312;
      for (const m of G.missions.list()) { g.fillStyle = m.state === 'cur' ? '#ff7a1a' : m.state === 'done' ? '#777' : '#cbbca8'; g.fillText(`${m.state === 'done' ? '✔' : m.state === 'cur' ? '▶' : '○'} ${m.title}`, 30, y); y += 30; }
      g.fillStyle = '#f1e3d0'; g.font = '20px Georgia'; wrap(g, G.missions.objectiveText(), 30, y + 8, 960, 26, 2);
      g.fillStyle = '#ff7a1a'; g.font = 'bold 28px Georgia'; g.fillText('DIARIO (punta e premi il grilletto)', 30, 560);
      g.font = '20px Georgia'; let dy = 592;
      if (!inv.docs.length) { g.fillStyle = '#888'; g.fillText('Nessun documento.', 30, dy); }
      inv.docs.slice(0, 8).forEach((d, i) => {
        const x = 30 + (i % 2) * 490, yy = 592 + ((i / 2) | 0) * 26;
        g.fillStyle = '#d9a46b'; g.fillText(`• ${d.title.slice(0, 34)}`, x, yy);
        if (i % 2 === 0) this.rows.push({ y0: yy - 20, y1: yy + 5, doc: d.id }); else this.rows[this.rows.length - 1].alt = d.id;
      });
      g.fillStyle = '#888'; g.font = '16px Georgia'; g.fillText('B: cambia pannello / chiudi', 700, 686);
    } else if (this.mode === 'map') {
      G.hud.drawMap(g, 1024, 704);
    } else if (this.mode === 'doc') {
      g.fillStyle = '#5a2a05'; g.font = 'bold 36px Georgia'; g.fillText(this.docTitle, 36, 60);
      g.fillStyle = '#2a1d0c'; g.font = '26px Georgia';
      let y = 110; for (const para of this.docText.split('\n')) { y = para ? wrap(g, para, 36, y, 950, 34, 6) : y + 20; }
      g.fillStyle = '#5a2a05'; g.font = '18px Georgia'; g.fillText('Grilletto o B: chiudi', 36, 684);
    } else if (this.mode === 'end') {
      g.fillStyle = this.endTitle.includes('SCAPPATO') ? '#38c060' : '#c01818'; g.font = 'bold 64px Georgia'; g.textAlign = 'center'; g.fillText(this.endTitle, 512, 200);
      g.fillStyle = '#f1e3d0'; g.font = '28px Georgia'; wrap(g, this.endText, 120, 280, 790, 38, 6);
      g.fillStyle = '#ff7a1a'; g.fillText('Grilletto: riprova    Y (tieni premuto): esci dalla VR', 512, 600);
    }
    this.bt.needsUpdate = true; this.bigNeeds = false;
  }
  /** I righi del diario hanno due colonne: ritorna l'id del documento sotto l'uv. */
  docAt(u, v) {
    const x = u * 1024, y = (1 - v) * 704;
    for (const r of this.rows) if (y >= r.y0 && y <= r.y1) return x < 500 ? r.doc : r.alt;
    return null;
  }

  // ---------- pannello al polso ----------
  drawWrist() {
    const g = this.wc.getContext('2d'), G = this.game, st = G.state;
    g.clearRect(0, 0, 512, 320); g.fillStyle = 'rgba(8,5,4,.82)'; g.fillRect(0, 0, 512, 320);
    g.strokeStyle = '#8a5a2a'; g.lineWidth = 3; g.strokeRect(1, 1, 510, 318);
    g.textAlign = 'left'; g.fillStyle = '#ff7a1a'; g.font = 'bold 20px Georgia'; g.fillText('OBIETTIVO', 14, 28);
    g.fillStyle = '#f1e3d0'; g.font = '22px Georgia'; wrap(g, this.objective, 14, 58, 484, 27, 4);
    g.fillStyle = '#2a1a10'; g.fillRect(14, 180, 230, 16); g.fillStyle = st.torch.battery < 20 ? '#c03020' : '#e0a030'; g.fillRect(14, 180, 230 * (st.torch.have ? st.torch.battery : 0) / 100, 16);
    g.fillStyle = '#f1e3d0'; g.font = '14px Georgia'; g.fillText(st.torch.have ? `TORCIA ${Math.round(st.torch.battery)}% (+${st.torch.spare})` : 'NESSUNA TORCIA', 252, 193);
    g.fillStyle = '#2a1a10'; g.fillRect(14, 202, 230, 12); g.fillStyle = '#5aa05a'; g.fillRect(14, 202, 230 * G.player.stamina / 100, 12);
    g.fillStyle = '#f1e3d0'; g.fillText('RESISTENZA', 252, 213);
    g.font = '30px serif'; let x = 14, y = 262;
    for (const id of st.inventory.items) { g.fillText(ITEMS[id].icon, x, y); x += 40; if (x > 480) { x = 14; y += 38; } }
    this.wt.needsUpdate = true; this.needs = false;
  }
  drawMsg() {
    const g = this.mc.getContext('2d'); g.clearRect(0, 0, 768, 128); g.fillStyle = 'rgba(8,5,4,.8)'; g.fillRect(0, 10, 768, 108);
    g.strokeStyle = '#ff7a1a'; g.lineWidth = 3; g.strokeRect(2, 10, 764, 108); g.fillStyle = '#f1e3d0'; g.font = '28px Georgia'; g.textAlign = 'center';
    const w = this.msg.split(' '); let l1 = '', l2 = '';
    for (const t of w) { if (g.measureText(`${l1} ${t}`).width < 720 && !l2) l1 = `${l1} ${t}`.trim(); else l2 = `${l2} ${t}`.trim(); }
    if (l2) { g.fillText(l1, 384, 54); g.fillText(l2, 384, 94); } else g.fillText(l1, 384, 74);
    this.mt.needsUpdate = true;
  }
  drawPrompt() {
    if (!this.prompt) return;
    const g = this.pc.getContext('2d'); g.clearRect(0, 0, 512, 96); g.fillStyle = 'rgba(8,5,4,.85)'; g.fillRect(0, 0, 512, 96);
    g.strokeStyle = '#ff7a1a'; g.lineWidth = 3; g.strokeRect(2, 2, 508, 92); g.fillStyle = '#f1e3d0'; g.font = '26px Georgia'; g.textAlign = 'center';
    g.fillText(this.prompt.replace(/^\[E\]\s*/, '').slice(0, 38), 256, 58); this.pt.needsUpdate = true;
  }
  showPromptAt(point) {
    if (!point || !this.prompt) { this.promptMesh.visible = false; return; }
    this.promptMesh.position.copy(point); this.promptMesh.position.y += 0.2; this.promptMesh.visible = true;
  }

  update(dt) {
    this.acc += dt;
    if (this.needs && this.acc > 0.2) { this.acc = 0; this.drawWrist(); }
    if (this.bigNeeds && this.big.visible && (this.mode === 'inv')) this.drawBig();
    if (this.big.visible && this.mode === 'map') this.drawBig();
    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) this.msgMesh.visible = false; }
  }
}
