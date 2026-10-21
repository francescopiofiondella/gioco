// Dati puri della mappa (nessuna dipendenza da DOM/Three): edifici, oggetti, nascondigli, waypoint, testi.
// Convenzioni: asse +x = est, +z = sud. La strada corre lungo x con z in [-3, 3].
export const BOUNDS = { minX: -60, maxX: 52, minZ: -44, maxZ: 44 };
export const SPAWN = { x: -50, z: -5.5, yaw: 0 };
export const GATE = { x: 52, half: 3.9, panel: { x: 50.4, z: 4.6 }, exitX: 57 };
export const CAR_SPOT = { x: -29, z: 9.5, yaw: 0 };
export const PUMP = { x: 28, z: -6.2 };
export const FUSE_BOX = { x: 35.2, z: 9.35 };

// door: lato della porta ('n' = faccia nord z0, 's' = faccia sud z1). lock: oggetto-chiave o 'power'.
export const BUILDINGS = [
  { id: 'ah',     name: 'Casa abbandonata',      x: -50, z: -14, w: 10, d: 8, door: 's', color: 0x6d6252, ruin: true, lit: false },
  { id: 'rh',     name: 'Casa dei Miller',       x: -34, z: -14, w: 10, d: 8, door: 's', color: 0x4f6a85, lock: 'house_key', lit: true },
  { id: 'sm',     name: 'Supermercato',          x: -16, z: -14, w: 14, d: 9, door: 's', color: 0x8a7f6a, lit: true },
  { id: 'ps',     name: 'Stazione di polizia',   x: 4,   z: -14, w: 12, d: 9, door: 's', color: 0x4a5568, lit: true },
  { id: 'gs',     name: 'Stazione di servizio',  x: 26,  z: -14, w: 8,  d: 7, door: 's', color: 0x7a3b2e, lock: 'shop_key', lit: false },
  { id: 'h2',     name: 'Casa abbandonata Sud',  x: -8,  z: 14,  w: 9,  d: 8, door: 'n', color: 0x5d5448, ruin: true, lit: false },
  { id: 'h3',     name: 'Casa dei Walker',       x: 10,  z: 14,  w: 9,  d: 8, door: 'n', color: 0x7a5a4a, lit: true },
  { id: 'garage', name: 'Officina',              x: 30,  z: 14,  w: 12, d: 9, door: 'n', color: 0x555a5e, lock: 'power', lit: false },
  { id: 'shed',   name: 'Capanno nel bosco',     x: -42, z: -36, w: 5,  d: 5, door: 's', color: 0x4a3a28, h: 2.8, lit: false },
];

// Arredi con collisione. Il campo b = id dell'edificio (solo per documentazione).
export const FURNITURE = [
  { b: 'ah', x: -52, z: -16, w: 1.4, d: 0.9, h: 0.8, c: 0x5a4430 },
  { b: 'ah', x: -47.5, z: -17.4, w: 1.3, d: 0.5, h: 0.9, c: 0x4a3828 },
  { b: 'ah', x: -47, z: -11.2, w: 1.0, d: 2.0, h: 0.5, c: 0x5a5048 },
  { b: 'rh', x: -31.5, z: -15.2, w: 1.4, d: 0.9, h: 0.8, c: 0x6a4a30 },
  { b: 'rh', x: -37, z: -12, w: 2.0, d: 0.9, h: 0.75, c: 0x5a3a3a },
  { b: 'rh', x: -37.5, z: -17.2, w: 0.8, d: 0.5, h: 0.8, c: 0x6a4a30 },
  { b: 'sm', x: -19, z: -16.6, w: 3.0, d: 0.6, h: 1.7, c: 0x7a7a6a },
  { b: 'sm', x: -13.5, z: -16.6, w: 3.0, d: 0.6, h: 1.7, c: 0x7a7a6a },
  { b: 'sm', x: -17, z: -13.2, w: 2.4, d: 0.6, h: 1.5, c: 0x7a7a6a },
  { b: 'sm', x: -11.5, z: -11.8, w: 3.0, d: 0.8, h: 1.0, c: 0x6a5a48 },
  { b: 'sm', x: -21.5, z: -12, w: 1.0, d: 0.6, h: 0.8, c: 0x6a5a48 },
  { b: 'ps', x: 2, z: -14, w: 2.0, d: 1.0, h: 0.8, c: 0x4a4a4a },
  { b: 'ps', x: 0.5, z: -17.5, w: 1.0, d: 0.6, h: 0.8, c: 0x4a4a4a },
  { b: 'ps', x: 8, z: -17.6, w: 1.0, d: 0.5, h: 1.9, c: 0x3a4048 },
  { b: 'gs', x: 24, z: -17.2, w: 2.0, d: 0.5, h: 1.7, c: 0x6a5a48 },
  { b: 'gs', x: 28, z: -12.7, w: 0.9, d: 0.6, h: 0.8, c: 0x6a5a48 },
  { b: 'garage', x: 27.5, z: 17.4, w: 3.5, d: 0.8, h: 0.9, c: 0x4a4038 },
  { b: 'garage', x: 33, z: 12.5, w: 1.0, d: 0.6, h: 0.8, c: 0x4a4038 },
  { b: 'h2', x: -9, z: 16.5, w: 1.2, d: 0.8, h: 0.8, c: 0x5a4430 },
  { b: 'h3', x: 9.5, z: 16.5, w: 1.2, d: 0.8, h: 0.8, c: 0x6a4a30 },
  { b: 'shed', x: -42, z: -37.3, w: 1.6, d: 0.7, h: 0.85, c: 0x5a4430 },
];

// Armadi/cassonetti dove nascondersi. pos = dentro, exit = dove si riemerge.
export const HIDE_SPOTS = [
  { id: 'hs_ah',  kind: 'wardrobe', name: 'armadio', x: -53.6, z: -12, w: 1.0, d: 0.7, h: 2.0, pos: [-53.6, -12], exit: [-52.3, -12] },
  { id: 'hs_sm',  kind: 'dumpster', name: 'cassonetto', x: -16, z: -21, w: 2.0, d: 1.0, h: 1.4, pos: [-16, -21], exit: [-16, -19.7] },
  { id: 'hs_gs',  kind: 'dumpster', name: 'cassonetto', x: 26, z: -20.5, w: 2.0, d: 1.0, h: 1.4, pos: [26, -20.5], exit: [26, -19] },
  { id: 'hs_h2',  kind: 'wardrobe', name: 'armadio', x: -4.4, z: 17.2, w: 1.0, d: 0.7, h: 2.0, pos: [-4.4, 17.2], exit: [-4.4, 16] },
];

// Oggetti raccoglibili. container: id del cassetto che li contiene (visibili solo se aperto).
export const ITEM_SPOTS = [
  { id: 'p_torch',   item: 'torch',     x: -52,   y: 0.83, z: -16 },
  { id: 'p_cell_sm', item: 'torch_cell', x: -21.5, y: 0.83, z: -11.7 },
  { id: 'p_cell_ps', item: 'torch_cell', x: 0.5,  y: 0.83, z: -17.5 },
  { id: 'p_cell_h2', item: 'torch_cell', x: -9,   y: 0.83, z: 16.5 },
  { id: 'p_cell_h3', item: 'torch_cell', x: 9.5,  y: 0.83, z: 16.5 },
  { id: 'p_hkey',    item: 'house_key', x: -42,   y: 0.12, z: -21.5 },
  { id: 'p_carkeys', item: 'car_keys',  x: -34.5, y: 0.82, z: -17.35, container: 'dr_rh' },
  { id: 'p_shopkey', item: 'shop_key',  x: -10,   y: 0.82, z: -17.2, container: 'dr_sm' },
  { id: 'p_map',     item: 'map',       x: -13,   y: 1.02, z: -11.8 },
  { id: 'p_wrench',  item: 'wrench',    x: -21.5, y: 0.83, z: -12.3 },
  { id: 'p_jerry',   item: 'jerrycan',  x: 26,    y: 0.0,  z: -16.2 },
  { id: 'p_fuse',    item: 'fuse',      x: -42,   y: 0.87, z: -37.3 },
  { id: 'p_battery', item: 'battery',   x: 26.7,  y: 0.91, z: 17.4 },
  { id: 'p_cables',  item: 'cables',    x: 28.6,  y: 0.91, z: 17.4 },
  { id: 'p_gatekey', item: 'gate_key',  x: 8,     y: 1.0,  z: -17.35, container: 'dr_ps' },
  // documenti
  { id: 'd_news',   doc: 'news',   x: -47,   y: 0.5,  z: -7.2 },
  { id: 'd_ah',     doc: 'ah',     x: -47.5, y: 0.93, z: -17.4 },
  { id: 'd_rh1',    doc: 'rh1',    x: -31.5, y: 0.83, z: -15.2 },
  { id: 'd_rh2',    doc: 'rh2',    x: -37.5, y: 0.83, z: -17.2 },
  { id: 'd_sm',     doc: 'sm',     x: -12,   y: 1.02, z: -11.8 },
  { id: 'd_gs',     doc: 'gs',     x: 28,    y: 0.83, z: -12.7 },
  { id: 'd_ps',     doc: 'ps',     x: 2,     y: 0.83, z: -14 },
  { id: 'd_garage', doc: 'garage', x: 33,    y: 0.83, z: 12.5 },
  { id: 'd_shed',   doc: 'shed',   x: -43,   y: 0.88, z: -37.3 },
];

// Cassetti apribili (sono interattivi e animati): posizionati sulla faccia sud (+z) del mobile.
export const DRAWERS = [
  { id: 'dr_rh', x: -34.5, z: -17.4, w: 1.4, d: 0.5, h: 1.0, dir: 1 },
  { id: 'dr_sm', x: -10,   z: -17.2, w: 1.2, d: 0.5, h: 1.0, dir: 1 },
  { id: 'dr_ps', x: 8,     z: -17.6, w: 1.0, d: 0.5, h: 1.9, dir: 1, y: 1.0 },
];

export const WAYPOINTS = [
  [-55, 0], [-40, 0], [-25, 0], [-10, 0], [5, 0], [20, 0], [35, 0], [46, 0],
  [-50, -6.5], [-34, -6.5], [-16, -6.5], [4, -6.5], [30, -7.5], [-8, 7], [10, 7], [30, 7], [-29, 9], [-20, 8],
  [-42, -15], [-42, -24], [-42, -30], [-16, -22], [4, -22], [26, -22],
  [-50, -14], [-34, -14], [-16, -13], [4, -13], [26, -14], [-8, 14], [10, 14], [30, 14],
  [-48, 20], [-20, 26], [15, 26],
];

export const DOCS = {
  news: { title: 'Giornale del 31 ottobre', text:
`GAZZETTA DI HOLLOW CREEK

"ANCORA NIENTE DAL FRONTE DELLE RICERCHE"
Trentacinque anni dopo la scomparsa di Edgar Marrow, il mietitore di zucche, il vecchio rancore della città non si è spento. Ogni Halloween, qualcuno giura di vedere una sagoma con una zucca scavata al posto della testa vagare fra le case.

Lo sceriffo invita i cittadini a restare in casa dopo il tramonto.` },
  ah: { title: 'Diario sulla credenza', text:
`Se qualcuno trova questo diario: io sono scappata, ma i miei vicini, i Miller, no.

Hanno chiuso la loro casa a chiave. Ricordo che Tom teneva sempre la chiave di scorta nel vicolo qui dietro, sotto una zucca intagliata.

Le chiavi dell'auto di Tom sono nel mobile del soggiorno. Non provate ad accendere le luci: lui le vede da lontano.` },
  rh1: { title: 'Lettera di Tom Miller', text:
`Edgar Marrow non era un mostro. Era un contadino. La città lo ha incolpato per il raccolto marcito e lo ha bruciato nel suo campo di zucche.

Quella notte indossava una zucca intagliata per non farsi riconoscere. Adesso torna ogni anno, e non c'è nessuno a fermarlo.` },
  rh2: { title: 'Foto e appunto', text:
`[Fotografia: un uomo alto con un cappotto scuro e una zucca deforme, davanti a un cancello.]

Sul retro: "Il cancello sul bordo della città si apre solo con la chiave del vecchio sceriffo. È nell'armadietto della stazione di polizia."` },
  sm: { title: 'Registrazione del cassiere', text:
`[Nastro di sicurezza, audio]

"...ha spaccato la porta sul retro. Ho nascosto la chiave del negozio della stazione di servizio nel cassetto del banco, quello vicino allo scaffale. Se qualcuno la trova: la tanica è dentro il negozio, il serbatoio si riempie alla pompa."` },
  gs: { title: 'Nota del benzinaio', text:
`La pompa funziona ancora a gravità. Riempi la tanica e versala nel serbatoio dell'auto.

Il fusibile dell'officina? L'ho lasciato nel capanno nel bosco, dietro il vicolo vicino alla casa abbandonata.` },
  ps: { title: 'Rapporto di polizia', text:
`Rapporto 31/10 — Pattuglia unica in servizio.

L'armadietto metallico in fondo alla stanza contiene la chiave del cancello cittadino. Il pannello di controllo è accanto al cancello. Aprirlo da lì fa partire il motore del cancello.` },
  garage: { title: 'Bacheca dell\'officina', text:
`BATTERIE: sul bancone, quelle già cariche.
CAVI: accanto alle batterie.
Serve la chiave inglese per fissare i morsetti: l'ultima l'ho lasciata al supermercato.

La saracinesca elettrica non si alza senza il fusibile: scatola a destra della porta.` },
  shed: { title: 'Biglietto nel capanno', text:
`Il fusibile è qui, sul tavolo. Non ti fermare. Se senti i passi fuori, nasconditi e resta immobile.

Lui non vede quello che non si muove.` },
};
