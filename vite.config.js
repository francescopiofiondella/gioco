import { defineConfig } from 'vite';

// `npm run dev`        -> http://localhost:5173 (WebXR funziona perché localhost è un contesto sicuro)
// `npm run dev:https`  -> HTTPS con certificato autofirmato, utile per provare la VR da un visore in LAN
export default defineConfig(async ({ mode }) => {
  const plugins = [];
  if (mode === 'https') {
    const { default: basicSsl } = await import('@vitejs/plugin-basic-ssl');
    plugins.push(basicSsl());
  }
  return {
    base: './', // funziona anche in un sottopercorso (GitHub Pages)
    plugins,
    server: { port: 5173, open: false },
    build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
  };
});
