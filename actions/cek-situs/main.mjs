import { cekSitus } from "../../lib/cek-situs.mjs";
import { kabari } from "../../lib/kabari.mjs";

const { URL: url, PENANDA, WEBHOOK = "", LABEL = "", RUN_URL = "" } = process.env;

// exitCode, bukan process.exit(): keluar paksa saat koneksi fetch masih ditutup membuat
// Node di Windows crash, dan di mana pun bisa memotong log yang belum tertulis.
async function main() {
  const hasil = await cekSitus(url, PENANDA);
  if (hasil.ok) {
    console.log(`OK: HTTP 200 dan judul memuat "${PENANDA}" pada percobaan ke-${hasil.percobaan}.`);
    return 0;
  }

  const ringkas = `${url} gagal dalam ${hasil.percobaan} percobaan: ${hasil.alasan}.`;
  console.log(`::error::${ringkas}`);
  // Dikirim di setiap run yang gagal: pengingat berkala selama situs mati memang yang
  // diinginkan, dan run terjadwal tidak saling mengingat.
  const kabar = await kabari(`SITUS BERMASALAH: ${ringkas} Detail: ${RUN_URL}`, { webhook: WEBHOOK, label: LABEL });
  if (WEBHOOK && !kabar.terkirim) console.log(`::error::Grup TIDAK dikabari (${kabar.alasan}). Periksa OPS_ALERT_WEBHOOK_URL.`);
  return 1;
}

process.exitCode = await main();
