import { DOCS } from '../world/WorldData.js';

// Definizione di tutti gli oggetti di gioco. noSlot: non occupa uno slot (le pile sono contate a parte).
// twoHands: richiede entrambe le mani (non si può correre, e non se ne possono portare due insieme).
export const ITEMS = {
  torch:         { name: 'Torcia', icon: '🔦', desc: 'Illumina il buio. La batteria si consuma.' },
  torch_cell:    { name: 'Pila per la torcia', icon: '🔋', desc: 'Ricarica la torcia quando si scarica.', noSlot: true },
  house_key:     { name: 'Chiave di scorta (Miller)', icon: '🗝️', desc: 'Apre la casa dei Miller.' },
  car_keys:      { name: 'Chiavi dell\'auto', icon: '🔑', desc: 'Servono per avviare l\'auto.' },
  shop_key:      { name: 'Chiave del negozio', icon: '🗝️', desc: 'Apre la stazione di servizio.' },
  gate_key:      { name: 'Chiave del cancello', icon: '🔐', desc: 'Attiva il pannello del cancello.' },
  map:           { name: 'Mappa della città', icon: '🗺️', desc: 'Premi M per consultarla.' },
  wrench:        { name: 'Chiave inglese', icon: '🔧', desc: 'Serve a fissare i morsetti della batteria.' },
  jerrycan:      { name: 'Tanica vuota', icon: '🛢️', desc: 'Va riempita alla pompa.' },
  jerrycan_full: { name: 'Tanica piena', icon: '⛽', desc: 'Pesante: niente corsa.', twoHands: true },
  fuse:          { name: 'Fusibile', icon: '⚡', desc: 'Ripristina la corrente dell\'officina.' },
  battery:       { name: 'Batteria', icon: '🔋', desc: 'Pesante: niente corsa.', twoHands: true },
  cables:        { name: 'Cavi elettrici', icon: '🔌', desc: 'Collegano la batteria al motore.' },
};

// 11 oggetti-missione al massimo possono essere in mano insieme (jerrycan e jerrycan_full si escludono):
// 12 slot garantiscono che nessun oggetto indispensabile resti irraggiungibile (niente soft-lock).
export const CAPACITY = 12;

export class Inventory {
  constructor() { this.items = []; this.docs = []; this.capacity = CAPACITY; this.listeners = []; }
  onChange(fn) { this.listeners.push(fn); }
  _emit() { for (const f of this.listeners) f(); }
  has(id) { return this.items.includes(id); }
  isFull() { return this.items.length >= this.capacity; }
  heavy() { return this.items.some((i) => ITEMS[i]?.twoHands); }
  /** @returns {boolean} false se non c'è spazio */
  add(id) {
    if (!ITEMS[id]) { console.warn('[Inventory] oggetto sconosciuto', id); return false; }
    if (this.has(id)) return true;
    if (this.isFull()) return false;
    this.items.push(id); this._emit(); return true;
  }
  remove(id) {
    const i = this.items.indexOf(id);
    if (i < 0) return false;
    this.items.splice(i, 1); this._emit(); return true;
  }
  hasDoc(id) { return this.docs.some((d) => d.id === id); }
  addDoc(id) {
    const def = DOCS[id];
    if (!def) { console.warn('[Inventory] documento sconosciuto', id); return false; }
    if (!this.hasDoc(id)) { this.docs.push({ id, title: def.title, text: def.text }); this._emit(); }
    return true;
  }
  load(items, docIds) {
    this.items = (items || []).filter((i) => ITEMS[i]);
    this.docs = [];
    for (const id of docIds || []) if (DOCS[id]) this.docs.push({ id, title: DOCS[id].title, text: DOCS[id].text });
    this._emit();
  }
  clear() { this.items = []; this.docs = []; this._emit(); }
}
