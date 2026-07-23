import { resolve } from "path"
import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"

export default defineConfig({
  plugins: [vue()],
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        zerostock: resolve(__dirname, '0stock.html'),
        sscodestock: resolve(__dirname, 'ss_code_stock.html')
      }
    }
  }
})