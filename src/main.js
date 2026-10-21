import './style.css';
import { Game } from './game/Game.js';

const loadingText = document.getElementById('loading-text');
try {
  const canvas = document.getElementById('game');
  const game = new Game(canvas);
  window.__game = game; // utile per il debug da console
  game.init().catch((e) => { console.error(e); });
} catch (e) {
  console.error(e);
  if (loadingText) loadingText.textContent = `Impossibile avviare il gioco: ${e.message}. Serve un browser con WebGL 2.`;
}
