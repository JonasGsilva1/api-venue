import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import * as pluginReact from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    (pluginReact as unknown as { default: () => any }).default(),
    tailwindcss(),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
