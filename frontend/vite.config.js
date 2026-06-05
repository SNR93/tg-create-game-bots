/**
 * Codex developer notes:
 * Конфигурация Vite для сборки React-приложения.
 * Настройки здесь влияют на dev-server, production build и путь к статическим ассетам.
 * Менять осторожно: Dockerfile frontend ожидает стандартный Vite build.
 * Комментарии написаны по-русски и предназначены только для поддержки кода; они не должны менять поведение приложения.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001'
    }
  }
});
