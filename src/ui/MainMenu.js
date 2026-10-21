import { settings, saveSettings, DEFAULTS } from '../config/Settings.js';

const $ = (id) => document.getElementById(id);

// Menu iniziale, impostazioni, comandi, crediti, pausa e schermata finale: tutti i pulsanti sono collegati.
export class MainMenu {
  constructor(game) {
    this.game = game;
    this.bindModals(); this.bindSettings(); this.bindMenu(); this.bindPause();
  }
  show(id) { $(id).classList.remove('hidden'); }
  hide(id) { $(id).classList.add('hidden'); }

  showMenu() {
    this.hide('loading'); this.show('main-menu');
    $('btn-continue').disabled = !this.game.save.hasSave();
    this.game.hud.show(false);
    this.refreshVR();
  }
  async refreshVR() {
    const ok = await this.game.vr.detect();
    $('btn-vr').classList.toggle('hidden', !ok);
    $('menu-note').textContent = ok ? 'WebXR rilevato: puoi giocare in VR.' : 'WebXR (immersive-vr) non disponibile: il gioco funziona in modalità PC.';
  }

  bindModals() {
    document.querySelectorAll('.modal .close').forEach((b) => {
      b.addEventListener('click', () => {
        const m = b.closest('.modal');
        if (m.id === 'panel-inv') { this.game.closePanel(); return; }
        if (m.id === 'doc-viewer') { this.game.closeDoc(); return; }
        m.classList.add('hidden');
      });
    });
    $('btn-settings').onclick = () => this.show('modal-settings');
    $('btn-controls').onclick = () => this.show('modal-controls');
    $('btn-credits').onclick = () => this.show('modal-credits');
  }

  bindSettings() {
    const g = this.game;
    const sliders = [['set-master', 'master'], ['set-sfx', 'sfx'], ['set-music', 'music'], ['set-sens', 'sensitivity'], ['set-bright', 'brightness'],
      ['set-fov', 'fov'], ['set-hud', 'hudScale'], ['set-vr-snap', 'vrSnap'], ['set-vr-vigstr', 'vrVigStr']];
    const selects = [['set-quality', 'quality'], ['set-vr-loco', 'vrLoco'], ['set-vr-turn', 'vrTurn']];
    const checks = [['set-rain', 'rain'], ['set-vr-vig', 'vrVig']];
    const apply = () => { saveSettings(); g.applySettings(); };
    for (const [id, k] of sliders) { const e = $(id); e.value = settings[k]; e.addEventListener('input', () => { settings[k] = parseFloat(e.value); apply(); }); }
    for (const [id, k] of selects) {
      const e = $(id); e.value = settings[k];
      e.addEventListener('change', () => { settings[k] = e.value; apply(); if (k === 'quality') g.msg('La qualità si applica completamente al riavvio della pagina.'); });
    }
    for (const [id, k] of checks) { const e = $(id); e.checked = !!settings[k]; e.addEventListener('change', () => { settings[k] = e.checked; apply(); }); }
    void DEFAULTS;
  }

  bindMenu() {
    const g = this.game, mode = () => $('sel-mode').value, diff = () => $('sel-diff').value;
    $('btn-new').onclick = () => this.start({ mode: mode(), difficulty: diff(), load: false });
    $('btn-continue').onclick = () => this.start({ mode: mode(), load: true });
    $('btn-vr').onclick = () => { $('sel-mode').value = 'vr'; this.start({ mode: 'vr', difficulty: diff(), load: false }); };
    void g;
  }
  /** Avvio da un click: pointer lock e sessione VR richiedono un gesto dell'utente. */
  async start(opts) {
    const g = this.game;
    if (opts.mode === 'vr' && !g.vr.supported) {
      $('menu-note').textContent = 'WebXR non disponibile in questo browser: avvio in modalità PC.'; opts.mode = 'pc';
    }
    this.hide('main-menu'); this.hide('end-screen');
    try { await g.startGame(opts); } catch (e) {
      console.error('[Menu] avvio fallito', e);
      this.show('main-menu'); $('menu-note').textContent = `Errore: ${e.message}`;
    }
  }

  bindPause() {
    const g = this.game;
    $('btn-resume').onclick = () => g.resume();
    $('btn-save').onclick = () => g.msg(g.saveGame() ? 'Partita salvata.' : 'Impossibile salvare in questo momento.');
    $('btn-pause-settings').onclick = () => this.show('modal-settings');
    $('btn-pause-controls').onclick = () => this.show('modal-controls');
    $('btn-quit').onclick = () => g.quitToMenu();
    $('btn-retry').onclick = () => g.retry();
    $('btn-end-menu').onclick = () => g.quitToMenu();
  }
}
