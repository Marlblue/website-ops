/**
 * Kirim satu pesan ke grup tim lewat webhook (Telegram sendMessage, Slack, atau Discord:
 * body-nya memuat `text` dan `content` sekaligus supaya ketiganya terima).
 *
 * Tidak pernah melempar. Hasilnya dikembalikan supaya pemanggil yang memutuskan apakah
 * pesan yang tidak terkirim cukup dicatat atau harus menggagalkan job.
 */
export async function kabari(teks, { webhook, label, fetchImpl = fetch, timeoutMs = 15_000 } = {}) {
  if (!webhook) return { terkirim: false, alasan: "webhook kosong" };
  const isi = label ? `[${label}] ${teks}` : teks;
  try {
    const res = await fetchImpl(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: isi, content: isi }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok ? { terkirim: true, status: res.status } : { terkirim: false, status: res.status, alasan: `webhook membalas HTTP ${res.status}` };
  } catch (err) {
    return { terkirim: false, alasan: `webhook tidak bisa dihubungi: ${err?.message ?? err}` };
  }
}
