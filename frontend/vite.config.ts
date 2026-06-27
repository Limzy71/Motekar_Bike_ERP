import { defineConfig } from 'vite';
import { resolve } from 'path';
import handlebars from 'vite-plugin-handlebars';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
        gudang: resolve(__dirname, 'gudang.html'),
        keuangan: resolve(__dirname, 'keuangan.html'),
        mrp: resolve(__dirname, 'mrp.html'),
        crm: resolve(__dirname, 'crm.html'),
        mutu: resolve(__dirname, 'mutu.html'),
        operasi: resolve(__dirname, 'operasi.html'),
        pemasaran: resolve(__dirname, 'pemasaran.html'),
        pengadaan: resolve(__dirname, 'pengadaan.html'),
        penjualan: resolve(__dirname, 'penjualan.html'),
        po: resolve(__dirname, 'po.html'),
        profil: resolve(__dirname, 'profil.html'),
        users: resolve(__dirname, 'users.html'),
      }
    }
  },
  plugins: [
    handlebars({
      partialDirectory: resolve(__dirname, 'partials'),
    }),
  ],
});
