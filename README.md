# website-ops

Action GitHub yang dipakai bersama oleh nawwaf_friends, kalih-signature, dan sdbi. Sebelumnya
logika yang sama disalin ke tiap repo sebagai bash di dalam YAML, jadi setiap perbaikan
harus dibuat tiga kali dan tidak bisa dites.

| Action | Gunanya |
|---|---|
| `actions/kabari` | Kirim pesan ke grup tim lewat `OPS_ALERT_WEBHOOK_URL` |
| `actions/cek-situs` | Pastikan halaman membalas 200 **dan** `<title>`-nya memuat nama situs (menangkap halaman parkir domain dan suspend hosting); kabari grup kalau tidak |
| `actions/cek-domain` | Baca tanggal kedaluwarsa domain `.com` dari RDAP; kabari grup mulai 60 hari sebelum habis |
| `actions/cek-link` | Buka semua halaman di sitemap, periksa link internal dan gambar (termasuk cdn.sanity.io); kabari grup kalau ada yang 404/5xx. Link ke situs luar tidak diperiksa (media sosial menolak server walau halamannya hidup) |

Logikanya ada di `lib/`, dites di `test/` (`npm test`, Node 20+). Berkas `main.mjs` di tiap
action cuma membaca input dari env lalu memanggil `lib/`.

## Memakai

```yaml
- uses: Marlblue/website-ops/actions/cek-situs@<sha> # vX
  with:
    url: https://kalihcoffee.com/
    penanda: Kalih Signature
    label: kalihcoffee.com
    webhook: ${{ secrets.OPS_ALERT_WEBHOOK_URL }}
```

Dipaku per SHA seperti action lain di ketiga repo. Setelah mengubah repo ini: tes, push,
lalu naikkan SHA-nya di ketiga repo pemakai.

Repo ini privat. Repo privat lain di akun yang sama bisa memakainya karena Settings > Actions >
Access diatur ke "Accessible from repositories owned by the user". Kalau pengaturan itu
berubah, semua workflow pemakai gagal dengan "repository not found".
