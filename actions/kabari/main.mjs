import { kabari } from "../../lib/kabari.mjs";

const { PESAN = "", WEBHOOK = "", LABEL = "", WAJIB = "false" } = process.env;

// exitCode, bukan process.exit(): lihat catatan di actions/cek-situs/main.mjs.
async function main() {
  if (!WEBHOOK) {
    console.log(`OPS_ALERT_WEBHOOK_URL kosong, pesan tidak dikirim: ${PESAN}`);
    return 0;
  }
  const hasil = await kabari(PESAN, { webhook: WEBHOOK, label: LABEL });
  if (hasil.terkirim) {
    console.log(`Kabar terkirim ke grup (HTTP ${hasil.status}).`);
    return 0;
  }
  // Penyebab tersering: token bot diganti, grupnya dihapus, atau bot dikeluarkan dari grup.
  console.log(`::${WAJIB === "true" ? "error" : "warning"}::Grup TIDAK dikabari (${hasil.alasan}). Periksa OPS_ALERT_WEBHOOK_URL.`);
  return WAJIB === "true" ? 1 : 0;
}

process.exitCode = await main();
