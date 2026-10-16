import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Identifiant du build : écrit dans dist/version.json et injecté dans le code.
// Un onglet ouvert avant un déploiement compare les deux et propose de recharger.
const APP_VERSION = new Date().toISOString()

const versionJson = {
  name: 'version-json',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: APP_VERSION }) })
  },
}

export default defineConfig({
  plugins: [react(), versionJson],
  define: { 'import.meta.env.APP_VERSION': JSON.stringify(APP_VERSION) },
  // Chargées à la demande (import Excel, ILV) : pré-optimisées pour éviter un rechargement en développement
  optimizeDeps: { include: ['xlsx', 'pdf-lib', '@pdf-lib/fontkit', 'pdfjs-dist'] },
  build: {
    rolldownOptions: {
      output: {
        // Librairies dans des fichiers séparés : elles restent en cache navigateur
        // quand seul le code de l'application change entre deux déploiements.
        codeSplitting: {
          groups: [
            { name: 'firebase', test: /node_modules[\\/](@firebase|firebase)[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
})
