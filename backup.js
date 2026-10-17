/* Verziózott, hordozható mentés. A képek base64 adatként szerepelnek a JSON-ban. */
'use strict';
const BACKUP_FORMAT = 'csaladi-programotletek';
const BACKUP_VERSION = 1;
const MAX_BACKUP_BYTES = 150 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
let pendingRestore = null, validationToken = 0;

function backupMessage(text, error = false) {
  $('#backup-status').textContent = text;
  $('#backup-status').classList.toggle('error', error);
}

function backupLock(locked) {
  busy = locked;
  document.querySelectorAll('main button').forEach(button => button.disabled = locked || !db);
  $('#restore-file').disabled = locked || !db;
}

function resetRestore(clearFile = true) {
  validationToken++;
  pendingRestore = null;
  $('#restore-preview').hidden = true;
  $('#restore-summary').textContent = '';
  $('#cancel-restore').hidden = true;
  if (clearFile) $('#restore-file').value = '';
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Egy képet nem sikerült beolvasni.'));
    reader.onabort = () => reject(new Error('Megszakadt a kép beolvasása.'));
    reader.readAsDataURL(blob);
  });
}

async function createBackup(records, date = new Date()) {
  const saved = [];
  for (const program of records) {
    saved.push({ ...program, image: program.image ? await blobToDataURL(program.image) : null });
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: date.toISOString(), programs: saved };
}

function backupFilename(date) {
  const pad = number => String(number).padStart(2, '0');
  return `csaladi-programok-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}.json`;
}

$('#export-backup').onclick = async () => {
  if (busy || !db) return;
  backupLock(true);
  backupMessage('Biztonsági mentés készítése…');
  try {
    // Friss, teljes adatbázis-pillanatkép: nem a szűrt kártyákat exportáljuk.
    const date = new Date();
    const backup = await createBackup(await readPrograms(), date);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    if (blob.size > MAX_BACKUP_BYTES) throw new Error('A mentés meghaladná a visszaállítható 150 MB-os méretet.');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = backupFilename(date);
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    backupMessage(`A letöltést elindítottuk: ${backup.programs.length} program, minden adattal és képpel. Ellenőrizd a böngésző letöltéseit.`);
  } catch (error) {
    backupMessage(`Nem sikerült elkészíteni a mentést. ${error.message}`, true);
  } finally { backupLock(false); }
};

function invalidBackup(detail) {
  return new Error(`Érvénytelen mentés: ${detail} A jelenlegi adatok nem változtak.`);
}

function checkKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

// A fejléc és a base64 ellenőrzése mellett valóban dekódoltatjuk a képet a böngészővel.
async function decodeBackupImage(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 40) throw invalidBackup('hibás vagy túl nagy kép.');
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw invalidBackup('nem támogatott képformátum vagy hibás képkódolás.');
  let binary;
  try { binary = atob(match[2]); }
  catch { throw invalidBackup('sérült base64 képadat.'); }
  if (!binary.length || binary.length > MAX_IMAGE_BYTES || btoa(binary) !== match[2]) throw invalidBackup('hibás képméret vagy base64 képadat.');
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  const starts = (...prefix) => prefix.every((byte, index) => bytes[index] === byte);
  const type = match[1];
  const signatureOK = type === 'image/png' ? starts(137,80,78,71,13,10,26,10)
    : type === 'image/jpeg' ? starts(255,216,255)
    : type === 'image/gif' ? /^GIF8[79]a/.test(binary.slice(0,6))
    : starts(82,73,70,70) && binary.slice(8,12) === 'WEBP';
  if (!signatureOK) throw invalidBackup('a kép tartalma nem felel meg a megadott képformátumnak.');
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image(); image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('Üres kép');
  } catch { throw invalidBackup('egy kép sérült vagy nem olvasható.'); }
  finally { URL.revokeObjectURL(url); }
  return blob;
}

async function validateBackup(text, isCancelled = () => false) {
  let data;
  try { data = JSON.parse(text); }
  catch { throw invalidBackup('a fájl nem olvasható JSON-ként.'); }
  if (!checkKeys(data, ['format', 'version', 'createdAt', 'programs']) || data.format !== BACKUP_FORMAT) throw invalidBackup('ez nem az alkalmazás mentési fájlja.');
  if (data.version !== BACKUP_VERSION) throw invalidBackup('ez a formátumverzió nem támogatott.');
  if (typeof data.createdAt !== 'string' || !Number.isFinite(Date.parse(data.createdAt)) || new Date(data.createdAt).toISOString() !== data.createdAt) throw invalidBackup('hibás mentési időpont.');
  if (!Array.isArray(data.programs)) throw invalidBackup('hiányzó programlista.');
  const records = [], ids = new Set();
  const validText = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
  for (const [index, p] of data.programs.entries()) {
    if (isCancelled()) throw new DOMException('Megszakítva', 'AbortError');
    if (!checkKeys(p, ['id','name','location','category','cost','description','favorite','sample','image']) ||
      !Number.isSafeInteger(p.id) || p.id < 1 || ids.has(p.id) ||
      !validText(p.name,100) || !validText(p.location,150) || !validText(p.description,1500) ||
      !categories.includes(p.category) || !Number.isSafeInteger(p.cost) || p.cost < 0 || p.cost > 100000000 ||
      typeof p.favorite !== 'boolean' || typeof p.sample !== 'boolean') {
      throw invalidBackup(`a(z) ${index + 1}. program adatai hibásak vagy azonosítója ismétlődik.`);
    }
    ids.add(p.id);
    records.push({ ...p, image: await decodeBackupImage(p.image) });
  }
  if (isCancelled()) throw new DOMException('Megszakítva', 'AbortError');
  return { createdAt: data.createdAt, programs: records };
}

// A párbeszédablak megnyitásakor érvénytelenítjük a régi mentést.
// Itt ürítünk, így ugyanaz a fájl is kiválasztható újra; beolvasáskor már nem.
$('#restore-file').onclick = () => {
  if (busy || !db) return;
  resetRestore();
  backupMessage('Válassz mentési fájlt az ellenőrzéshez.');
};
$('#restore-file').oncancel = () => {
  if (busy || !db) return;
  resetRestore();
  backupMessage('Nem választottál új mentési fájlt. A jelenlegi adatok nem változtak.');
};

$('#restore-file').onchange = async () => {
  if (busy || !db) return;
  const file = $('#restore-file').files[0];
  resetRestore(false);
  if (!file) return;
  const token = validationToken;
  backupLock(true);
  $('#cancel-restore').hidden = false;
  $('#cancel-restore').disabled = false;
  backupMessage('A teljes mentés és az összes kép ellenőrzése… A jelenlegi adatok még nem változnak.');
  try {
    if (!file.size || file.size > MAX_BACKUP_BYTES) throw invalidBackup('üres vagy 150 MB-nál nagyobb fájl.');
    const result = await validateBackup(await file.text(), () => token !== validationToken);
    if (token !== validationToken) return;
    pendingRestore = result;
    $('#restore-summary').textContent = `Beolvasott fájl: ${file.name} · Mentés időpontja: ${new Date(result.createdAt).toLocaleString('hu-HU')} · Programok száma: ${result.programs.length}`;
    $('#restore-preview').hidden = false;
    backupMessage('Az ellenőrzés sikeres. Még semmit nem írtunk felül. A visszaállításhoz külön erősítsd meg a teljes lista cseréjét.');
  } catch (error) {
    if (token === validationToken) {
      resetRestore(false);
      backupMessage(error.message?.startsWith('Érvénytelen mentés:') ? error.message : 'Nem sikerült beolvasni a mentést. A jelenlegi adatok nem változtak.', true);
    }
  } finally { backupLock(false); }
};

$('#cancel-restore').onclick = () => {
  resetRestore();
  backupMessage('A visszaállítást megszakítottad. A jelenlegi adatok nem változtak.');
};

// A törlés, beszúrások és a minták jelzője ugyanabban a tranzakcióban van.
// Bármely hiba visszagörgeti a teljes cserét, a korábbi lista megmarad.
function replacePrograms(records) {
  return transaction(['programs', 'settings'], tx => {
    const store = tx.objectStore('programs');
    store.clear();
    records.forEach(program => store.add(program));
    tx.objectStore('settings').put(true, 'initialized');
  });
}

$('#confirm-restore').onclick = async () => {
  if (busy || !db || !pendingRestore) return;
  const records = pendingRestore.programs;
  backupLock(true);
  backupMessage('A megerősített visszaállítás mentése folyamatban…');
  try {
    await replacePrograms(records);
  } catch (error) {
    backupMessage('Nem sikerült visszaállítani a mentést (például tárhelyhiány miatt). A teljes csere visszavonódott, a korábbi adatok megmaradtak.', true);
    backupLock(false);
    return;
  }
  // A tranzakció már lezárult: az ellenőrzött adatokból frissítünk újabb lemezolvasás nélkül.
  programs = records;
  resetRestore(); form.reset(); editingId = null; setPreview(null);
  $('#search').value = ''; $('#category-filter').value = '';
  navigate('all');
  message(`Sikeres visszaállítás: ${records.length} program, képekkel és kedvencjelölésekkel.`);
  backupMessage('A mentés visszaállítása sikerült.');
  backupLock(false);
};
