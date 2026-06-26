// Titik Nol Pabrik Motekar Bike (Origin)
const ORIGIN_ADDRESS = "Unpas Setia Budhi, Gegerkalong, Kec. Sukasari, Kota Bandung, Jawa Barat";
const BASE_RATE = 25000;
const RATE_PER_KM = 3500;
function getHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
function calculateFinalShipping(distanceKm, isHaversine, total_qty) {
    let ongkir_dasar = 0;
    if (isHaversine) {
        ongkir_dasar = distanceKm * 3500;
    }
    else {
        if (distanceKm <= 50) {
            ongkir_dasar = 150000;
        }
        else if (distanceKm <= 200) {
            ongkir_dasar = 150000 + ((distanceKm - 50) * 4500);
        }
        else {
            ongkir_dasar = 825000 + ((distanceKm - 200) * 3000);
        }
    }
    let finalOngkir = 0;
    let keterangan = '';
    if (distanceKm <= 5) {
        finalOngkir = 0;
        keterangan = "Gratis (Pengiriman Internal Radius Kawasan <= 5 KM)";
    }
    else if (distanceKm <= 200) {
        if (total_qty <= 2) {
            finalOngkir = ongkir_dasar;
            keterangan = "Tarif Normal Sepulau (Pesanan Reguler)";
        }
        else if (total_qty <= 5) {
            finalOngkir = ongkir_dasar * 0.5;
            keterangan = "Mendapat Subsidi Diskon 50% (Pesanan Grosir)";
        }
        else {
            finalOngkir = 0;
            keterangan = "Gratis Ongkir Sepulau (Partai Besar)";
        }
    }
    else {
        if (total_qty < 10) {
            finalOngkir = ongkir_dasar;
            keterangan = "Tarif Normal Antarpulau (Pesanan Reguler)";
        }
        else if (total_qty <= 20) {
            finalOngkir = Math.max(0, ongkir_dasar - 1000000);
            keterangan = "Mendapat Subsidi Potongan Rp 1 Juta (Grosir Antarpulau)";
        }
        else {
            finalOngkir = 0;
            keterangan = "Gratis Ongkir Antarpulau (Partai Ekstra Besar)";
        }
    }
    return { ongkir: Math.round(finalOngkir), pesan: keterangan };
}
export const calculateShipping = async (req, res) => {
    try {
        const { latitude, longitude, alamat, total_qty } = req.body;
        const qty = parseInt(total_qty) || 1;
        if (!alamat && (!latitude || !longitude)) {
            res.status(400).json({ success: false, message: 'Harap berikan titik koordinat atau alamat lengkap.' });
            return;
        }
        const apiKey = process.env.GOOGLE_MAPS_API_KEY;
        if (!apiKey) {
            // Jika API Key tidak ada, kembalikan response sukses tapi dengan jarak 0 agar UI fallback ke manual
            res.json({
                success: false,
                message: 'API Key Google Maps belum dikonfigurasi di backend. Gunakan input manual.',
                jarak_km: 0,
                ongkir: 0
            });
            return;
        }
        const origin = encodeURIComponent(ORIGIN_ADDRESS);
        let destination = '';
        if (latitude && longitude) {
            destination = `${latitude},${longitude}`;
        }
        else {
            destination = encodeURIComponent(alamat);
        }
        const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${destination}&key=${apiKey}`;
        // Node v18+ has native fetch. If using older node, we might need axios or node-fetch.
        // The project has TS setup, let's use global fetch.
        const response = await fetch(url);
        const data = await response.json();
        if (data.status !== 'OK') {
            throw new Error(`Google API Error: ${data.status} - ${data.error_message || ''}`);
        }
        const element = data.rows[0].elements[0];
        let distanceKm = 0;
        let isHaversine = false;
        if (element.status === 'ZERO_RESULTS' || element.status === 'NOT_FOUND') {
            // PROTOKOL HAVERSINE FALLBACK
            if (!latitude || !longitude) {
                throw new Error("Rute darat tidak ditemukan dan koordinat tidak tersedia untuk Kalkulasi Kargo Udara/Laut.");
            }
            const PABRIK_LAT = -6.8617;
            const PABRIK_LNG = 107.5921;
            distanceKm = getHaversineDistance(PABRIK_LAT, PABRIK_LNG, parseFloat(latitude), parseFloat(longitude));
            isHaversine = true;
        }
        else if (element.status !== 'OK') {
            throw new Error(`Rute tidak ditemukan: ${element.status}`);
        }
        else {
            distanceKm = element.distance.value / 1000;
        }
        const pricing = calculateFinalShipping(distanceKm, isHaversine, qty);
        res.json({
            success: true,
            jarak_km: parseFloat(distanceKm.toFixed(2)),
            ongkir: pricing.ongkir,
            keterangan_ongkir: pricing.pesan,
            origin_address: data.origin_addresses[0],
            destination_address: data.destination_addresses[0]
        });
    }
    catch (error) {
        console.error('[calculateShipping] Error/Timeout:', error.message);
        const { latitude, longitude, total_qty } = req.body;
        const qty = parseInt(total_qty) || 1;
        if (latitude && longitude) {
            const PABRIK_LAT = -6.8617;
            const PABRIK_LNG = 107.5921;
            const distanceKm = getHaversineDistance(PABRIK_LAT, PABRIK_LNG, parseFloat(latitude), parseFloat(longitude));
            const pricing = calculateFinalShipping(distanceKm, true, qty);
            res.json({
                success: true,
                message: 'Menggunakan perhitungan Kargo Udara/Laut (Sistem Peta sedang sibuk)',
                jarak_km: parseFloat(distanceKm.toFixed(2)),
                ongkir: pricing.ongkir,
                keterangan_ongkir: pricing.pesan,
                origin_address: 'Pabrik Motekar',
                destination_address: 'Alamat Customer'
            });
        }
        else {
            res.json({
                success: false,
                message: 'Gagal menghitung rute dan koordinat tidak tersedia.',
                jarak_km: 0,
                ongkir: 0
            });
        }
    }
};
