import { Inventory } from '../inventory/Inventory.js';

// Stato serializzabile della partita: flag del mondo, inventario, torcia, missione.
export class GameState {
  constructor(game) { this.game = game; this.reset('normal'); }
  reset(difficulty = 'normal') {
    this.difficulty = difficulty;
    this.flags = {};
    this.missionIndex = 0;
    this.inventory = this.inventory || new Inventory();
    this.inventory.clear();
    this.torch = { have: false, on: false, battery: 100, spare: 0 };
    this.playTime = 0;
  }
  flag(k) { return !!this.flags[k]; }
  setFlag(k, v = true) {
    if (!!this.flags[k] === !!v && k in this.flags) return;
    this.flags[k] = v;
    this.game.onFlagChanged?.(k, v);
  }
}
