import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/baulog/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'BauLog — Bautagebuch & Stunden-Tracker',
        short_name: 'BauLog',
        description: 'Arbeitszeit, Material, Fotos & Tagesberichte pro Sanierungsprojekt — für genaue Kostenkalkulation.',
        lang: 'de',
        theme_color: '#0c0a09',
        background_color: '#0c0a09',
        display: 'standalone',
        orientation: 'portrait',
        id: '/baulog/',
        scope: '/baulog/',
        start_url: '/baulog/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: { host: true },
})
