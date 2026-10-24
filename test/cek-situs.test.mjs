import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cekSitus, gagalJugaRunSebelumnya, judulHalaman, periksaSekali } from "../lib/cek-situs.mjs";

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

  it("mengenali halaman tantangan anti-bot hosting, bukan sebagai halaman parkir", async () => {
    const h = await periksaSekali("https://nawwafresto.com/", "Nawwaf", { fetchImpl: halaman(200, "One moment, please...") });
    assert.deepEqual([h.ok, h.tantangan], [false, true]);
    assert.doesNotMatch(h.alasan, /halaman parkir/);
  });

  it("menyebut kode status selain 200", async () => {
    const h = await periksaSekali("https://x.com/", "X", { fetchImpl: halaman(503, "X") });
    assert.deepEqual([h.ok, h.alasan], [false, "membalas HTTP 503"]);
  });

  it("menyebut gagal terhubung kalau fetch melempar", async () => {
    const h = await periksaSekali("https://x.com/", "X", { fetchImpl: async () => { throw new Error("ENOTFOUND"); } });
    assert.match(h.alasan, /tidak bisa dihubungi/);
  });

  it("menandai putus dan menyebut kode galat dari err.cause", async () => {
    const fetchImpl = async () => { throw new TypeError("fetch failed", { cause: Object.assign(new Error("x"), { code: "ECONNREFUSED" }) }); };
    const h = await periksaSekali("https://x.com/", "X", { fetchImpl });
    assert.equal(h.putus, true);
    assert.match(h.alasan, /\(ECONNREFUSED\)/);
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

  it("menandai tantangan hanya kalau semua percobaan tertahan", async () => {
    const h = await cekSitus("https://x.com/", "X", { fetchImpl: halaman(200, "One moment, please..."), ...tanpaTidur });
    assert.deepEqual([h.ok, h.tantangan, h.percobaan], [false, true, 3]);
  });

  it("kegagalan sungguhan menang atas halaman tantangan", async () => {
    let n = 0;
    const fetchImpl = async () => (++n === 2 ? new Response("", { status: 503 }) : halaman(200, "One moment, please...")());
    const h = await cekSitus("https://x.com/", "X", { fetchImpl, ...tanpaTidur });
    assert.deepEqual([h.ok, h.tantangan, h.alasan, h.percobaan], [false, undefined, "membalas HTTP 503", 3]);
  });

  it("lolos kalau tantangan cuma sesaat", async () => {
    let n = 0;
    const fetchImpl = async () => (++n === 1 ? halaman(200, "One moment, please...")() : new Response("<title>X</title>"));
    const h = await cekSitus("https://x.com/", "X", { fetchImpl, ...tanpaTidur });
    assert.deepEqual([h.ok, h.percobaan], [true, 2]);
  });
});

describe("gagalJugaRunSebelumnya", () => {
  // runs: [{ id, jobs: [{ name, conclusion }] }], terbaru dulu; run 99 adalah run yang sedang jalan.
  const api = (runs) => async (url) => {
    const u = String(url);
    let isi;
    if (u.endsWith("/actions/runs/99")) isi = { workflow_id: 7 };
    else if (u.includes("/workflows/7/runs")) isi = { workflow_runs: runs.map(({ id }) => ({ id })) };
    else isi = { jobs: runs.find((r) => u.endsWith(`/runs/${r.id}/jobs`)).jobs };
    return Response.json(isi);
  };
  const tanya = (runs, lain = {}) => gagalJugaRunSebelumnya({ repo: "a/b", runId: 99, job: "situs", token: "t", fetchImpl: api(runs), ...lain });

  it("false kalau job yang sama di run sebelumnya lolos", async () => {
    assert.equal(await tanya([{ id: 5, jobs: [{ name: "situs", conclusion: "success" }] }]), false);
  });

  it("true kalau job yang sama di run sebelumnya gagal", async () => {
    assert.equal(await tanya([{ id: 5, jobs: [{ name: "situs", conclusion: "failure" }] }]), true);
  });

  it("melewati run yang job-nya dilewati atau tidak ada, dan run yang sedang jalan", async () => {
    const runs = [
      { id: 99, jobs: [] },
      { id: 6, jobs: [{ name: "situs", conclusion: "skipped" }, { name: "cron", conclusion: "success" }] },
      { id: 5, jobs: [{ name: "situs", conclusion: "failure" }] },
    ];
    assert.equal(await tanya(runs), true);
  });

  it("null kalau tidak bisa dipastikan", async () => {
    assert.equal(await tanya([]), null);
    assert.equal(await tanya([], { token: "" }), null);
    assert.equal(await tanya([], { fetchImpl: async () => new Response("", { status: 403 }) }), null);
  });
});
