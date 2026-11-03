/**
 * Cari link internal dan gambar yang rusak di seluruh halaman situs.
 *
 * Titik awalnya sitemap, bukan merayapi dari beranda: sitemap memuat semua artikel, termasuk
 * yang tidak ditautkan dari menu, dan jumlah halamannya jadi pasti. Dari tiap halaman diambil
 * <a href> yang menuju situs yang sama dan <img src> (termasuk cdn.sanity.io), lalu tiap tujuan
 * unik diperiksa sekali.
 *
 * Link ke situs luar sengaja tidak diperiksa: Instagram, Facebook, dan marketplace rutin
 * menolak permintaan dari server (403/429/999) walau halamannya hidup, jadi hasilnya alarm
 * palsu yang membuat laporan ini berhenti dibaca.
 *
 * Pelan dengan sengaja (beberapa permintaan sekaligus, berjeda): firewall hosting (Imunify360
 * di DomaiNesia) mencegat atau memblokir IP yang membuka ratusan halaman beruntun. Halaman
 * tantangan anti-bot dihitung "tertahan", bukan rusak, karena tidak membuktikan apa pun.
 */

import { judulHalaman } from "./cek-situs.mjs";

const JUDUL_TANTANGAN = /^One moment, please/i;

/** Isi <loc> dari sitemap. Sitemap index (berisi sitemap lain) diikuti satu tingkat. */
export function lokasiSitemap(xml) {
  return [...(xml ?? "").matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replaceAll("&amp;", "&"));
}

/**
 * Tujuan link dan gambar dalam satu halaman HTML, sudah jadi URL absolut tanpa #fragmen.
 * Yang diambil hanya yang berguna diperiksa: halaman di host yang sama, dan gambar dari host
 * yang sama atau `hostGambar`. Aset build Next (/_next/) dilewati: berkasnya ikut tiap deploy,
 * dan /_next/image memproses ulang gambar di setiap permintaan.
 */
export function tujuanDiHalaman(html, halamanUrl, { hostGambar = ["cdn.sanity.io"] } = {}) {
  const asal = new URL(halamanUrl);
  const hasil = new Map();
  const tambah = (mentah, jenis) => {
    const nilai = (mentah ?? "").trim().replaceAll("&amp;", "&");
    if (!nilai || /^(#|mailto:|tel:|javascript:|data:|blob:|sms:|whatsapp:)/i.test(nilai)) return;
    let u;
    try {
      u = new URL(nilai, asal);
    } catch {
      return;
    }
    if (!/^https?:$/.test(u.protocol)) return;
    u.hash = "";
    const internal = u.host === asal.host;
    if (internal && u.pathname.startsWith("/_next/")) return;
    if (jenis === "halaman" && !internal) return;
    if (jenis === "gambar" && !internal && !hostGambar.includes(u.host)) return;
    if (!hasil.has(u.href)) hasil.set(u.href, jenis);
  };
  for (const m of (html ?? "").matchAll(/<a\b[^>]*?\shref\s*=\s*["']([^"']*)["']/gi)) tambah(m[1], "halaman");
  for (const m of (html ?? "").matchAll(/<img\b[^>]*?\ssrc\s*=\s*["']([^"']*)["']/gi)) tambah(m[1], "gambar");
  return hasil;
}

/**
 * Periksa satu alamat. `rusak` hanya untuk jawaban yang memang membuktikan rusak (4xx selain
 * 403/429, atau 5xx); halaman anti-bot, 403/429, dan gagal koneksi = `tertahan`.
 */
export async function periksaAlamat(url, { fetchImpl = fetch, timeoutMs = 30_000, bacaJudul = false } = {}) {
  let res;
  try {
    res = await fetchImpl(url, { redirect: "follow", signal: AbortSignal.timeout(timeoutMs), headers: { "User-Agent": "website-ops cek-link" } });
  } catch (err) {
    return { status: 0, tertahan: true, alasan: `tidak bisa dihubungi (${err?.cause?.code ?? err?.name ?? "galat"})` };
  }
  if (res.status === 403 || res.status === 429) {
    await res.body?.cancel();
    return { status: res.status, tertahan: true, alasan: `HTTP ${res.status} (kemungkinan firewall hosting)` };
  }
  if (res.status >= 400) {
    await res.body?.cancel();
    return { status: res.status, rusak: true, alasan: `HTTP ${res.status}` };
  }
  const tipe = res.headers.get("content-type") ?? "";
  if (bacaJudul || tipe.includes("text/html")) {
    const html = await res.text();
    if (JUDUL_TANTANGAN.test(judulHalaman(html))) return { status: res.status, tertahan: true, alasan: "halaman anti-bot hosting" };
    return { status: res.status, html, akhir: res.url || url };
  }
  await res.body?.cancel();
  return { status: res.status, akhir: res.url || url };
}

/** Jalankan `kerja` untuk tiap item, paling banyak `serentak` sekaligus, berjeda `jedaMs`. */
export async function satuSatu(items, kerja, { serentak = 3, jedaMs = 300, tidur = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const hasil = new Array(items.length);
  let i = 0;
  const pekerja = async () => {
    while (i < items.length) {
      const k = i++;
      hasil[k] = await kerja(items[k], k);
      if (jedaMs) await tidur(jedaMs);
    }
  };
  await Promise.all(Array.from({ length: Math.min(serentak, items.length) }, pekerja));
  return hasil;
}

/**
 * Pemeriksaan penuh. Mengembalikan daftar yang rusak (dengan halaman yang menautkannya),
 * jumlah yang tertahan, dan angka ringkas untuk log.
 *
 * `batasTertahan`: kalau bagian yang tertahan lebih dari ini, hasilnya `tidakPasti` (runner
 * ini dicegat hosting), dan pemanggil tidak mengabari grup supaya tidak ada alarm palsu.
 */
export async function cekLink(sitemapUrl, { fetchImpl = fetch, serentak = 3, jedaMs = 300, tidur, batasTertahan = 0.2, hostGambar, log = () => {} } = {}) {
  const opsi = { fetchImpl };
  const antre = { serentak, jedaMs, tidur };

  // 1. Daftar halaman dari sitemap (ikuti sitemap index satu tingkat).
  const peta = await periksaAlamat(sitemapUrl, { ...opsi, bacaJudul: true });
  if (!peta.html) throw new Error(`sitemap ${sitemapUrl} tidak terbaca: ${peta.alasan ?? `HTTP ${peta.status}`}`);
  let halaman = lokasiSitemap(peta.html);
  if (/<sitemapindex/i.test(peta.html)) {
    const anak = await satuSatu(halaman, (u) => periksaAlamat(u, { ...opsi, bacaJudul: true }), antre);
    halaman = anak.flatMap((a) => lokasiSitemap(a.html));
  }
  halaman = [...new Set(halaman)];
  log(`${halaman.length} halaman dari sitemap.`);

  // 2. Buka tiap halaman, kumpulkan tujuan link dan gambarnya.
  const sumber = new Map(); // tujuan -> Set halaman yang menautkan
  const hasilHalaman = await satuSatu(
    halaman,
    async (u) => {
      const h = await periksaAlamat(u, opsi);
      if (h.html) for (const [tujuan] of tujuanDiHalaman(h.html, u, { hostGambar })) (sumber.get(tujuan) ?? sumber.set(tujuan, new Set()).get(tujuan)).add(u);
      return h;
    },
    antre,
  );

  const rusak = [];
  let tertahan = 0;
  hasilHalaman.forEach((h, k) => {
    if (h.rusak) rusak.push({ url: halaman[k], alasan: `${h.alasan} (halaman ini ada di sitemap)`, dari: [] });
    if (h.tertahan) tertahan++;
  });

  // 3. Periksa tujuan yang belum diperiksa sebagai halaman sitemap.
  const sudah = new Set(halaman);
  const tujuan = [...sumber.keys()].filter((u) => !sudah.has(u));
  log(`${tujuan.length} tujuan link/gambar lain diperiksa.`);
  const hasilTujuan = await satuSatu(tujuan, (u) => periksaAlamat(u, opsi), antre);
  hasilTujuan.forEach((h, k) => {
    if (h.rusak) rusak.push({ url: tujuan[k], alasan: h.alasan, dari: [...sumber.get(tujuan[k])] });
    if (h.tertahan) tertahan++;
  });

  // Halaman sitemap yang rusak tapi juga ditautkan dari halaman lain: lengkapi asalnya.
  for (const r of rusak) if (!r.dari.length && sumber.has(r.url)) r.dari = [...sumber.get(r.url)];

  const total = halaman.length + tujuan.length;
  return { halaman: halaman.length, diperiksa: total, rusak, tertahan, tidakPasti: total > 0 && tertahan / total > batasTertahan };
}

/** Pesan ringkas untuk grup: paling banyak `maks` link, tiap link dengan satu halaman asal. */
export function ringkasRusak(rusak, { maks = 10 } = {}) {
  const baris = rusak.slice(0, maks).map((r) => {
    const asal = r.dari.length ? ` di ${r.dari[0]}${r.dari.length > 1 ? ` (+${r.dari.length - 1} halaman lain)` : ""}` : "";
    return `- ${r.url}: ${r.alasan}${asal}`;
  });
  if (rusak.length > maks) baris.push(`...dan ${rusak.length - maks} lainnya (lihat log run).`);
  return baris.join("\n");
}
