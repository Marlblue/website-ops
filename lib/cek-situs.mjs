/**
 * Apakah situs benar-benar hidup: HTTP 200 DAN <title> memuat nama situs.
 *
 * Kode status saja tidak cukup, karena halaman parkir domain yang habis dan halaman
 * suspend hosting juga membalas 200. Penanda dicocokkan peka huruf besar-kecil, karena
 * judul halaman parkir biasanya cuma nama domain dalam huruf kecil.
 */

/**
 * Judul halaman tantangan anti-bot hosting (Imunify360 di DomaiNesia). Sesekali dipasang di
 * depan situs untuk IP runner GitHub; pengunjung biasa tidak melihatnya, dan aplikasinya
 * tidak tersentuh, jadi halaman ini tidak membuktikan situsnya hidup atau mati.
 */
const JUDUL_TANTANGAN = /^One moment, please/i;

export function judulHalaman(html) {
  const m = /<title[^>]*>([^<]*)/i.exec(html ?? "");
  return m ? m[1].trim() : "";
}

/** Satu kali periksa. `alasan` hanya ada kalau gagal, ditulis untuk dibaca manusia. */
export async function periksaSekali(url, penanda, { fetchImpl = fetch, timeoutMs = 30_000 } = {}) {
  let res;
  try {
    // Parameter acak memaksa permintaan sampai ke aplikasi, melewati cache proxy hosting
    // yang bisa menjawab HTML lama walaupun proses Node-nya sudah mati.
    const u = new URL(url);
    u.searchParams.set("uptime", String(Date.now()));
    res = await fetchImpl(u, { redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    // Kode dari undici (ECONNREFUSED, ENOTFOUND, UND_ERR_CONNECT_TIMEOUT, CERT_HAS_EXPIRED, ...)
    // ada di err.cause; tanpa itu pesannya cuma "fetch failed" dan penyebabnya tidak bisa dibedakan.
    const kode = err?.cause?.code ?? err?.name ?? "galat tak dikenal";
    return {
      ok: false,
      putus: true,
      alasan: `tidak bisa dihubungi sama sekali (${kode}): DNS, SSL, server mati, atau IP runner GitHub diblokir firewall hosting`,
    };
  }
  if (res.status !== 200) return { ok: false, status: res.status, alasan: `membalas HTTP ${res.status}` };

  const judul = judulHalaman(await res.text());
  if (JUDUL_TANTANGAN.test(judul)) {
    return { ok: false, tantangan: true, status: 200, judul, alasan: `tertahan halaman anti-bot hosting ("${judul}")` };
  }
  if (!judul.includes(penanda)) {
    return {
      ok: false,
      status: 200,
      judul,
      alasan:
        `membalas HTTP 200, tapi judulnya "${judul.slice(0, 100) || "kosong"}", bukan situs ini. ` +
        "Kemungkinan domain habis lalu jadi halaman parkir, atau hosting di-suspend",
    };
  }
  return { ok: true, status: 200, judul };
}

/**
 * Beberapa percobaan berjeda, supaya restart sesaat tidak langsung jadi alarm.
 *
 * Kegagalan sungguhan menang atas halaman tantangan: kalau satu percobaan membalas 503 dan
 * yang lain tertahan anti-bot, yang dilaporkan 503. Hasil bertanda `tantangan` hanya kalau
 * semua percobaan tertahan, artinya keadaan situs tidak bisa dipastikan dari runner ini.
 */
export async function cekSitus(url, penanda, { percobaan = 3, jedaMs = 20_000, tidur = (ms) => new Promise((r) => setTimeout(r, ms)), ...opsi } = {}) {
  let gagalSungguhan;
  let hasil;
  for (let i = 1; i <= percobaan; i++) {
    hasil = await periksaSekali(url, penanda, opsi);
    if (hasil.ok) return { ...hasil, percobaan: i };
    if (!hasil.tantangan) gagalSungguhan = hasil;
    if (i < percobaan) await tidur(jedaMs);
  }
  return { ...(gagalSungguhan ?? hasil), percobaan };
}

/**
 * Apakah job yang sama di run selesai sebelumnya dari workflow ini juga gagal.
 *
 * Dipakai untuk kegagalan `putus`: firewall hosting (Imunify360 di DomaiNesia) kadang memblokir
 * IP runner GitHub di tingkat koneksi, jadi semua percobaan dari runner yang sama gagal padahal
 * situsnya bisa dibuka pengunjung. Run berikutnya memakai IP lain, jadi baru dua run beruntun
 * yang gagal yang dianggap situsnya benar-benar mati.
 *
 * Run yang job-nya dilewati (misalnya jadwal job lain di workflow yang sama) tidak dihitung.
 * Mengembalikan null kalau tidak bisa dipastikan (token tanpa izin actions: read, API galat,
 * belum ada riwayat); pemanggil lalu memilih jalan aman, yaitu mengabari.
 */
export async function gagalJugaRunSebelumnya({ api = "https://api.github.com", repo, runId, job, token, fetchImpl = fetch }) {
  if (!repo || !runId || !job || !token) return null;
  const ambil = async (path) => {
    const res = await fetchImpl(`${api}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };
  try {
    const run = await ambil(`/repos/${repo}/actions/runs/${runId}`);
    const { workflow_runs: daftar = [] } = await ambil(`/repos/${repo}/actions/workflows/${run.workflow_id}/runs?status=completed&per_page=10`);
    for (const r of daftar) {
      if (String(r.id) === String(runId)) continue;
      const { jobs = [] } = await ambil(`/repos/${repo}/actions/runs/${r.id}/jobs`);
      const j = jobs.find((x) => x.name === job);
      if (!j || j.conclusion === "skipped") continue;
      return j.conclusion === "failure";
    }
    return null;
  } catch {
    return null;
  }
}
