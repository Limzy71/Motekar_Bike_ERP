SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `audit_logs`;
CREATE TABLE `audit_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `action` varchar(255) NOT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `status` enum('Success','Failed','Warning') NOT NULL DEFAULT 'Success',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `audit_logs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `crm_prospek`;
CREATE TABLE `crm_prospek` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nama_pic` varchar(100) NOT NULL,
  `nama_instansi` varchar(150) NOT NULL,
  `kategori_lead` enum('HOT LEAD','NEGOSIASI','COLD','CLOSED WIN') DEFAULT 'COLD',
  `jadwal_followup` varchar(100) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `inventory_stok`;
CREATE TABLE `inventory_stok` (
  `id` int NOT NULL AUTO_INCREMENT,
  `kode_barang` varchar(50) NOT NULL,
  `nama_barang` varchar(255) NOT NULL,
  `kategori` enum('Komponen','Sepeda Jadi') NOT NULL,
  `jumlah_stok` int NOT NULL DEFAULT '0',
  `satuan` varchar(50) NOT NULL,
  `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `stok_committed` int NOT NULL DEFAULT '0',
  `tipe_item` enum('RM','SA','FG') NOT NULL DEFAULT 'RM',
  `harga_standar` decimal(15,2) NOT NULL DEFAULT '0.00',
  `harga_jual` decimal(15,2) NOT NULL DEFAULT '0.00',
  PRIMARY KEY (`id`),
  UNIQUE KEY `kode_barang` (`kode_barang`)
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `keuangan_jurnal`;
CREATE TABLE `keuangan_jurnal` (
  `id_jurnal` int NOT NULL AUTO_INCREMENT,
  `tanggal` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `referensi_dokumen` varchar(100) NOT NULL,
  `keterangan` text NOT NULL,
  `tipe_akun` enum('Aset_Persediaan','Pendapatan','HPP','Kas_Bank') NOT NULL,
  `posisi` enum('Debit','Kredit') NOT NULL,
  `nominal` decimal(15,2) NOT NULL DEFAULT '0.00',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_jurnal`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `legal_mitra`;
CREATE TABLE `legal_mitra` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nama_badan_usaha` varchar(150) NOT NULL,
  `file_nib_path` varchar(255) NOT NULL,
  `status_verifikasi` enum('Menunggu Verifikasi','Disetujui','Ditolak') DEFAULT 'Menunggu Verifikasi',
  `tanggal_unggah` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `logistik_packing_list`;
CREATE TABLE `logistik_packing_list` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nomor_referensi` varchar(50) NOT NULL,
  `item_barang` varchar(255) NOT NULL,
  `jumlah` int NOT NULL,
  `satuan` varchar(50) DEFAULT 'pcs',
  `tujuan` varchar(255) NOT NULL,
  `tanggal_siap` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status_pengiriman` varchar(100) DEFAULT 'Siap Kirim',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `manufaktur_bom_detail`;
CREATE TABLE `manufaktur_bom_detail` (
  `id_detail` int NOT NULL AUTO_INCREMENT,
  `id_bom` varchar(50) NOT NULL,
  `kode_item_komponen` varchar(50) NOT NULL,
  `qty_kebutuhan` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_detail`),
  KEY `id_bom` (`id_bom`),
  CONSTRAINT `manufaktur_bom_detail_ibfk_1` FOREIGN KEY (`id_bom`) REFERENCES `manufaktur_bom_header` (`id_bom`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=38 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `manufaktur_bom_header`;
CREATE TABLE `manufaktur_bom_header` (
  `id_bom` varchar(50) NOT NULL,
  `kode_item_parent` varchar(50) NOT NULL,
  `nama_resep` varchar(150) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_bom`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `master_vendor`;
CREATE TABLE `master_vendor` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nama_vendor` varchar(255) NOT NULL,
  `kontak` varchar(100) DEFAULT NULL,
  `alamat` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `operasi_kanban`;
CREATE TABLE `operasi_kanban` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nomor_job` varchar(20) NOT NULL,
  `nama_tugas` varchar(150) NOT NULL,
  `prioritas` enum('Low','Normal','High') DEFAULT 'Normal',
  `progres_persen` int DEFAULT '0',
  `status_kolom` enum('backlog','proses','tuning','selesai') DEFAULT 'backlog',
  `ditugaskan_ke` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `nomor_job` (`nomor_job`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `operasi_wo_header`;
CREATE TABLE `operasi_wo_header` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nomor_wo` varchar(50) NOT NULL,
  `id_inventory_fg` int NOT NULL COMMENT 'FK to inventory_stok.id',
  `jumlah_produksi` int NOT NULL,
  `status` enum('DRAFT','IN_PROGRESS','COMPLETED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `nomor_wo` (`nomor_wo`),
  KEY `id_inventory_fg` (`id_inventory_fg`),
  CONSTRAINT `operasi_wo_header_ibfk_1` FOREIGN KEY (`id_inventory_fg`) REFERENCES `inventory_stok` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `operasi_wo_material_allocation`;
CREATE TABLE `operasi_wo_material_allocation` (
  `id` int NOT NULL AUTO_INCREMENT,
  `id_wo_header` int NOT NULL,
  `id_inventory_material` int NOT NULL COMMENT 'FK to inventory_stok.id',
  `qty_kebutuhan` int NOT NULL,
  `status_alokasi` enum('Reserved','Consumed') NOT NULL DEFAULT 'Reserved',
  PRIMARY KEY (`id`),
  KEY `id_wo_header` (`id_wo_header`),
  KEY `id_inventory_material` (`id_inventory_material`),
  CONSTRAINT `operasi_wo_material_allocation_ibfk_1` FOREIGN KEY (`id_wo_header`) REFERENCES `operasi_wo_header` (`id`) ON DELETE CASCADE,
  CONSTRAINT `operasi_wo_material_allocation_ibfk_2` FOREIGN KEY (`id_inventory_material`) REFERENCES `inventory_stok` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `pemasaran_aktivitas`;
CREATE TABLE `pemasaran_aktivitas` (
  `id_aktivitas` int NOT NULL AUTO_INCREMENT,
  `id_lead` int NOT NULL,
  `tanggal` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `jenis_interaksi` enum('Telepon','Meeting','Email') NOT NULL DEFAULT 'Telepon',
  `catatan_hasil` text NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_aktivitas`),
  KEY `id_lead` (`id_lead`),
  CONSTRAINT `pemasaran_aktivitas_ibfk_1` FOREIGN KEY (`id_lead`) REFERENCES `pemasaran_leads` (`id_lead`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `pemasaran_campaigns`;
CREATE TABLE `pemasaran_campaigns` (
  `id_campaign` int NOT NULL AUTO_INCREMENT,
  `nama_campaign` varchar(200) NOT NULL,
  `jenis` enum('Pameran','Digital Ads','Kunjungan Langsung') NOT NULL DEFAULT 'Pameran',
  `budget_alokasi` decimal(15,2) NOT NULL DEFAULT '0.00',
  `status` enum('Aktif','Selesai') NOT NULL DEFAULT 'Aktif',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `tanggal_mulai` date DEFAULT NULL,
  `tanggal_selesai` date DEFAULT NULL,
  PRIMARY KEY (`id_campaign`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `pemasaran_leads`;
CREATE TABLE `pemasaran_leads` (
  `id_lead` int NOT NULL AUTO_INCREMENT,
  `nama_toko` varchar(200) NOT NULL,
  `kontak_person` varchar(100) NOT NULL,
  `no_telepon` varchar(30) NOT NULL,
  `id_campaign` int DEFAULT NULL,
  `estimasi_nilai_deal` decimal(15,2) NOT NULL DEFAULT '0.00',
  `status_pipeline` enum('New Lead','Follow Up','Negosiasi','Won_Deal','Lost') NOT NULL DEFAULT 'New Lead',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_lead`),
  KEY `id_campaign` (`id_campaign`),
  CONSTRAINT `pemasaran_leads_ibfk_1` FOREIGN KEY (`id_campaign`) REFERENCES `pemasaran_campaigns` (`id_campaign`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `pengadaan_po_header`;
CREATE TABLE `pengadaan_po_header` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nomor_po` varchar(50) NOT NULL,
  `id_vendor` int NOT NULL,
  `status` enum('DRAFT','ISSUED','APPROVED','SENT_TO_VENDOR','COMPLETED','REJECTED') NOT NULL DEFAULT 'DRAFT',
  `total_nilai` decimal(15,2) NOT NULL DEFAULT 0.00,
  `catatan` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `nomor_po` (`nomor_po`),
  KEY `id_vendor` (`id_vendor`),
  CONSTRAINT `pengadaan_po_header_ibfk_1` FOREIGN KEY (`id_vendor`) REFERENCES `master_vendor` (`id_vendor`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `pengadaan_po_detail`;
CREATE TABLE `pengadaan_po_detail` (
  `id` int NOT NULL AUTO_INCREMENT,
  `id_po_header` int NOT NULL,
  `id_inventory_material` int NOT NULL,
  `qty` int NOT NULL,
  `harga_satuan` decimal(15,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `id_po_header` (`id_po_header`),
  KEY `id_inventory_material` (`id_inventory_material`),
  CONSTRAINT `pengadaan_po_detail_ibfk_1` FOREIGN KEY (`id_po_header`) REFERENCES `pengadaan_po_header` (`id`) ON DELETE CASCADE,
  CONSTRAINT `pengadaan_po_detail_ibfk_2` FOREIGN KEY (`id_inventory_material`) REFERENCES `inventory_stok` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `pengadaan_pr_detail`;
CREATE TABLE `pengadaan_pr_detail` (
  `id` int NOT NULL AUTO_INCREMENT,
  `id_pr_header` int NOT NULL,
  `kode_barang` varchar(100) NOT NULL,
  `jumlah` int NOT NULL,
  `satuan` varchar(50) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `id_pr_header` (`id_pr_header`),
  CONSTRAINT `pengadaan_pr_detail_ibfk_1` FOREIGN KEY (`id_pr_header`) REFERENCES `pengadaan_pr_header` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `pengadaan_pr_header`;
CREATE TABLE `pengadaan_pr_header` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nomor_pr` varchar(255) NOT NULL,
  `id_vendor` int NOT NULL,
  `status_pr` varchar(50) NOT NULL DEFAULT 'Draft',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `nomor_pr` (`nomor_pr`),
  KEY `id_vendor` (`id_vendor`),
  CONSTRAINT `pengadaan_pr_header_ibfk_1` FOREIGN KEY (`id_vendor`) REFERENCES `master_vendor` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `pengadaan_restock_requests`;
CREATE TABLE `pengadaan_restock_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `id_inventory_material` int NOT NULL,
  `nomor_wo` varchar(50) NOT NULL,
  `jumlah_diminta` int NOT NULL,
  `status` enum('Pending','Selesai') NOT NULL DEFAULT 'Pending',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_restock_material` (`id_inventory_material`),
  CONSTRAINT `fk_restock_material` FOREIGN KEY (`id_inventory_material`) REFERENCES `inventory_stok` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `pengajuan_ganti_email`;
CREATE TABLE `pengajuan_ganti_email` (
  `id` int NOT NULL AUTO_INCREMENT,
  `id_user` int NOT NULL,
  `email_baru` varchar(150) NOT NULL,
  `status` enum('Pending_Approval','Pending_Verification','Rejected','Completed') NOT NULL DEFAULT 'Pending_Approval',
  `token_verifikasi` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `id_user` (`id_user`),
  CONSTRAINT `pengajuan_ganti_email_ibfk_1` FOREIGN KEY (`id_user`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `penjualan_invoice`;
CREATE TABLE `penjualan_invoice` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nomor_invoice` varchar(50) NOT NULL,
  `nama_klien` varchar(100) NOT NULL,
  `deskripsi_pesanan` varchar(200) NOT NULL,
  `total_harga` decimal(15,2) NOT NULL,
  `status_pembayaran` enum('Lunas','Belum Lunas','Jatuh Tempo') DEFAULT 'Belum Lunas',
  `tanggal_invoice` date NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `nomor_invoice` (`nomor_invoice`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `penjualan_so_detail`;
CREATE TABLE `penjualan_so_detail` (
  `id` int NOT NULL AUTO_INCREMENT,
  `id_so_header` int NOT NULL,
  `kode_barang` varchar(100) NOT NULL,
  `qty` int NOT NULL,
  `harga_jual_satuan` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'Harga jual per unit saat SO dibuat (snapshot)',
  `hpp_snapshot` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'HPP per unit saat SO dibuat (snapshot historis)',
  PRIMARY KEY (`id`),
  KEY `id_so_header` (`id_so_header`),
  CONSTRAINT `penjualan_so_detail_ibfk_1` FOREIGN KEY (`id_so_header`) REFERENCES `penjualan_so_header` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `penjualan_so_header`;
CREATE TABLE `penjualan_so_header` (
  `id` int NOT NULL AUTO_INCREMENT,
  `no_so` varchar(100) NOT NULL,
  `id_customer` int NOT NULL COMMENT 'FK to pemasaran_leads.id_lead (Won_Deal)',
  `status` enum('Draft','Confirmed','Shipped') NOT NULL DEFAULT 'Draft',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `no_so` (`no_so`),
  KEY `id_customer` (`id_customer`),
  CONSTRAINT `penjualan_so_header_ibfk_1` FOREIGN KEY (`id_customer`) REFERENCES `pemasaran_leads` (`id_lead`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `qc_inspeksi`;
CREATE TABLE `qc_inspeksi` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nomor_seri_sepeda` varchar(50) NOT NULL,
  `uji_pengereman` tinyint(1) NOT NULL DEFAULT '0',
  `uji_shifting` tinyint(1) NOT NULL DEFAULT '0',
  `uji_alignment` tinyint(1) NOT NULL DEFAULT '0',
  `catatan_inspektur` text,
  `waktu_inspeksi` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `nama_lengkap` varchar(100) NOT NULL,
  `email` varchar(150) DEFAULT NULL,
  `foto_profil` varchar(255) DEFAULT NULL,
  `divisi_role` varchar(50) DEFAULT NULL,
  `status` enum('Aktif','Nonaktif') DEFAULT 'Aktif',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `api_token` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET FOREIGN_KEY_CHECKS = 1;
