import {
  auth, db, signInAnonymously, onAuthStateChanged,
  collection, doc, setDoc, deleteDoc, onSnapshot
} from "./firebase.js";

const $ = (s) => document.querySelector(s);
const grid = $("#book-grid"), libraryGrid = $("#library-grid");
let books = [], favorites = new Map(), user = null, unsubscribeFavorites = null;
let page = 1, query = "", category = "", year = "", sort = "relevance";
let apiSource = "openlibrary";
const API_NAMES = { openlibrary: "Open Library", googlebooks: "Google Books", gutendex: "Gutendex" };
const limit = 20;

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[c]);
}
function normalizeBook(b, source = apiSource) {
  if (source === "googlebooks") {
    const v = b.volumeInfo || {};
    return { id:`google-${b.id}`, title:v.title || "Untitled", author:v.authors?.[0] || "Unknown author",
      authors:v.authors || [], year:Number((v.publishedDate || "").slice(0,4)) || null,
      isbn:v.industryIdentifiers?.[0]?.identifier || "", cover:(v.imageLinks?.thumbnail || "").replace("http://","https://"),
      subjects:v.categories || [], description:v.description || "" };
  }
  if (source === "gutendex") {
    return { id:`gutendex-${b.id}`, title:b.title || "Untitled", author:b.authors?.[0]?.name || "Unknown author",
      authors:(b.authors || []).map(x=>x.name), year:null, isbn:"",
      cover:b.formats?.["image/jpeg"] || "", subjects:b.subjects || [], description:"" };
  }
  const key=b.key || "";
  return { id:key, title:b.title || "Untitled", author:b.author_name?.[0] || "Unknown author",
    authors:b.author_name || [], year:b.first_publish_year || null, isbn:b.isbn?.[0] || "",
    cover:b.cover_i ? `https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg` :
      (b.isbn?.[0] ? `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(b.isbn[0])}-M.jpg` : ""),
    subjects:b.subject || [], description:"" };
}
function showError(message) { $("#error-message").textContent = message; $("#error-message").hidden = false; }
function cardFor(book) {
  const card = document.createElement("article");
  card.className = "book-card";
  const coverHTML = book.cover
    ? `<img src="${escapeHTML(book.cover)}" alt="Cover for ${escapeHTML(book.title)}" loading="lazy">`
    : `<div class="cover-placeholder"><small>OPEN LIBRARY</small><span>${escapeHTML(book.title)}</span><small>A STORY TO DISCOVER</small></div>`;
  card.innerHTML = `<div class="cover-wrap">${coverHTML}
    <button class="favorite-btn ${favorites.has(book.id) ? "saved" : ""}" data-favorite="${escapeHTML(book.id)}" aria-label="Save ${escapeHTML(book.title)}">${favorites.has(book.id) ? "♥" : "♡"}</button></div>
    <h3 class="book-title">${escapeHTML(book.title)}</h3>
    <p class="book-author">${escapeHTML(book.author)}</p>
    <p class="book-year">${book.year || "Year unavailable"}</p>
    <button class="details-btn" data-details="${escapeHTML(book.id)}">View details →</button>`;
  const img = card.querySelector("img");
  if (img) img.addEventListener("error", () => {
    const placeholder = document.createElement("div");
    placeholder.className = "cover-placeholder";
    placeholder.innerHTML = `<small>OPEN LIBRARY</small><span>${escapeHTML(book.title)}</span><small>A STORY TO DISCOVER</small>`;
    img.replaceWith(placeholder);
  }, {once:true});
  return card;
}
function renderBooks() {
  grid.replaceChildren();
  let visible = books.filter(b =>
    (!year || Number(b.year) === Number(year)) &&
    (!category || b.subjects.some(s => String(s).toLowerCase().includes(category)))
  );
  if (sort === "title") visible.sort((a,b) => a.title.localeCompare(b.title));
  if (sort === "year-desc") visible.sort((a,b) => (b.year || 0) - (a.year || 0));
  if (sort === "year-asc") visible.sort((a,b) => (a.year || 99999) - (b.year || 99999));
  visible.forEach(b => grid.append(cardFor(b)));
  $("#result-count").textContent = `${visible.length} shown`;
  $("#empty-message").hidden = visible.length > 0;
  $("#prev-btn").disabled = page <= 1;
  $("#next-btn").disabled = books.length < limit;
  $("#page-info").textContent = `Page ${page}`;
}
async function searchBooks() {
  $("#loading").hidden=false; $("#error-message").hidden=true; $("#empty-message").hidden=true; grid.replaceChildren();
  let url="";
  if (apiSource==="openlibrary") {
    const p=new URLSearchParams({limit:String(limit),page:String(page),q:query || (category ? `subject:${category}` : "popular books")});
    if(category) p.set("subject",category);
    url=`https://openlibrary.org/search.json?${p}`;
  } else if(apiSource==="googlebooks") {
    const p=new URLSearchParams({maxResults:String(limit),startIndex:String((page-1)*limit),q:query || (category ? `subject:${category}` : "bestsellers")});
    url=`https://www.googleapis.com/books/v1/volumes?${p}`;
  } else {
    const p=new URLSearchParams({page:String(page),search:query || category || "fiction"});
    url=`https://gutendex.com/books/?${p}`;
  }
  try {
    const response=await fetch(url);
    if(!response.ok) throw new Error(`${API_NAMES[apiSource]} HTTP ${response.status}`);
    const data=await response.json();
    const rows=apiSource==="openlibrary" ? (data.docs || []) : apiSource==="googlebooks" ? (data.items || []) : (data.results || []);
    books=rows.map(x=>normalizeBook(x,apiSource));
    $("#results-title").textContent=query ? `Results for “${query}”` : (category ? `${category[0].toUpperCase()+category.slice(1)} reads` : "Popular reads");
    renderBooks();
    $("#next-btn").disabled=apiSource==="gutendex" ? !data.next : rows.length<limit;
  } catch(e) {
    books=[]; renderBooks();
    showError(`Unable to load ${API_NAMES[apiSource]}. Check your internet connection or select another API. (${e.message})`);
    console.error(e);
  } finally { $("#loading").hidden=true; }
}
function renderLibrary() {
  libraryGrid.replaceChildren();
  if (!user && favorites.size === 0) {
    $("#library-status").hidden = false;
    $("#library-status").textContent = "Your library is empty. Tap ♡ on a book to save it.";
    return;
  }
  $("#library-status").hidden = favorites.size > 0;
  $("#library-status").textContent = favorites.size ? "" : "Your library is empty. Tap ♡ on a book to save it.";
  favorites.forEach(book => libraryGrid.append(cardFor(book)));
}
async function toggleFavorite(id) {
  const book = books.find(b => b.id === id) || favorites.get(id);
  if (!book) return;
  try {
    if (user && db) {
      const ref=doc(db,"users",user.uid,"favorites",encodeURIComponent(id).replaceAll("%","_"));
      if(favorites.has(id)) await deleteDoc(ref); else await setDoc(ref,{...book,savedAt:Date.now()});
    } else {
      if(favorites.has(id)) favorites.delete(id); else favorites.set(id,{...book,savedAt:Date.now()});
      localStorage.setItem("openLibraryFavorites",JSON.stringify([...favorites.entries()]));
      renderBooks(); renderLibrary(); $("#auth-status").textContent="Saved on this device";
    }
  } catch(e) { console.error(e); alert("Couldn't save this book."); }
}
function showDetails(id) {
  const book = books.find(b => b.id === id) || favorites.get(id);
  if (!book) return;
  const cover = book.cover ? `<img class="dialog-cover" src="${escapeHTML(book.cover)}" alt="Book cover">` : "";
  $("#book-details").innerHTML = `${cover}<p class="eyebrow">BOOK DETAILS</p><h2>${escapeHTML(book.title)}</h2>
    <div class="dialog-info">
      <p><strong>Author:</strong> ${escapeHTML(book.authors?.join(", ") || book.author || "Unavailable")}</p>
      <p><strong>Publication year:</strong> ${escapeHTML(book.year || "Unavailable")}</p>
      <p><strong>ISBN:</strong> ${escapeHTML(book.isbn || "Unavailable")}</p>
      <p><strong>Open Library ID:</strong> ${escapeHTML(book.id)}</p>
      <p><a target="_blank" rel="noopener noreferrer" href="https://openlibrary.org${escapeHTML(book.id)}">More book information ↗</a></p>
    </div><div style="clear:both"></div>`;
  $("#book-dialog").showModal();
}
$("#search-form").addEventListener("submit", e => {
  e.preventDefault(); query = $("#search-input").value.trim(); page = 1; searchBooks();
});
$("#api-source").addEventListener("change", e => { apiSource=e.target.value; page=1; searchBooks(); });
$("#category-filter").addEventListener("change", e => {
  category = e.target.value; page = 1;
  document.querySelectorAll("[data-category]").forEach(b => b.classList.toggle("active", b.dataset.category === category));
  searchBooks();
});
document.querySelectorAll("[data-category]").forEach(b => b.addEventListener("click", () => {
  category = b.dataset.category; $("#category-filter").value = category; page = 1;
  document.querySelectorAll("[data-category]").forEach(chip => chip.classList.toggle("active", chip === b));
  searchBooks();
}));
$("#year-filter").addEventListener("input", e => { year = e.target.value.trim(); renderBooks(); });
$("#sort-filter").addEventListener("change", e => { sort = e.target.value; renderBooks(); });
$("#clear-filters").addEventListener("click", () => {
  query = ""; category = ""; year = ""; sort = "relevance"; page = 1;
  $("#search-input").value = ""; $("#category-filter").value = ""; $("#year-filter").value = ""; $("#sort-filter").value = "relevance";
  document.querySelectorAll("[data-category]").forEach(b => b.classList.toggle("active", !b.dataset.category));
  searchBooks();
});
$("#prev-btn").addEventListener("click", () => { if (page > 1) { page--; searchBooks(); window.location.hash = "discover"; } });
$("#next-btn").addEventListener("click", () => { if (books.length >= limit) { page++; searchBooks(); window.location.hash = "discover"; } });
document.addEventListener("click", e => {
  const fav = e.target.closest("[data-favorite]"), details = e.target.closest("[data-details]");
  if (fav) toggleFavorite(fav.dataset.favorite);
  if (details) showDetails(details.dataset.details);
});
$("#close-dialog").addEventListener("click", () => $("#book-dialog").close());
$("#book-dialog").addEventListener("click", e => { if (e.target === $("#book-dialog")) $("#book-dialog").close(); });
if(auth && db) {
  onAuthStateChanged(auth, async signedInUser => {
    if(unsubscribeFavorites) unsubscribeFavorites();
    user=signedInUser;
    if(!user) {
      $("#auth-status").textContent="Connecting..."; favorites.clear(); renderLibrary();
      try { await signInAnonymously(auth); }
      catch(e) {
        $("#auth-status").textContent="Local library mode";
        favorites=new Map(JSON.parse(localStorage.getItem("openLibraryFavorites") || "[]")); renderLibrary();
      }
      return;
    }
    $("#auth-status").textContent="Library connected";
    const ref=collection(db,"users",user.uid,"favorites");
    unsubscribeFavorites=onSnapshot(ref,snapshot=>{
      favorites.clear(); snapshot.forEach(item=>{const book=item.data();favorites.set(book.id,book);});
      renderBooks();renderLibrary();
    },e=>{console.error(e);$("#library-status").hidden=false;$("#library-status").textContent="Couldn't load saved books. Check Firestore Rules.";});
  });
} else {
  favorites=new Map(JSON.parse(localStorage.getItem("openLibraryFavorites") || "[]"));
  $("#auth-status").textContent="Local library mode"; renderLibrary();
}
searchBooks();
