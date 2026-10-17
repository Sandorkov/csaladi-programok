/* Egyszerű állapotkezelés: a programok és a képek egy IndexedDB-adatbázisba kerülnek. */
'use strict';
const $ = selector => document.querySelector(selector);
const categories = ['Kirándulás', 'Bringázás', 'Családi program'];
const icons = { 'Kirándulás': '🌳', 'Bringázás': '🚲', 'Családi program': '🧺' };
const form = $('#program-form');
let db, programs = [], view = 'all', editingId = null, previewUrl = null;
let cardUrls = [];

function message(text, error = false) {
  $('#status').textContent = text;
  $('#status').classList.toggle('error', error);
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('csaladi-programotletek', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('programs', { keyPath: 'id', autoIncrement: true });
      request.result.createObjectStore('settings');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => message('Az adatbázis megnyitásához zárd be az alkalmazás másik megnyitott lapját.', true);
  });
}

// Csak a teljes tranzakció lezárulta után tekintjük sikeresnek a mentést.
function transaction(stores, action) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Megszakadt a mentés.'));
    try { action(tx); }
    catch (error) { tx.abort(); reject(error); }
  });
}

function seedOnce() {
  return transaction(['programs', 'settings'], tx => {
    const settings = tx.objectStore('settings');
    const check = settings.get('initialized');
    check.onsuccess = () => {
      if (check.result) return;
      const examples = [
        { name: 'Erdei séta és kincskeresés', location: 'Egy közeli erdei tanösvény', category: 'Kirándulás', cost: 0, description: 'Mintaötlet: keressetek különleges leveleket, hallgassátok a madarakat, és vigyetek egy kis uzsonnát.' },
        { name: 'Két keréken a családdal', location: 'Egy közeli, nyugodt kerékpárút', category: 'Bringázás', cost: 1500, description: 'Mintaötlet: rövid, kényelmes bringázás egy fagyis megállóval. A költség csak szemléltető becslés.' },
        { name: 'Pokrócos piknik a parkban', location: 'A kedvenc városi parkotok', category: 'Családi program', cost: 2000, description: 'Mintaötlet: szendvicsek, társasjáték és labda egy közös délutánhoz. A költség csak szemléltető becslés.' }
      ];
      examples.forEach(p => tx.objectStore('programs').add({ ...p, favorite: false, sample: true, image: null }));
      settings.put(true, 'initialized');
    };
  });
}

function readPrograms() {
  return new Promise((resolve, reject) => {
    const request = db.transaction('programs').objectStore('programs').getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function refresh() {
  programs = await readPrograms();
  render();
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text; // A bevitt szöveg sosem futtatható HTML.
  return node;
}

// A szűrés és rendezés csak a megjelenítést érinti; nem ír az adatbázisba.
function filteredPrograms() {
  const search = $('#search').value.trim().toLocaleLowerCase('hu-HU');
  const category = $('#category-filter').value;
  return programs.filter(p =>
    (view !== 'favorites' || p.favorite) &&
    (!category || p.category === category) &&
    (!search || [p.name, p.location].some(text => text.toLocaleLowerCase('hu-HU').includes(search)))
  ).sort((a, b) => $('#cost-sort').value === 'desc' ? b.cost - a.cost : a.cost - b.cost);
}

function clearFilters() {
  $('#search').value = '';
  $('#category-filter').value = '';
  render();
  $('#search').focus();
}

function render() {
  cardUrls.forEach(url => URL.revokeObjectURL(url));
  cardUrls = [];
  const cards = $('#cards');
  cards.replaceChildren();
  const shown = filteredPrograms();
  $('#count').textContent = `${shown.length} ötlet`;
  $('#list-title').textContent = view === 'favorites' ? 'Kedvenc programok' : 'Minden program';
  if (!shown.length) {
    const hasFilters = $('#search').value.trim() !== '' || $('#category-filter').value !== '';
    const empty = element('div', 'empty');
    empty.append(element('p', '', hasFilters
      ? (view === 'favorites' ? 'A kedvenceid között nincs a keresésnek és a választott kategóriának megfelelő program.' : 'Nincs a keresésnek és a választott kategóriának megfelelő program.')
      : (view === 'favorites' ? 'Még nincs kedvenc program. Jelölj meg egy ötletet a ♡ gombbal!' : 'Még nincs programotok. Az „Új program” gombbal felveheted az első ötletet.')));
    if (hasFilters) {
      const clear = element('button', '', 'Szűrők törlése');
      clear.type = 'button';
      clear.onclick = clearFilters;
      empty.append(clear);
    }
    cards.append(empty);
  }
  shown.forEach(p => {
    const card = element('article', 'card');
    if (p.image) {
      const img = element('img', 'card-image');
      img.src = URL.createObjectURL(p.image); cardUrls.push(img.src);
      img.alt = p.name; card.append(img);
    } else {
      const placeholder = element('div', 'card-image placeholder', icons[p.category]);
      placeholder.setAttribute('aria-hidden', 'true'); card.append(placeholder);
    }
    const body = element('div', 'card-body');
    const badges = element('div', 'badges');
    badges.append(element('span', 'badge', p.category));
    if (p.sample) badges.append(element('span', 'badge sample', 'Mintaadat'));
    body.append(badges, element('h3', '', p.name), element('p', 'location', `⌖ ${p.location}`), element('p', 'description', p.description));
    const cost = element('div', 'cost', `${new Intl.NumberFormat('hu-HU').format(p.cost)} Ft`);
    cost.append(element('small', '', ' / fő · becsült költség'));
    const actions = element('div', 'card-actions');
    const favorite = element('button', 'favorite', p.favorite ? '♥ Kedvenc' : '♡ Kedvenc');
    favorite.setAttribute('aria-pressed', String(p.favorite));
    favorite.setAttribute('aria-label', `${p.name}: kedvenc jelölés`);
    favorite.onclick = () => mutate(() => transaction(['programs'], tx => tx.objectStore('programs').put({ ...p, favorite: !p.favorite })), 'Kedvencek frissítve.');
    const edit = element('button', '', 'Szerkesztés');
    edit.onclick = () => showForm(p);
    const remove = element('button', 'delete', 'Törlés');
    remove.onclick = () => {
      if (confirm(`Biztosan törlöd ezt a programot: „${p.name}”? A törlés nem vonható vissza.`)) {
        mutate(() => transaction(['programs'], tx => tx.objectStore('programs').delete(p.id)), 'Program törölve.');
      }
    };
    actions.append(favorite, edit, remove); body.append(cost, actions); card.append(body); cards.append(card);
  });
}

let busy = false;
async function mutate(action, success) {
  if (busy) return;
  busy = true;
  document.querySelectorAll('button').forEach(b => b.disabled = true);
  try { await action(); await refresh(); message(success); }
  catch (error) { console.error(error); message('Nem sikerült menteni. Lehet, hogy megtelt vagy nem elérhető a böngésző tárhelye. A bevitt adatokat megtartottuk.', true); }
  finally { busy = false; document.querySelectorAll('button').forEach(b => b.disabled = !db); }
}

function setPreview(blob) {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = blob ? URL.createObjectURL(blob) : null;
  $('#image-preview').hidden = !blob;
  if (blob) $('#image-preview').src = previewUrl;
  else $('#image-preview').removeAttribute('src');
}

function navigate(next) {
  view = next;
  $('#list-view').hidden = next === 'new' || next === 'backup';
  $('#form-view').hidden = next !== 'new';
  $('#backup-view').hidden = next !== 'backup';
  document.querySelectorAll('nav button').forEach(b => {
    b.classList.toggle('active', b.dataset.view === next);
    if (b.dataset.view === next) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  render();
}

function showForm(program = null) {
  form.reset(); editingId = program?.id ?? null;
  $('#form-title').textContent = program ? 'Program szerkesztése' : 'Új program';
  if (program) ['name', 'location', 'category', 'cost', 'description'].forEach(key => form.elements[key].value = program[key]);
  $('#remove-image-label').hidden = !program?.image;
  setPreview(program?.image);
  message('A csillaggal jelölt mezők kitöltése kötelező.');
  navigate('new'); form.elements.name.focus();
}

$('#search').oninput = render;
$('#category-filter').onchange = render;
$('#cost-sort').onchange = render;

document.querySelectorAll('nav button').forEach(b => b.onclick = () => {
  if (b.dataset.view === 'new') showForm();
  else { navigate(b.dataset.view); message(''); }
});
$('#cancel').onclick = () => { form.reset(); setPreview(null); navigate('all'); message(''); };
form.elements.image.onchange = () => {
  const file = form.elements.image.files[0];
  const valid = !file || (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) && file.size <= 8 * 1024 * 1024);
  form.elements.image.setCustomValidity(valid ? '' : 'JPG, PNG, WebP vagy GIF képet válassz, legfeljebb 8 MB méretben.');
  if (valid) { setPreview(file || programs.find(p => p.id === editingId)?.image); $('#remove-image').checked = false; }
  else form.elements.image.reportValidity();
};

form.onsubmit = event => {
  event.preventDefault();
  if (!form.reportValidity() || busy || !db) return;
  const values = Object.fromEntries(new FormData(form));
  const name = values.name.trim(), location = values.location.trim(), description = values.description.trim();
  if (!name || !location || !description) { message('A név, helyszín és leírás nem állhat csak szóközökből.', true); return; }
  if (!categories.includes(values.category)) return;
  const previous = programs.find(p => p.id === editingId);
  const file = form.elements.image.files[0];
  const program = { name, location, category: values.category, cost: Number(values.cost), description,
    favorite: previous?.favorite ?? false, sample: previous?.sample ?? false,
    image: file || ($('#remove-image').checked ? null : previous?.image ?? null) };
  if (editingId !== null) program.id = editingId;
  mutate(async () => {
    await transaction(['programs'], tx => tx.objectStore('programs').put(program));
    form.reset(); setPreview(null); navigate('all');
  }, 'Program elmentve. Jöhet a közös élmény!');
};

async function init() {
  document.querySelectorAll('button').forEach(b => b.disabled = true);
  try {
    db = await openDatabase();
    db.onversionchange = () => { db.close(); db = null; message('Az adatbázis megváltozott. Töltsd újra az oldalt.', true); document.querySelectorAll('button').forEach(b => b.disabled = true); };
    await seedOnce(); await refresh(); message('');
    document.querySelectorAll('button').forEach(b => b.disabled = false);
  } catch (error) {
    console.error(error); db = null;
    message('Az IndexedDB nem érhető el. Nyisd meg normál böngészőablakban, és engedélyezd a helyi adattárolást. Fájlmegnyitási probléma esetén lásd a README útmutatót.', true);
  }
}
init();
