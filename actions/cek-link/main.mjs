import { cekLink, ringkasRusak } from "../../lib/cek-link.mjs";
import { kabari } from "../../lib/kabari.mjs";

const { SITEMAP, WEBHOOK = "", LABEL = "", RUN_URL = "" } = process.env;

// exitCode, bukan process.exit(): lihat catatan di actions/cek-situs/main.mjs.
async function main() {
  let hasil;
  try {
    hasil = await cekLink(SITEMAP, { log: (t) => console.log(t) });
  } catch (err) {
    // Sitemap tidak terbaca biasanya berarti situsnya sendiri bermasalah, dan itu urusan
    // cek-situs yang jalan tiap 30 menit. Di sini cukup merah, tanpa pesan kedua ke grup.
    console.log(`::error::${err.message}`);
    return 1;
  }

  const { halaman, diperiksa, rusak, tertahan, tidakPasti } = hasil;
  console.log(`${diperiksa} alamat diperiksa (${halaman} halaman sitemap), ${rusak.length} rusak, ${tertahan} tertahan firewall.`);
  for (const r of rusak) console.log(`RUSAK ${r.url}: ${r.alasan}${r.dari.length ? `\n  ditautkan dari: ${r.dari.join(", ")}` : ""}`);

  if (tidakPasti) {
    // Runner ini dicegat hosting; minggu depan memakai IP lain.
    console.log(`::warning::${tertahan} dari ${diperiksa} alamat tertahan firewall hosting, hasil minggu ini tidak bisa dipastikan. Grup tidak dikabari.`);
    return 0;
  }
  if (!rusak.length) {
    console.log("OK: tidak ada link atau gambar rusak.");
    return 0;
  }

  const pesan = `LINK RUSAK: ${rusak.length} link/gambar di situs tidak bisa dibuka.\n${ringkasRusak(rusak)}\nDetail: ${RUN_URL}`;
  const kabar = await kabari(pesan, { webhook: WEBHOOK, label: LABEL });
  if (WEBHOOK && !kabar.terkirim) console.log(`::error::Grup TIDAK dikabari (${kabar.alasan}). Periksa OPS_ALERT_WEBHOOK_URL.`);
  return 1;
}

process.exitCode = await main();
