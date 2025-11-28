import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'src/main/index.ts')
        },
        external: ['better-sqlite3', 'electron-store']
      },
      // Copy binaries to output directory
      copyPublicDir: false,
    }
  },
  electron: {
    start: {
      args: ['--no-sandbox']
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'src/renderer/index.html')
        }
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src/renderer')
      }
    }
  }
})

