import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cekSitus, judulHalaman, periksaSekali } from "../lib/cek-situs.mjs";

const halaman = (status, title) => async () => new Response(`<html><head><title>${title}</title></head><body>Kalih Signature</body></html>`, { status });
const tanpaTidur = { tidur: async () => {} };

describe("judulHalaman", () => {
  it("membaca isi <title>, termasuk yang beratribut", () => {
    assert.equal(judulHalaman('<title data-x="1"> Nawwaf &amp; Friends </title>'), "Nawwaf &amp; Friends");
    assert.equal(judulHalaman("<p>tanpa judul</p>"), "");
  });
});

describe("periksaSekali", () => {
  it("lolos kalau 200 dan judul memuat penanda", async () => {
    const h = await periksaSekali("https://kalihcoffee.com/", "Kalih Signature", { fetchImpl: halaman(200, "Kalih Signature | Cafe") });
    assert.equal(h.ok, true);
  });

  it("menangkap halaman parkir yang membalas 200, walau isi halamannya menyebut nama situs", async () => {
    for (const judul of ["kalihcoffee.com - This domain may be for sale", "Account Suspended", ""]) {
      const h = await periksaSekali("https://kalihcoffee.com/", "Kalih Signature", { fetchImpl: halaman(200, judul) });
      assert.equal(h.ok, false, judul);
      assert.match(h.alasan, /halaman parkir/);
    }
  });

  it("peka huruf besar-kecil, supaya judul parkir berisi nama domain tidak ikut cocok", async () => {
    const h = await periksaSekali("https://nawwafresto.com/", "Nawwaf", { fetchImpl: halaman(200, "nawwafresto.com parked") });
    assert.equal(h.ok, false);
  });

  it("menyebut kode status selain 200", async () => {
    const h = await periksaSekali("https://x.com/", "X", { fetchImpl: halaman(503, "X") });
    assert.deepEqual([h.ok, h.alasan], [false, "membalas HTTP 503"]);
  });

  it("menyebut gagal terhubung kalau fetch melempar", async () => {
    const h = await periksaSekali("https://x.com/", "X", { fetchImpl: async () => { throw new Error("ENOTFOUND"); } });
    assert.match(h.alasan, /tidak bisa dihubungi/);
  });

  it("menambahkan parameter acak supaya melewati cache proxy", async () => {
    let diminta;
    await periksaSekali("https://x.com/?a=1", "X", { fetchImpl: async (u) => { diminta = String(u); return new Response("<title>X</title>"); } });
    assert.match(diminta, /^https:\/\/x\.com\/\?a=1&uptime=\d+$/);
  });
});

describe("cekSitus", () => {
  it("berhenti di percobaan pertama yang lolos", async () => {
    let n = 0;
    const fetchImpl = async () => (++n < 2 ? new Response("", { status: 502 }) : new Response("<title>X</title>"));
    const h = await cekSitus("https://x.com/", "X", { fetchImpl, ...tanpaTidur });
    assert.deepEqual([h.ok, h.percobaan, n], [true, 2, 2]);
  });

  it("melaporkan percobaan terakhir kalau semuanya gagal", async () => {
    const h = await cekSitus("https://x.com/", "X", { fetchImpl: halaman(500, "X"), ...tanpaTidur });
    assert.deepEqual([h.ok, h.percobaan, h.alasan], [false, 3, "membalas HTTP 500"]);
  });
});
