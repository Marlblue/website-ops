/**
 * Masa berlaku domain .com dari RDAP Verisign: data publik registry, tanpa login ke
 * registrar mana pun.
 */

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const HARI_MS = 86_400_000;

export function tanggalIndonesia(iso) {
  // Tanggal kedaluwarsa dibaca dalam WIB, zona tempat orang yang memperpanjang.
  const d = new Date(new Date(iso).getTime() + 7 * 3_600_000);
  return `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Ambil tanggal habis dan nama registrar dari jawaban RDAP. null kalau bentuknya tak dikenal. */
export function bacaRdap(json) {
  const habis = json?.events?.find((e) => e.eventAction === "expiration")?.eventDate;
  if (!habis) return null;
  const reg = json.entities?.find((e) => e.roles?.includes("registrar"));
  const registrar = reg?.vcardArray?.[1]?.find((v) => v[0] === "fn")?.[3] ?? "registrar domain";
  return { habis, registrar };
}

/**
 * Pesan pengingat, atau null kalau masih lebih dari `batasHari`. Pesannya ditulis siap
 * diteruskan ke pemegang akun domain, yang di tim ini bukan orang yang membaca grup.
 */
export function pesanPengingat(domain, { habis, registrar }, { sekarang = Date.now(), batasHari = 60, paksa = false } = {}) {
  const sisa = Math.floor((new Date(habis).getTime() - sekarang) / HARI_MS);
  if (sisa > batasHari && !paksa) return { sisa, pesan: null };
  const tingkat = sisa <= 14 ? "MENDESAK, DOMAIN HAMPIR HABIS" : "Pengingat domain";
  const keadaan = sisa < 0 ? `sudah habis ${-sisa} hari lalu` : `habis ${tanggalIndonesia(habis)} (${sisa} hari lagi)`;
  return {
    sisa,
    pesan:
      `${tingkat}: ${domain} ${keadaan}. Perpanjang lewat ${registrar}. ` +
      "Mohon diteruskan ke pemegang akun domain. Kalau sampai habis, situsnya berubah jadi halaman parkir.",
  };
}

export async function ambilRdap(domain, { fetchImpl = fetch, percobaan = 3, jedaMs = 20_000, tidur = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  for (let i = 1; i <= percobaan; i++) {
    try {
      const res = await fetchImpl(`https://rdap.verisign.com/com/v1/domain/${encodeURIComponent(domain)}`, { signal: AbortSignal.timeout(30_000) });
      if (res.ok) {
        const data = bacaRdap(await res.json());
        if (data) return data;
      }
    } catch {
      // dicoba lagi di bawah
    }
    if (i < percobaan) await tidur(jedaMs);
  }
  return null;
}
