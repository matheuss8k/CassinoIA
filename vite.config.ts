
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Permite acesso via IP da rede (ex: 192.168.x.x)
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000', // Correção: Use IP explícito em vez de localhost
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    // Otimização de Build para Produção
    target: 'esnext',
    minify: 'esbuild', // Mais rápido que terser
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        // Separa bibliotecas de terceiros em arquivos de cache separados
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui': ['lucide-react'],
          'game-utils': ['./services/gameLogic.ts', './services/database.ts']
        }
      }
    }
  }
});
