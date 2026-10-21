// Salvataggio su localStorage: salva l'intero stato coerente (flag del mondo, inventario, missione,
// diario, torcia, posizioni), non soltanto il numero della missione.
const KEY = 'hn_save_v1';
const VERSION = 1;

export class SaveManager {
  hasSave() {
    try { return !!localStorage.getItem(KEY); } catch { return false; }
  }
  save(game) {
    const s = game.state;
    // Non si salva durante la fuga in auto: lo stato "alla guida" non è ripristinabile in modo coerente.
    if (game.car?.driving || s.flag('engine_on')) return false;
    const p = game.player.getBodyPos();
    const k = game.killer.pos;
    const data = {
      v: VERSION,
      difficulty: s.difficulty,
      flags: s.flags,
      missionIndex: s.missionIndex,
      inventory: s.inventory.items,
      docs: s.inventory.docs.map((d) => d.id),
      torch: s.torch,
      playTime: s.playTime,
      player: { x: p.x, z: p.z, yaw: game.player.yaw },
      killer: { x: k.x, z: k.z },
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn('[Save] scrittura fallita', e);
      return false;
    }
  }
  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!raw || raw.v !== VERSION) return null;
      return raw;
    } catch (e) {
      console.warn('[Save] lettura fallita', e);
      return null;
    }
  }
  clear() { try { localStorage.removeItem(KEY); } catch { /* ignora */ } }
}
