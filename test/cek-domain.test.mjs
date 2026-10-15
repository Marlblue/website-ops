import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ambilRdap, bacaRdap, pesanPengingat, tanggalIndonesia } from "../lib/cek-domain.mjs";

// Bentuk jawaban RDAP Verisign, dipangkas ke bagian yang dibaca.
const rdap = (habis) => ({
  events: [{ eventAction: "registration", eventDate: "2024-07-23T03:00:00Z" }, { eventAction: "expiration", eventDate: habis }],
  entities: [{ roles: ["registrar"], vcardArray: ["vcard", [["version", {}, "text", "4.0"], ["fn", {}, "text", "CV. Rumahweb Indonesia"]]] }],
});
const HARI = 86_400_000;
const SEKARANG = Date.parse("2027-05-01T01:00:00Z");

describe("bacaRdap", () => {
  it("membaca tanggal habis dan registrar", () => {
    assert.deepEqual(bacaRdap(rdap("2027-07-23T03:00:00Z")), { habis: "2027-07-23T03:00:00Z", registrar: "CV. Rumahweb Indonesia" });
  });
  it("null untuk jawaban tanpa tanggal habis", () => {
    assert.equal(bacaRdap({ errorCode: 404 }), null);
  });
});

describe("tanggalIndonesia", () => {
  it("memakai nama bulan Indonesia dan zona WIB", () => {
    assert.equal(tanggalIndonesia("2027-07-23T03:00:00Z"), "23 Juli 2027");
    // 20.00 UTC sudah tanggal berikutnya di WIB.
    assert.equal(tanggalIndonesia("2027-09-30T20:00:00Z"), "1 Oktober 2027");
  });
});

describe("pesanPengingat", () => {
  const data = (sisaHari) => ({ habis: new Date(SEKARANG + sisaHari * HARI + 1000).toISOString(), registrar: "CV. Rumahweb Indonesia" });

  it("diam kalau masih lebih dari batas", () => {
    assert.equal(pesanPengingat("kalihcoffee.com", data(61), { sekarang: SEKARANG }).pesan, null);
  });
  it("mengingatkan mulai di batas, menyebut registrar dan siap diteruskan", () => {
    const { pesan } = pesanPengingat("kalihcoffee.com", data(60), { sekarang: SEKARANG });
    assert.match(pesan, /^Pengingat domain: kalihcoffee\.com habis .* \(60 hari lagi\)/);
    assert.match(pesan, /Rumahweb/);
    assert.match(pesan, /diteruskan ke pemegang akun domain/);
  });
  it("MENDESAK kalau 14 hari atau kurang", () => {
    assert.match(pesanPengingat("x.com", data(14), { sekarang: SEKARANG }).pesan, /^MENDESAK/);
  });
  it("menyebut kalau sudah lewat", () => {
    assert.match(pesanPengingat("x.com", data(-3), { sekarang: SEKARANG }).pesan, /sudah habis 3 hari lalu/);
  });
  it("mode paksa selalu menghasilkan pesan", () => {
    assert.ok(pesanPengingat("x.com", data(300), { sekarang: SEKARANG, paksa: true }).pesan);
  });
});

describe("ambilRdap", () => {
  it("mencoba ulang sampai jawabannya terbaca", async () => {
    let n = 0;
    const fetchImpl = async () => (++n < 3 ? new Response("down", { status: 503 }) : Response.json(rdap("2027-07-23T03:00:00Z")));
    const hasil = await ambilRdap("kalihcoffee.com", { fetchImpl, tidur: async () => {} });
    assert.deepEqual([hasil?.registrar, n], ["CV. Rumahweb Indonesia", 3]);
  });
  it("null kalau tiga kali gagal", async () => {
    assert.equal(await ambilRdap("x.com", { fetchImpl: async () => { throw new Error("x"); }, tidur: async () => {} }), null);
  });
});
