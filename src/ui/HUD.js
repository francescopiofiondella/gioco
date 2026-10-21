import { settings } from '../config/Settings.js';
import { ITEMS } from '../inventory/Inventory.js';
import { MISSIONS } from '../missions/MissionManager.js';
import { BOUNDS, BUILDINGS, CAR_SPOT, GATE } from '../world/WorldData.js';

const $ = (id) => document.getElementById(id);

// HUD HTML/CSS per PC. In VR gli stessi messaggi vengono inoltrati al pannello 3D (this.vr).
export class HUD {
  constructor(game) {
    this.game = game; this.vr = null;
    this.el = { hud: $('hud'), obj: $('obj-text'), prompt: $('prompt'), toast: $('toast'), torch: $('torch-bar'), torchLbl: $('torch-label'),
      stam: $('stam-bar'), quick: $('quickinv'), hidden: $('hidden-tag'), car: $('car-hud'), vig: $('vignette'), flash: $('flash'),
      inv: $('panel-inv'), slots: $('inv-slots'), missions: $('mission-list'), docs: $('doc-list'), docView: $('doc-viewer'),
      docTitle: $('doc-title'), docBody: $('doc-body') };
    this.toastT = 0; this.flashV = 0; this.lastPrompt = null; this.dbg = null;
    this.buildMap();
    this.applyScale();
    game.state.inventory.onChange(() => this.renderQuick());
    if (new URLSearchParams(location.search).has('debug')) {
      this.dbg = document.createElement('div');
      this.dbg.style.cssText = 'position:absolute;top:70px;left:22px;font:12px monospace;color:#8f8;text-shadow:0 0 3px #000;white-space:pre';
      this.el.hud.appendChild(this.dbg);
    }
  }
  applyScale() { document.documentElement.style.setProperty('--hud-scale', settings.hudScale); }
  show(on) { this.el.hud.classList.toggle('hidden', !on); }

  setObjective(t) { this.el.obj.textContent = t; this.vr?.setObjective(t); }
  setPrompt(t) {
    if (t === this.lastPrompt) return;
    this.lastPrompt = t;
    this.el.prompt.textContent = t || ''; this.el.prompt.classList.toggle('on', !!t);
    this.vr?.setPrompt(t);
  }
  toast(t, ms = 3200) {
    this.el.toast.textContent = t; this.el.toast.classList.add('on'); this.toastT = ms / 1000;
    this.vr?.showMessage(t, ms / 1000);
  }
  flash(a = 0.4) { this.flashV = Math.max(this.flashV, a); }
  setCarSpeed(kmh) { this.el.car.style.display = 'block'; this.el.car.textContent = `${Math.round(kmh)} km/h`; }
  hideCar() { this.el.car.style.display = 'none'; }
  setHidden(on) { this.el.hidden.style.display = on ? 'block' : 'none'; }
  setFear(v) { if (!this.game.vrActive) this.el.vig.style.opacity = String(Math.min(0.85, v)); }

  renderQuick() {
    const st = this.game.state, inv = st.inventory;
    let html = '';
    for (let i = 0; i < inv.capacity; i++) {
      const id = inv.items[i], d = id && ITEMS[id];
      html += d ? `<div class="slot" title="${d.name}">${d.icon}<small>${d.name.split(' ')[0]}</small></div>` : '<div class="slot empty"></div>';
    }
    if (st.torch.spare > 0) html += `<div class="slot" title="Pile di riserva">🔋<small>x${st.torch.spare}</small></div>`;
    this.el.quick.innerHTML = html;
    this.vr?.dirty();
  }
  renderPanel() {
    const st = this.game.state, inv = st.inventory;
    let h = '';
    for (let i = 0; i < inv.capacity; i++) {
      const id = inv.items[i], d = id && ITEMS[id];
      h += d ? `<div class="slot" title="${d.desc}">${d.icon}<small>${d.name.split(' ')[0]}</small></div>` : '<div class="slot empty"></div>';
    }
    if (st.torch.spare > 0) h += `<div class="slot">🔋<small>Pile x${st.torch.spare}</small></div>`;
    this.el.slots.innerHTML = h;
    this.el.missions.innerHTML = this.game.missions.list().map((m) => `<div class="${m.state}">${m.state === 'done' ? '✔' : m.state === 'cur' ? '▶' : '○'} ${m.title}</div>`).join('')
      + `<div style="margin-top:6px;opacity:.85">${this.game.missions.objectiveText()}</div>`;
    this.el.docs.innerHTML = inv.docs.length ? '' : '<i style="opacity:.6">Nessun documento raccolto.</i>';
    for (const d of inv.docs) {
      const b = document.createElement('button'); b.textContent = d.title; b.onclick = () => this.showDoc(d.id, true); this.el.docs.appendChild(b);
    }
  }
  openPanel() { this.renderPanel(); this.el.inv.classList.remove('hidden'); }
  closePanel() { this.el.inv.classList.add('hidden'); this.el.docView.classList.add('hidden'); }
  showDoc(id, fromPanel = false) {
    const d = this.game.state.inventory.docs.find((x) => x.id === id);
    if (!d) return;
    this.el.docTitle.textContent = d.title; this.el.docBody.textContent = d.text;
    this.el.docView.classList.remove('hidden');
    this.docFromPanel = fromPanel;
    this.vr?.showDoc(d.title, d.text);
  }
  closeDoc() { this.el.docView.classList.add('hidden'); this.vr?.hideDoc(); }
  docOpen() { return !this.el.docView.classList.contains('hidden'); }

  showEnd(win, text) {
    const e = $('end-screen'); e.classList.toggle('win', win);
    $('end-title').textContent = win ? 'SEI SCAPPATO' : 'SEI MORTO';
    $('end-text').textContent = text; e.classList.remove('hidden');
    this.vr?.showEnd(win ? 'SEI SCAPPATO' : 'SEI STATO CATTURATO', text);
  }
  hideEnd() { $('end-screen').classList.add('hidden'); this.vr?.hideEnd(); }

  // ---------- mappa (oggetto "Mappa") ----------
  buildMap() {
    const c = this.mapCanvas = document.createElement('canvas'); c.width = 560; c.height = 400;
    c.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border:2px solid #6a4020;display:none;background:#1a140c;max-width:92vw';
    this.el.hud.appendChild(c); this.mapOpen = false;
  }
  toggleMap() {
    if (!this.game.state.inventory.has('map')) { this.game.msg('Non hai una mappa.'); return; }
    this.mapOpen = !this.mapOpen; this.mapCanvas.style.display = this.mapOpen ? 'block' : 'none';
    if (this.mapOpen) this.drawMap(this.mapCanvas.getContext('2d'), 560, 400);
  }
  /** Disegna la mappa su un contesto 2D (usato anche dal pannello VR). */
  drawMap(g, W, H) {
    const B = BOUNDS, sx = (W - 20) / (B.maxX - B.minX + 12), sz = (H - 20) / (B.maxZ - B.minZ), X = (x) => 10 + (x - B.minX) * sx, Z = (z) => 10 + (z - B.minZ) * sz;
    g.fillStyle = '#1a140c'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#2a2a2e'; g.fillRect(X(B.minX), Z(-3), (B.maxX + 12 - B.minX) * sx, 6 * sz);
    g.fillStyle = '#3a2a1a'; g.fillRect(X(-43.5), Z(-32), 3 * sx, 22 * sz);
    g.font = '10px Georgia'; g.textAlign = 'center';
    for (const b of BUILDINGS) {
      g.fillStyle = b.ruin ? '#6d5a3a' : '#7a6a50'; g.fillRect(X(b.x - b.w / 2), Z(b.z - b.d / 2), b.w * sx, b.d * sz);
      g.fillStyle = '#e8dcc0'; g.fillText(b.name, X(b.x), Z(b.z + b.d / 2) + 11);
    }
    g.fillStyle = '#c03030'; g.fillRect(X(CAR_SPOT.x) - 4, Z(CAR_SPOT.z) - 6, 8, 12); g.fillStyle = '#e8dcc0'; g.fillText('AUTO', X(CAR_SPOT.x), Z(CAR_SPOT.z) + 18);
    g.fillStyle = '#38c060'; g.fillRect(X(GATE.x) - 2, Z(-GATE.half), 4, GATE.half * 2 * sz); g.fillText('USCITA', X(GATE.x) - 10, Z(GATE.half) + 14);
    const p = this.game.player.getBodyPos(), yaw = this.game.vrActive ? this.game.player.rig.rotation.y : this.game.player.yaw;
    g.save(); g.translate(X(p.x), Z(p.z)); g.rotate(-yaw); g.fillStyle = '#ffd040'; g.beginPath(); g.moveTo(0, -8); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath(); g.fill(); g.restore();
  }

  update(dt) {
    const g = this.game, st = g.state;
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.el.toast.classList.remove('on'); }
    if (this.flashV > 0) { this.flashV = Math.max(0, this.flashV - dt * 1.6); this.el.flash.style.opacity = String(this.flashV); }
    const t = st.torch;
    this.el.torch.style.width = `${t.have ? t.battery : 0}%`;
    this.el.torch.style.background = t.battery < 20 ? '#c03020' : '#e0a030';
    this.el.torchLbl.textContent = t.have ? `TORCIA ${Math.round(t.battery)}%${t.spare ? ` (+${t.spare})` : ''}` : 'NESSUNA TORCIA';
    this.el.stam.style.width = `${g.player.stamina}%`;
    this.setHidden(!!g.player.hiding);
    if (this.mapOpen) this.drawMap(this.mapCanvas.getContext('2d'), 560, 400);
    if (this.dbg) this.dbg.textContent = `killer: ${g.killer.state}${g.killer.final ? ' (final)' : ''}\nalert: ${g.killer.alert.toFixed(2)} vis: ${g.killer.visible}\nmission: ${st.missionIndex}\ndraw calls: ${g.renderer.info.render.calls} tri: ${g.renderer.info.render.triangles}\nluminosità: ${settings.brightness}`;
  }
}
