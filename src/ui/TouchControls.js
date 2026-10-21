// Controlli touch per telefoni/tablet: stick virtuale (sinistra), trascinamento per guardare (destra) e pulsanti.
// Attivi solo su dispositivi touch e solo in modalità PC. Sfruttano gli stessi sistemi di tastiera/mouse.
export const isTouchDevice = () => (typeof window !== 'undefined') && (('ontouchstart' in window) || navigator.maxTouchPoints > 0) && matchMedia('(pointer: coarse)').matches;

export class TouchControls {
  constructor(game) {
    this.game = game; this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 }; this.look = { id: null, x: 0, y: 0 };
    this.run = false; this.crouch = false;
    game.player.touch = { x: 0, y: 0, run: false, crouch: false };
    this.build();
  }
  build() {
    const st = document.createElement('style');
    st.textContent = `
#touch{position:fixed;inset:0;z-index:15;display:none;touch-action:none;-webkit-user-select:none;user-select:none}
#touch .zone{position:absolute;top:0;bottom:0;touch-action:none}
#touch .zl{left:0;width:42%}#touch .zr{right:0;width:58%}
#touch .base{position:absolute;width:120px;height:120px;margin:-60px 0 0 -60px;border:2px solid rgba(255,140,40,.55);border-radius:50%;background:rgba(0,0,0,.25);display:none}
#touch .knob{position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;background:rgba(255,140,40,.55)}
#touch .btn{position:absolute;width:62px;height:62px;border-radius:50%;border:2px solid rgba(255,140,40,.6);background:rgba(10,6,4,.55);color:#f1e3d0;font:600 13px Georgia,serif;display:flex;align-items:center;justify-content:center;touch-action:none}
#touch .btn.on{background:rgba(255,120,20,.55)}
#touch .small{width:44px;height:44px;font-size:18px}`;
    document.head.appendChild(st);
    const root = this.root = document.createElement('div'); root.id = 'touch';
    root.innerHTML = '<div class="zone zl"><div class="base"><div class="knob"></div></div></div><div class="zone zr"></div>';
    const btn = (label, css, cls = '') => { const b = document.createElement('div'); b.className = `btn ${cls}`; b.style.cssText = css; b.textContent = label; root.appendChild(b); return b; };
    const tap = (b, fn) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fn(b); });
    const hold = (b, set) => { b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); set(true); b.classList.add('on'); }); const up = () => { set(false); b.classList.remove('on'); }; b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up); };
    const g = this.game;
    tap(btn('E', 'right:26px;bottom:110px;width:76px;height:76px;font-size:24px'), () => g.interaction.useCurrent());
    tap(btn('🔦', 'right:116px;bottom:50px'), () => g.toggleTorch());
    const run = btn('CORRI', 'left:20px;bottom:170px;font-size:11px'); hold(run, (v) => { this.run = v; });
    const cr = btn('▼', 'left:90px;bottom:170px;font-size:20px', 'small'); tap(cr, () => { this.crouch = !this.crouch; cr.classList.toggle('on', this.crouch); });
    tap(btn('🎒', 'right:26px;top:70px', 'small'), () => (g.panelOpen ? g.closePanel() : g.openPanel()));
    tap(btn('🗺', 'right:80px;top:70px', 'small'), () => g.hud.toggleMap());
    tap(btn('⏸', 'right:134px;top:70px', 'small'), () => g.pause());
    document.body.appendChild(root);
    this.base = root.querySelector('.base'); this.knob = root.querySelector('.knob');
    const zl = root.querySelector('.zl'), zr = root.querySelector('.zr');
    zl.addEventListener('pointerdown', (e) => {
      if (this.stick.id !== null) return; zl.setPointerCapture(e.pointerId);
      Object.assign(this.stick, { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 });
      this.base.style.display = 'block'; this.base.style.left = `${e.clientX}px`; this.base.style.top = `${e.clientY}px`; this.knob.style.transform = '';
    });
    zl.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stick.id) return;
      let dx = e.clientX - this.stick.ox, dy = e.clientY - this.stick.oy; const m = Math.hypot(dx, dy), R = 55;
      if (m > R) { dx = dx / m * R; dy = dy / m * R; }
      this.stick.x = dx / R; this.stick.y = dy / R; this.knob.style.transform = `translate(${dx}px,${dy}px)`;
    });
    const endStick = (e) => { if (e.pointerId !== this.stick.id) return; this.stick.id = null; this.stick.x = this.stick.y = 0; this.base.style.display = 'none'; };
    zl.addEventListener('pointerup', endStick); zl.addEventListener('pointercancel', endStick);
    zr.addEventListener('pointerdown', (e) => { if (this.look.id !== null) return; zr.setPointerCapture(e.pointerId); this.look = { id: e.pointerId, x: e.clientX, y: e.clientY }; });
    zr.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.look.id) return;
      const p = this.game.player, s = 0.005 * (window.__sens || 1) * (this.game.sensitivity ?? 1), dx = e.clientX - this.look.x, dy = e.clientY - this.look.y;
      this.look.x = e.clientX; this.look.y = e.clientY;
      if (this.game.phase !== 'playing') return;
      if (p.game.car.driving) p.carLook = Math.max(-1.4, Math.min(1.4, p.carLook - dx * s)); else p.yaw -= dx * s;
      p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch - dy * s));
    });
    const endLook = (e) => { if (e.pointerId === this.look.id) this.look.id = null; };
    zr.addEventListener('pointerup', endLook); zr.addEventListener('pointercancel', endLook);
  }
  update() {
    const g = this.game, show = g.phase === 'playing' && !g.vrActive && !g.panelOpen;
    this.root.style.display = show ? 'block' : 'none';
    if (!show) { this.stick.x = this.stick.y = 0; }
    const p = g.player, t = p.touch, k = p.keys;
    if (g.car.driving) { // in auto: lo stick diventa acceleratore/sterzo tramite i tasti virtuali
      t.x = 0; t.y = 0; k.KeyW = this.stick.y < -0.35; k.KeyS = this.stick.y > 0.35; k.KeyD = this.stick.x > 0.35; k.KeyA = this.stick.x < -0.35;
      t.run = false; t.crouch = false; k.Space = this.run;
    } else { t.x = this.stick.x; t.y = this.stick.y; t.run = this.run; t.crouch = this.crouch; if (this.touchKeys) { k.KeyW = k.KeyS = k.KeyA = k.KeyD = false; } }
    this.touchKeys = g.car.driving;
  }
}
