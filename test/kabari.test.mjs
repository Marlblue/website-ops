import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { kabari } from "../lib/kabari.mjs";

describe("kabari", () => {
  it("mengirim text dan content dengan awalan label", async () => {
    let body;
    const hasil = await kabari("Deploy BERHASIL", {
      webhook: "https://contoh/hook",
      label: "kalihcoffee.com",
      fetchImpl: async (_u, init) => { body = JSON.parse(init.body); return new Response("ok"); },
    });
    assert.equal(hasil.terkirim, true);
    assert.deepEqual(body, { text: "[kalihcoffee.com] Deploy BERHASIL", content: "[kalihcoffee.com] Deploy BERHASIL" });
  });

  it("tidak mengirim apa pun kalau webhook kosong", async () => {
    let dipanggil = false;
    const hasil = await kabari("x", { webhook: "", fetchImpl: async () => { dipanggil = true; } });
    assert.deepEqual([hasil.terkirim, dipanggil], [false, false]);
  });

  it("tidak melempar saat webhook menolak atau tak terjangkau", async () => {
    assert.match((await kabari("x", { webhook: "h", fetchImpl: async () => new Response("", { status: 401 }) })).alasan, /HTTP 401/);
    assert.match((await kabari("x", { webhook: "h", fetchImpl: async () => { throw new Error("ECONNRESET"); } })).alasan, /ECONNRESET/);
  });
});
