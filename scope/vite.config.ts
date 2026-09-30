import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

/** The server the scope's feed comes from, as `mise run dev` starts it. */
const WEB = process.env.PQ_WEB ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [solid()],
  base: './',
  server: {
    proxy: {
      '/feed': { target: WEB, changeOrigin: true },
      // An Aviation Weather Center proxy for trying the ?wx=/wx path locally.
      '/wx/metar': {
        target: 'https://aviationweather.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/wx\/metar/, '/api/data/metar'),
      },
    },
  },
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: true },
});
