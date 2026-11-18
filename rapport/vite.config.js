import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Läuft unter https://ebi-cyber.github.io/baulog/rapport/
export default defineConfig({
  base: '/baulog/rapport/',
  // Stand der App (Datum/Uhrzeit des Builds, Schweizer Zeit) – unten in den Optionen sichtbar
  define: { __STAND__: JSON.stringify(new Date().toLocaleString('de-CH', { timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Rapport — Arbeitszeit & Wochenrapport',
        short_name: 'Rapport',
        description: 'Arbeitszeit mit Start/Pause/Stopp erfassen und den Wochenrapport per Knopfdruck senden.',
        lang: 'de',
        theme_color: '#06121a',
        background_color: '#06121a',
        display: 'standalone',
        orientation: 'portrait',
        id: '/baulog/rapport/',
        scope: '/baulog/rapport/',
        start_url: '/baulog/rapport/',
        icons: [
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
  server: { host: true },
})
