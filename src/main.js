import './style.css';
import { Game } from './game/Game.js';

const loadingText = document.getElementById('loading-text');
try {
  const canvas = document.getElementById('game');
  const game = new Game(canvas);
  window.__game = game; // utile per il debug da console
  game.init().catch((e) => {
    console.error(e);
    if (loadingText) loadingText.textContent = `Errore: ${e && e.message ? e.message : e}`;
  });
  // se dopo 25 s il caricamento non è finito, mostra un avviso utile
  setTimeout(() => {
    const l = document.getElementById('loading');
    if (l && !l.classList.contains('hidden') && loadingText && !/Errore/.test(loadingText.textContent)) {
      loadingText.textContent += ' (sta impiegando più del previsto: ricarica la pagina)';
    }
  }, 25000);
} catch (e) {
  console.error(e);
  if (loadingText) loadingText.textContent = `Impossibile avviare il gioco: ${e.message}. Serve un browser con WebGL 2.`;
}
