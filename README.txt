OPEN LIBRARY — SETUP & 3 API

TIGA API YANG DIGUNAKAN
1. Open Library Search API (UNIQUE)
   https://openlibrary.org/search.json?q=harry+potter
   Digunakan untuk carian buku, penulis, tahun terbitan dan cover.

2. Google Books API (SHARED)
   https://www.googleapis.com/books/v1/volumes?q=harry+potter
   Digunakan untuk carian buku, metadata, kategori, ISBN dan cover.

3. Gutendex API (SHARED)
   https://gutendex.com/books/?search=pride
   Digunakan untuk mencari katalog Project Gutenberg, penulis, subjek dan cover.

CARA UJI API
- Jalankan website menggunakan VS Code Live Server.
- Pergi ke Discover.
- Pilih API melalui menu "Book API source".
- Cuba cari "Harry Potter" (Open Library / Google Books) atau "Pride" (Gutendex).
- Tukar pilihan API dan cuba carian yang sama/berbeza.

FUNGSI FAVOURITE
- Tanpa Firebase config, Favourite disimpan dalam localStorage pada browser/peranti ini.
- Untuk cloud sync, masukkan Firebase web config sebenar dalam firebase.js, aktifkan Anonymous Authentication dan Firestore, kemudian publish firestore.rules.

FAIL
index.html, style.css, app.js, firebase.js, firestore.rules.
