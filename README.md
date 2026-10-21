# HALLOWEEN NIGHT — THE LAST ESCAPE

Survival horror 3D in prima persona, giocabile nel browser (PC e WebXR). Una cittadina americana la notte di
Halloween, un assassino con la testa di zucca, sette missioni e una fuga in auto da guidare davvero.

## Avvio

```bash
npm install
npm run dev        # http://localhost:5173  (localhost è un contesto sicuro: WebXR funziona)
npm run build      # build di produzione in dist/ (servire in HTTPS per la VR)
npm run preview    # prova la build
npm run dev:https  # HTTPS autofirmato, utile per provare la VR da un visore in LAN
npm run verify     # verifica headless della logica (vedi sotto)
```

Aggiungi `?debug` all'URL per vedere lo stato dell'IA e la missione corrente nell'HUD.

## Pubblicare su GitHub e giocare (nessun comando)

1. Crea un repository su GitHub e carica **tutto il contenuto** della cartella (compresa `.github/`).
2. Nel repository: **Settings → Pages → Build and deployment → Source: GitHub Actions** (si fa una volta sola).
3. Attendi 2-3 minuti (scheda **Actions**, il lavoro diventa verde). Il link `https://TUONOME.github.io/NOME-REPO/`
   compare in Settings → Pages: aprilo da PC, telefono o visore. Ogni nuovo caricamento ripubblica da solo.

## Telefono / tablet

Sui dispositivi touch compaiono i controlli su schermo: stick a sinistra (movimento; in auto acceleratore e sterzo),
trascina a destra per guardare, **E** interagisce, 🔦 torcia, CORRI (tieni premuto), ▼ accovacciati, 🎒 inventario,
🗺 mappa, ⏸ pausa. Si consiglia lo schermo in orizzontale (il gioco prova ad andare a schermo intero).

## Scelta architetturale: solo Three.js

Il prompt chiedeva di valutare Three.js e Babylon.js e di non farli renderizzare insieme. **Il progetto usa solo
Three.js**; Babylon.js non è una dipendenza. Motivo: ogni funzione richiesta (rendering, luci, WebXR, raycasting,
istanziazione, fisica arcade, audio spaziale) è già coperta da Three.js e da codice proprio; aggiungere Babylon
avrebbe significato duplicare sistemi o inserire un'integrazione solo di facciata, cosa che il prompt vieta.

| Funzione | Realizzata con |
|---|---|
| Rendering, scena, luci, nebbia, materiali, InstancedMesh, frustum culling | Three.js (WebGL 2) |
| WebXR (sessione, controller, spazio di riferimento) | `renderer.xr` di Three.js |
| Raycast di interazione | `THREE.Raycaster` + AABB 2D propri per le collisioni |
| Navigazione IA | A\* su griglia (codice proprio) |
| Audio | Web Audio API, interamente procedurale (nessun file) |
| Input | Pointer Lock, tastiera, Gamepad API, WebXR input sources |
| Salvataggi | localStorage |

Tutti i modelli, le texture e i suoni sono generati da codice: nessun asset esterno e nessun diritto di terzi.

## Comandi

PC: WASD muoversi · Mouse guardare · Shift correre · Ctrl/C accovacciarsi · E interagire/raccogliere/nascondersi ·
F torcia · M mappa (se l'hai trovata) · Tab inventario, obiettivi, diario · Esc pausa. In auto: W/S, A/D, Spazio.

VR: stick sinistro movimento (o teletrasporto: spingi avanti e rilascia) · stick destro rotazione · grilletto
interagisce con ciò che punti · grip afferra un oggetto (portalo al petto per metterlo nell'inventario) ·
A/X torcia (impugnata a destra) · B pannello inventario/mappa · Y tenuto premuto esce dalla VR.

## Soluzione (spoiler)

1. Prendi la torcia nella casa abbandonata. Dopo ~12 s compare l'assassino: nasconditi (armadio o cassonetto) e resta fermo.
2. Chiave di scorta sotto le zucche nel vicolo → casa dei Miller → cassetto del mobile: chiavi dell'auto.
3. Supermercato: chiave del negozio nel cassetto del banco (e chiave inglese, mappa). Stazione di servizio: tanica, riempila alla pompa, versala nel serbatoio.
4. Capanno nel bosco: fusibile → cassetta accanto all'officina → batteria e cavi sul bancone. Portale all'auto.
5. Cofano: installa la batteria (serve la chiave inglese), poi collega i cavi.
6. Stazione di polizia: chiave del cancello nell'armadietto → pannello a est.
7. Sali in auto e raggiungi l'uscita. L'assassino ti intercetta: investirlo a più di ~25 km/h lo stordisce, andare piano significa essere afferrati.

## IA dell'assassino

Stati: pattugliamento → investigazione dei rumori → ricerca → inseguimento → perdita delle tracce → controllo dei
nascondigli → ritorno al pattugliamento. Vista: cono + distanza + `raycast` 2D contro i muri, con una barra di
"allerta" che sale gradualmente (la torcia accesa ti rende più visibile, accovacciarsi o stare fermi al buio meno).
Udito: ogni azione emette un rumore con raggio (corsa 14 m, camminata 6,5 m, accovacciati 2 m, porte, cassetti,
oggetti); i muri attutiscono. Porte aperte dal giocatore insospettiscono l'assassino. Le porte a chiave bloccano
anche lui. La difficoltà cambia velocità, campo visivo, sensibilità ai rumori, durata della ricerca e probabilità di
trovarti in un nascondiglio. Se vede entrare il giocatore in un nascondiglio, ci va dritto.
Nel finale, se è troppo lontano, sbuca ai margini della strada davanti all'auto (unica "scorciatoia" dell'IA, per garantire tensione).

## Struttura

`src/game` (Game, GameState, EventDirector) · `src/player` (PlayerController, VRController) · `src/world`
(WorldBuilder, WorldData, CollisionSystem, Textures) · `src/ai` (KillerAI, NavigationSystem) · `src/missions` ·
`src/inventory` · `src/interaction` · `src/vehicle` · `src/audio` · `src/ui` (HUD, MainMenu, VRPanel, TouchControls) · `src/save` · `src/config`.

## Prestazioni

Geometrie e materiali in cache, `InstancedMesh` per alberi, foglie e zucche, texture a bassa risoluzione generate a
runtime, nessuna ombra dinamica tranne la torcia in qualità Alta, luci puntuali limitate (~10) e a intensità
variabile (mai accese/spente, per evitare ricompilazioni degli shader). Qualità Bassa/Media/Alta (alberi, foglie,
pioggia, pixel ratio, ombre; applicata al riavvio della pagina). In VR: pioggia e ombre disattivate, risoluzione ridotta.

## Salvataggi

localStorage: flag del mondo (porte, cassetti, oggetti raccolti, enigmi, stato dell'auto), inventario, diario,
torcia, missione, difficoltà, posizioni. Salvataggio automatico a ogni missione completata; "Salva partita" dal
menu di pausa. Non si salva durante la guida finale. Dopo la sconfitta "Riprova" riparte dall'ultimo salvataggio.

## Cosa è stato verificato e cosa NO

Verificato (in questo ambiente, con `npm run verify`, che usa uno stub di Three.js e simula il gioco senza GPU):

- tutti gli oggetti sono raggiungibili sulla griglia di navigazione, e quelli dietro porte a chiave NON lo sono finché non le sblocchi;
- partita completa scriptata sulle interazioni reali: ordine delle missioni, requisiti (es. senza chiave inglese la batteria non si installa, senza cancello aperto l'auto non parte), oggetti a due mani;
- l'auto, guidata da un pilota automatico, esce dal parcheggio e raggiunge l'uscita, con e senza assassino;
- IA: pattugliamento, rumore → investigazione, vista con cono e occlusione dai muri, inseguimento non istantaneo, sequenza CHASE→LOST→SEARCH→RETURN→PATROL, controllo dei nascondigli, cattura, effetto della difficoltà;
- tutti i file sorgente superano il controllo di sintassi.

**Non verificato** (nessuna GPU, browser, rete o visore disponibili): `npm install` / `npm run build`, il rendering reale e le prestazioni,
l'audio, il Pointer Lock, e **la VR su hardware reale** — nessun visore o browser è stato testato; il codice WebXR segue le API
standard di Three.js ma va provato (Quest Browser, Chrome/Edge con SteamVR sono i candidati naturali). Segnalare i problemi trovati.

## Limiti noti

- Porte e cassetti in VR si aprono col grilletto (animati), non trascinandoli fisicamente.
- Gli oggetti afferrati in VR e rilasciati lontano dal petto tornano al loro posto (evita oggetti persi fuori mappa).
- Le collisioni sono 2D (AABB sul piano XZ); il terreno è piatto.
- Inventario e diario mettono il gioco in pausa su PC (non in VR).
