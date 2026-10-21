import { CAR_SPOT } from '../world/WorldData.js';

// Le 7 missioni. Ogni missione ha prerequisiti (le precedenti), un testo obiettivo dinamico e una
// condizione di completamento VERIFICABILE sullo stato reale (flag e inventario): nessuna missione
// si completa con un semplice contatore.
const nearCar = (g) => {
  const p = g.player.getBodyPos();
  return Math.hypot(p.x - CAR_SPOT.x, p.z - CAR_SPOT.z) < 6;
};

export const MISSIONS = [
  {
    id: 'night', title: 'Sopravvivere alla prima notte', requires: [],
    objective: (g) => {
      const s = g.state;
      if (!s.torch.have) return 'Trova una torcia nella casa abbandonata davanti a te.';
      if (!s.flag('killer_intro')) return 'Premi F per accendere la torcia. Resta vicino alla casa e ascolta…';
      if (!s.flag('hid_once')) return 'Qualcuno si avvicina! Nasconditi in un armadio o in un cassonetto (E).';
      return 'Resta immobile finché i passi si allontanano.';
    },
    done: (g) => { const s = g.state; return s.torch.have && s.flag('killer_intro') && s.flag('hid_once') && s.flag('intro_done'); },
  },
  {
    id: 'keys', title: 'Trovare le chiavi dell\'auto', requires: ['night'],
    objective: (g) => {
      const s = g.state;
      if (!s.flag('unlocked_rh')) return s.inventory.has('house_key')
        ? 'Usa la chiave di scorta sulla porta della casa dei Miller.'
        : 'La casa dei Miller è chiusa. Cerca la chiave di scorta nel vicolo dietro la casa abbandonata.';
      return 'Cerca le chiavi dell\'auto nel mobile del soggiorno dei Miller (apri il cassetto).';
    },
    done: (g) => g.state.inventory.has('car_keys'),
  },
  {
    id: 'fuel', title: 'Recuperare la benzina', requires: ['keys'],
    objective: (g) => {
      const s = g.state, inv = s.inventory;
      if (inv.has('jerrycan_full')) return 'Versa la benzina nel serbatoio dell\'auto (parcheggio).';
      if (inv.has('jerrycan')) return 'Riempi la tanica alla pompa della stazione di servizio.';
      if (s.flag('gs_opened') || s.flag('unlocked_gs')) return 'Prendi la tanica nel negozio della stazione di servizio.';
      if (inv.has('shop_key')) return 'Apri il negozio della stazione di servizio con la chiave.';
      return 'Trova la chiave del negozio: il cassiere l\'ha nascosta nel supermercato.';
    },
    done: (g) => g.state.flag('fuel_added'),
  },
  {
    id: 'battery', title: 'Ripristinare la batteria', requires: ['fuel'],
    objective: (g) => {
      const s = g.state, inv = s.inventory;
      if (inv.has('battery')) return 'Porta la batteria fino all\'auto.';
      if (!s.flag('garage_powered')) return inv.has('fuse')
        ? 'Inserisci il fusibile nella cassetta accanto all\'officina.'
        : 'L\'officina è senza corrente: il fusibile è nel capanno nel bosco.';
      return 'Prendi una batteria carica sul bancone dell\'officina.';
    },
    done: (g) => g.state.flag('battery_installed') || (g.state.inventory.has('battery') && nearCar(g)),
  },
  {
    id: 'repair', title: 'Riparare il veicolo', requires: ['battery'],
    objective: (g) => {
      const s = g.state, inv = s.inventory;
      if (!s.flag('battery_installed')) {
        if (!inv.has('wrench')) return 'Ti serve una chiave inglese (supermercato) per fissare i morsetti.';
        return 'Apri il cofano e installa la batteria.';
      }
      if (!inv.has('cables')) return 'Prendi i cavi elettrici nell\'officina.';
      return 'Collega i cavi alla batteria (cofano).';
    },
    done: (g) => g.state.flag('battery_installed') && g.state.flag('cables_connected'),
  },
  {
    id: 'gate', title: 'Aprire la strada', requires: ['repair'],
    objective: (g) => (g.state.inventory.has('gate_key')
      ? 'Usa la chiave sul pannello di controllo del cancello (a est).'
      : 'Trova la chiave del cancello: armadietto della stazione di polizia.'),
    done: (g) => g.state.flag('gate_open'),
  },
  {
    id: 'escape', title: 'Fuggire', requires: ['gate'],
    objective: (g) => {
      if (g.state.flag('engine_on')) return 'GUIDA! Raggiungi l\'uscita a est prima che ti prenda!';
      const m = g.car.missing();
      return m.length ? `Torna all'auto: ${m[0]}.` : 'Sali in auto e avvia il motore.';
    },
    done: (g) => g.state.flag('escaped'),
  },
];

export class MissionManager {
  constructor(game) { this.game = game; this.acc = 0; this._busy = false; this.lastText = ''; }
  get index() { return this.game.state.missionIndex; }
  get current() { return MISSIONS[this.index] || null; }

  objectiveText() {
    const m = this.current;
    return m ? m.objective(this.game) : 'Sei libero.';
  }

  /** Verifica le condizioni e avanza finché la missione corrente non è soddisfatta. */
  check(silent = false) {
    if (this._busy) return;
    this._busy = true;
    try {
      const g = this.game;
      let guard = 0;
      while (this.current && this.current.done(g) && guard++ < 10) {
        const m = this.current;
        g.state.missionIndex++;
        if (!silent) {
          g.msg(`Missione completata: ${m.title}`, 4200);
          g.audio?.ui?.('mission');
        }
        if (!silent && g.state.missionIndex < MISSIONS.length) g.saveGame(true);
      }
      this.refresh();
    } finally { this._busy = false; }
  }
  refresh() {
    const t = this.objectiveText();
    if (t !== this.lastText) { this.lastText = t; this.game.hud?.setObjective(t); }
  }
  update(dt) {
    this.acc += dt;
    if (this.acc < 0.4) return;
    this.acc = 0;
    this.check();
  }
  /** Elenco per il pannello obiettivi. */
  list() {
    return MISSIONS.map((m, i) => ({ id: m.id, title: m.title, state: i < this.index ? 'done' : i === this.index ? 'cur' : 'todo' }));
  }
}
