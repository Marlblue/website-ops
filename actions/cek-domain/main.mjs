import { ambilRdap, pesanPengingat, tanggalIndonesia } from "../../lib/cek-domain.mjs";
import { kabari } from "../../lib/kabari.mjs";

const { DOMAIN, BATAS_HARI = "60", UJI = "false", WEBHOOK = "", RUN_URL = "" } = process.env;
const uji = UJI === "true";

async function kirim(teks) {
  if (uji || !WEBHOOK) return console.log(`Pesan (tidak dikirim): [${DOMAIN}] ${teks}`);
  const hasil = await kabari(teks, { webhook: WEBHOOK, label: DOMAIN });
  console.log(hasil.terkirim ? `Kabar terkirim ke grup (HTTP ${hasil.status}).` : `::error::Grup TIDAK dikabari (${hasil.alasan}).`);
}

// exitCode, bukan process.exit(): lihat catatan di actions/cek-situs/main.mjs.
async function main() {
  const data = await ambilRdap(DOMAIN);
  if (!data) {
    console.log(`::error::RDAP untuk ${DOMAIN} tidak terbaca dalam tiga percobaan.`);
    await kirim(`Masa berlaku domain ${DOMAIN} tidak bisa dicek minggu ini (RDAP tidak menjawab). Kalau berulang minggu depan, cek manual di registrar. Detail: ${RUN_URL}`);
    return 1;
  }

  const { sisa, pesan } = pesanPengingat(DOMAIN, data, { batasHari: Number(BATAS_HARI), paksa: uji });
  console.log(`${DOMAIN} habis ${tanggalIndonesia(data.habis)} (${sisa} hari lagi), registrar ${data.registrar}.`);
  if (pesan) await kirim(pesan);
  else console.log(`Masih lebih dari ${BATAS_HARI} hari, tidak ada kabar.`);
  return 0;
}

process.exitCode = await main();
