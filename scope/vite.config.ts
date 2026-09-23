import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

const TAR1090 = process.env.PQ_TAR1090 ?? 'http://localhost';

export default defineConfig({
  plugins: [solid()],
  base: './',
  server: {
    proxy: {
      '/data': { target: TAR1090, changeOrigin: true },
      '/chunks': { target: TAR1090, changeOrigin: true },
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
