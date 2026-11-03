import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cekLink, lokasiSitemap, periksaAlamat, ringkasRusak, satuSatu, tujuanDiHalaman } from "../lib/cek-link.mjs";

const html = (isi, title = "Situs") => new Response(`<html><head><title>${title}</title></head><body>${isi}</body></html>`, { status: 200, headers: { "content-type": "text/html" } });
const xml = (isi) => new Response(isi, { status: 200, headers: { "content-type": "application/xml" } });
const kosong = (status) => new Response("", { status });
const tanpaJeda = { jedaMs: 0, tidur: async () => {} };

/** fetch palsu dari peta url -> fungsi pembuat Response. */
function situs(peta) {
  const dipanggil = [];
  const fetchImpl = async (u) => {
    const kunci = String(u);
    dipanggil.push(kunci);
    const buat = peta[kunci];
    if (!buat) return kosong(404);
    if (buat instanceof Error) throw buat;
    return buat();
  };
  return { fetchImpl, dipanggil };
}

describe("lokasiSitemap", () => {
  it("membaca semua <loc>, termasuk &amp;", () => {
    assert.deepEqual(lokasiSitemap("<urlset><url><loc> https://a.com/ </loc></url><url><loc>https://a.com/x?a=1&amp;b=2</loc></url></urlset>"), [
      "https://a.com/",
      "https://a.com/x?a=1&b=2",
    ]);
  });
});

describe("tujuanDiHalaman", () => {
  const ambil = (isi) => [...tujuanDiHalaman(isi, "https://kalihcoffee.com/artikel/kopi").entries()];

  it("mengambil link internal (relatif dan absolut) tanpa #fragmen", () => {
    assert.deepEqual(ambil('<a href="/menu#atas">m</a><a class="x" href="https://kalihcoffee.com/kontak">k</a><a href="lain">l</a>'), [
      ["https://kalihcoffee.com/menu", "halaman"],
      ["https://kalihcoffee.com/kontak", "halaman"],
      ["https://kalihcoffee.com/artikel/lain", "halaman"],
    ]);
  });

  it("melewati link luar, mailto, tel, wa, anchor, dan aset /_next/", () => {
    assert.deepEqual(ambil('<a href="https://instagram.com/x">i</a><a href="mailto:a@b.c">e</a><a href="tel:08">t</a><a href="#faq">f</a><a href="/_next/static/a.js">n</a><img src="/_next/image?url=x">'), []);
  });

  it("mengambil gambar internal dan cdn.sanity.io, bukan gambar host lain", () => {
    assert.deepEqual(ambil('<img alt="a" src="https://cdn.sanity.io/images/p/d/a.jpg"><img src="/logo.png"><img src="https://lh3.googleusercontent.com/x">'), [
      ["https://cdn.sanity.io/images/p/d/a.jpg", "gambar"],
      ["https://kalihcoffee.com/logo.png", "gambar"],
    ]);
  });
});

describe("periksaAlamat", () => {
  it("404 dan 5xx = rusak", async () => {
    for (const s of [404, 410, 500]) {
      const h = await periksaAlamat("https://a.com/x", { fetchImpl: async () => kosong(s) });
      assert.equal(h.rusak, true, String(s));
    }
  });

  it("403, 429, gagal koneksi, dan halaman anti-bot = tertahan, bukan rusak", async () => {
    const kasus = [async () => kosong(403), async () => kosong(429), async () => { throw new Error("x"); }, async () => html("", "One moment, please...")];
    for (const fetchImpl of kasus) {
      const h = await periksaAlamat("https://a.com/x", { fetchImpl });
      assert.deepEqual([h.rusak, h.tertahan], [undefined, true]);
    }
  });

  it("mengembalikan HTML halaman yang sehat", async () => {
    const h = await periksaAlamat("https://a.com/", { fetchImpl: async () => html("<p>hai</p>") });
    assert.match(h.html, /hai/);
  });
});

describe("satuSatu", () => {
  it("tidak pernah melebihi batas serentak dan urutan hasil tetap", async () => {
    let jalan = 0;
    let puncak = 0;
    const hasil = await satuSatu(
      [1, 2, 3, 4, 5, 6],
      async (n) => {
        puncak = Math.max(puncak, ++jalan);
        await new Promise((r) => setTimeout(r, 5));
        jalan--;
        return n * 10;
      },
      { serentak: 2, ...tanpaJeda },
    );
    assert.deepEqual(hasil, [10, 20, 30, 40, 50, 60]);
    assert.equal(puncak, 2);
  });
});

describe("cekLink", () => {
  const sitemap = "https://a.com/sitemap.xml";

  it("menemukan link dan gambar rusak beserta halaman asalnya", async () => {
    const { fetchImpl } = situs({
      [sitemap]: () => xml("<urlset><url><loc>https://a.com/</loc></url><url><loc>https://a.com/artikel-1</loc></url></urlset>"),
      "https://a.com/": () => html('<a href="/artikel-1">1</a><a href="/hilang">x</a>'),
      "https://a.com/artikel-1": () => html('<a href="/hilang">x</a><img src="https://cdn.sanity.io/rusak.jpg"><img src="/ok.png">'),
      "https://a.com/ok.png": () => kosong(200),
      "https://cdn.sanity.io/rusak.jpg": () => kosong(404),
    });
    const h = await cekLink(sitemap, { fetchImpl, ...tanpaJeda });
    assert.equal(h.halaman, 2);
    assert.deepEqual(
      h.rusak.map((r) => [r.url, r.dari]),
      [
        ["https://a.com/hilang", ["https://a.com/", "https://a.com/artikel-1"]],
        ["https://cdn.sanity.io/rusak.jpg", ["https://a.com/artikel-1"]],
      ],
    );
    assert.equal(h.tidakPasti, false);
  });

  it("halaman yang ada di sitemap tapi rusak ikut dilaporkan", async () => {
    const { fetchImpl } = situs({
      [sitemap]: () => xml("<urlset><url><loc>https://a.com/</loc></url><url><loc>https://a.com/dihapus</loc></url></urlset>"),
      "https://a.com/": () => html('<a href="/dihapus">d</a>'),
    });
    const h = await cekLink(sitemap, { fetchImpl, ...tanpaJeda });
    assert.equal(h.rusak.length, 1);
    assert.match(h.rusak[0].alasan, /ada di sitemap/);
    assert.deepEqual(h.rusak[0].dari, ["https://a.com/"]);
  });

  it("tiap tujuan diperiksa sekali walau ditautkan banyak halaman", async () => {
    const { fetchImpl, dipanggil } = situs({
      [sitemap]: () => xml("<urlset><url><loc>https://a.com/1</loc></url><url><loc>https://a.com/2</loc></url></urlset>"),
      "https://a.com/1": () => html('<a href="/kontak">k</a>'),
      "https://a.com/2": () => html('<a href="/kontak">k</a>'),
      "https://a.com/kontak": () => html(""),
    });
    await cekLink(sitemap, { fetchImpl, ...tanpaJeda });
    assert.equal(dipanggil.filter((u) => u === "https://a.com/kontak").length, 1);
  });

  it("mengikuti sitemap index", async () => {
    const { fetchImpl } = situs({
      [sitemap]: () => xml("<sitemapindex><sitemap><loc>https://a.com/s1.xml</loc></sitemap></sitemapindex>"),
      "https://a.com/s1.xml": () => xml("<urlset><url><loc>https://a.com/</loc></url></urlset>"),
      "https://a.com/": () => html(""),
    });
    const h = await cekLink(sitemap, { fetchImpl, ...tanpaJeda });
    assert.equal(h.halaman, 1);
  });

  it("kalau sebagian besar tertahan firewall, hasilnya tidak pasti", async () => {
    const { fetchImpl } = situs({
      [sitemap]: () => xml("<urlset><url><loc>https://a.com/1</loc></url><url><loc>https://a.com/2</loc></url></urlset>"),
      "https://a.com/1": () => html("", "One moment, please..."),
      "https://a.com/2": () => kosong(403),
    });
    const h = await cekLink(sitemap, { fetchImpl, ...tanpaJeda });
    assert.deepEqual([h.rusak.length, h.tertahan, h.tidakPasti], [0, 2, true]);
  });

  it("sitemap yang tidak terbaca melempar galat yang jelas", async () => {
    const { fetchImpl } = situs({});
    await assert.rejects(cekLink(sitemap, { fetchImpl, ...tanpaJeda }), /sitemap .* tidak terbaca/);
  });
});

describe("ringkasRusak", () => {
  it("membatasi jumlah baris dan menyebut sisanya", () => {
    const rusak = Array.from({ length: 12 }, (_, i) => ({ url: `https://a.com/${i}`, alasan: "HTTP 404", dari: ["https://a.com/", "https://a.com/b"] }));
    const teks = ringkasRusak(rusak, { maks: 2 });
    assert.equal(teks.split("\n").length, 3);
    assert.match(teks, /\+1 halaman lain/);
    assert.match(teks, /dan 10 lainnya/);
  });
});
