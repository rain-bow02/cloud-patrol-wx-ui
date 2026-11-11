import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
export default defineConfig({
  root: fileURLToPath(new URL('./mobile', import.meta.url)),
  base: '/patrol-h5/',
  // 手机端独立缓存，避免共享宿主的预构建目录被其他开发进程替换。
  cacheDir: fileURLToPath(new URL('./.dev/vite', import.meta.url)),
  plugins: [vue({ template: { compilerOptions: { isCustomElement: tag => tag === 'altcha-widget' } } })],
  define: { 'import.meta.env.VITE_TOKEN_KEY': JSON.stringify('X-Access-Token') },
  resolve: { dedupe: ['vue', 'vue-i18n'] },
  server: { host: '127.0.0.1', port: 9301, strictPort: true,
    fs: { allow: [fileURLToPath(new URL('.', import.meta.url))] },
    proxy: { '/api': { target: 'http://127.0.0.1:9300', changeOrigin: true } } },
  build: { outDir: '../dist', emptyOutDir: true },
})
