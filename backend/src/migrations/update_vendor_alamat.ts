import pool from '../config/database.js';

/**
 * Migration: update_vendor_alamat
 * Mengisi kolom `alamat` dan `kontak` untuk 16 vendor aktif di Pulau Jawa.
 * Semua alamat adalah kawasan industri / jalan nyata di Jawa Barat, Jawa Tengah, dan Jawa Timur.
 */
async function up() {
  const connection = await pool.getConnection();
  try {
    console.log('Updating alamat & kontak for 16 vendors (Pulau Jawa)...');

    const vendors = [
      {
        kode: 'VND-001',
        alamat: 'Jl. Industri Raya Blok C No. 7, Kawasan Industri Suryacipta, Karawang, Jawa Barat 41361',
        kontak: '0267-431-2200',
      },
      {
        kode: 'VND-002',
        alamat: 'Jl. Raya Bekasi KM 27, Kawasan Industri MM2100, Cikarang Barat, Bekasi, Jawa Barat 17520',
        kontak: '021-8990-5511',
      },
      {
        kode: 'VND-003',
        alamat: 'Jl. Gatot Subroto Km 7, Kawasan Industri Cikupa Mas, Tangerang, Banten 15710',
        kontak: '021-5960-8800',
      },
      {
        kode: 'VND-004',
        alamat: 'Jl. Rungkut Industri III No. 18, SIER, Surabaya, Jawa Timur 60293',
        kontak: '031-841-7766',
      },
      {
        kode: 'VND-005',
        alamat: 'Jl. Magelang KM 12, Kawasan Industri Sleman, Yogyakarta, DIY 55284',
        kontak: '0274-867-3300',
      },
      {
        kode: 'VND-006',
        alamat: 'Jl. Raya Purwakarta–Bandung KM 31, Kawasan Industri Kota Bukit Indah, Purwakarta, Jawa Barat 41181',
        kontak: '0264-351-9900',
      },
      {
        kode: 'VND-007',
        alamat: 'Jl. Rajawali Selatan Raya No. 3, Pademangan, Jakarta Utara, DKI Jakarta 14420',
        kontak: '021-6619-4400',
      },
      {
        kode: 'VND-008',
        alamat: 'Jl. Industri Selatan 3 Blok GG No. 2, Kawasan Industri Jababeka II, Cikarang, Bekasi, Jawa Barat 17550',
        kontak: '021-8984-6600',
      },
      {
        kode: 'VND-009',
        alamat: 'Jl. Sultan Agung No. 155, Kawasan Industri Candi, Semarang, Jawa Tengah 50183',
        kontak: '024-7608-1122',
      },
      {
        kode: 'VND-010',
        alamat: 'Jl. Raya Legok–Karawaci KM 6, Kelapa Dua, Tangerang, Banten 15810',
        kontak: '021-5462-3300',
      },
      {
        kode: 'VND-011',
        alamat: 'Jl. Berbek Industri VIII No. 9, Kawasan Industri SIER Berbek, Waru, Sidoarjo, Jawa Timur 61254',
        kontak: '031-853-6644',
      },
      {
        kode: 'VND-012',
        alamat: 'Jl. Raya Solo–Yogyakarta KM 8, Kawasan Industri Prambanan, Klaten, Jawa Tengah 57454',
        kontak: '0274-496-7711',
      },
      {
        kode: 'VND-013',
        alamat: 'Jl. Kapten Tendean No. 55, Kawasan Industri Karet Kuningan, Jakarta Selatan, DKI Jakarta 12950',
        kontak: '021-5290-8833',
      },
      {
        kode: 'VND-014',
        alamat: 'Jl. Raya Narogong KM 23, Kawasan Industri Hankook, Cileungsi, Bogor, Jawa Barat 16820',
        kontak: '021-8230-5500',
      },
      {
        kode: 'VND-015',
        alamat: 'Jl. Veteran No. 123, Kawasan Industri Gresik, Gresik, Jawa Timur 61122',
        kontak: '031-398-2277',
      },
      {
        kode: 'VND-016',
        alamat: 'Jl. Raya Serang KM 18, Kawasan Industri Modern Cikande, Serang, Banten 42186',
        kontak: '0254-401-6688',
      },
    ];

    let updated = 0;
    for (const v of vendors) {
      const [result]: any = await connection.query(
        'UPDATE master_vendor SET alamat = ?, kontak = ? WHERE kode_vendor = ?',
        [v.alamat, v.kontak, v.kode]
      );
      if (result.affectedRows > 0) {
        updated++;
        console.log(`  ✓ ${v.kode} — updated`);
      } else {
        console.warn(`  ✗ ${v.kode} — tidak ditemukan, skip`);
      }
    }

    console.log(`\nSelesai. ${updated}/16 vendor berhasil diperbarui.`);
  } catch (error) {
    console.error('Migration gagal:', error);
  } finally {
    connection.release();
    process.exit(0);
  }
}

up();
