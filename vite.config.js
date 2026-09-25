import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Chargées à la demande (import Excel, ILV) : pré-optimisées pour éviter un rechargement en développement
  optimizeDeps: { include: ['xlsx', 'pdf-lib', '@pdf-lib/fontkit'] },
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
