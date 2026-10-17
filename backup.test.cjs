// Futtatás: node tests/backup.test.cjs
// Elkülönített Node-teszt szimulált DOM-mal, képolvasóval és tranzakciókkal.
// Nem nyitja meg és nem módosítja a felhasználó valódi IndexedDB-adatbázisát.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
class Element {
  constructor() { this.value = ''; this.children = []; this.elements = { image: {} }; this.classList = { toggle() {} }; }
  get value() { return this._value; }
  set value(value) { this._value = value; if (value === '' && this.type === 'file') this.files = []; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute() {} removeAttribute() {} focus() {} reset() {} remove() {}
  click() { downloaded = this; }
}
const nodes = new Map(), urls = new Map();
let downloaded, rejectImage = false, decodeCount = 0;
const document = {
  body: new Element(),
  querySelector(selector) {
    if (!nodes.has(selector)) {
      const node = new Element();
      if (selector === '#restore-file') { node.type = 'file'; node.files = []; }
      nodes.set(selector, node);
    }
    return nodes.get(selector);
  },
  querySelectorAll() { return [...nodes.values()].filter(n => n.tag === 'button'); },
  createElement(tag) { const node = new Element(); node.tag = tag; return node; }
};
class FileReader {
  readAsDataURL(blob) {
    blob.arrayBuffer().then(bytes => {
      this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`;
      this.onload();
    }, () => this.onerror());
  }
}
class Image {
  naturalWidth = 1; naturalHeight = 1;
  async decode() { decodeCount++; if (rejectImage) throw Error('Simulated decoder failure'); }
}
const context = vm.createContext({ document, console, Blob, FileReader, Image, Intl, DOMException,
  atob, btoa, setTimeout() {}, URL: {
    createObjectURL(blob) { const url = `blob:test-${urls.size}`; urls.set(url, blob); return url; },
    revokeObjectURL(url) { urls.delete(url); }
  }
});
const run = source => vm.runInContext(source, context);
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const backup = fs.readFileSync(path.join(root, 'backup.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const [, id] of (app + backup).matchAll(/\$\('#([^']+)'\)/g)) assert(html.includes(`id="${id}"`), id);
run(app.replace(/init\(\);\s*$/, ''));
run(backup);

// A szimulátor csak commitkor módosítja az állapotot. Hiba és abort eldobja a munkapéldányt.
let state = { programs: [], initialized: false }, failAt = 0, writes = 0;
const database = {
  transaction(stores) {
    const staged = structuredClone(state);
    let aborted = false, operations = 0;
    const tx = {
      error: null,
      abort() { aborted = true; },
      objectStore(name) {
        function operation(action) {
          writes++; operations++;
          if (operations === failAt) { aborted = true; tx.error = Error('Injected storage failure'); }
          if (!aborted) action();
        }
        return name === 'programs' ? {
          clear() { operation(() => staged.programs = []); },
          add(record) {
            if (record.id === -1) throw Error('Injected synchronous failure');
            operation(() => staged.programs.push(structuredClone(record)));
          }
        } : { put(value, key) { assert.equal(key, 'initialized'); operation(() => staged.initialized = value); } };
      }
    };
    queueMicrotask(() => {
      if (aborted) tx.onabort();
      else { state = staged; tx.oncomplete(); }
    });
    return tx;
  }
};
context.testDB = database;
run('db = testDB');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const record = { id: 5, name: 'Teszt piknik', location: 'Budapest', category: 'Családi program', cost: 1500,
  description: 'Magyar leírás: ő, ű.', favorite: true, sample: false, image: new Blob([png], {type: 'image/png'}) };
context.testRecords = [record, { ...record, id: 9, name: 'Másik program', image: null, favorite: false, sample: true }];
async function main() {
  const exported = await run('createBackup(testRecords, new Date("2026-10-16T12:34:56.000Z"))');
  assert.equal(exported.version, 1);
  assert.equal(exported.programs.length, 2);
  assert(exported.programs[0].image.startsWith('data:image/png;base64,'));
  assert.match(run('backupFilename(new Date(2026,9,16,14,34,56))'), /2026-10-16_14-34-56\.json$/);
  context.backupText = JSON.stringify(exported);
  const restored = await run('validateBackup(backupText)');
  assert.equal(decodeCount, 1);
  assert.equal(Buffer.compare(Buffer.from(await restored.programs[0].image.arrayBuffer()), png), 0);
  for (const key of ['id','name','location','category','cost','description','favorite','sample']) assert.equal(restored.programs[0][key], record[key]);
  assert.equal(writes, 0, 'Validation must never write');

  async function rejects(change) {
    const bad = JSON.parse(JSON.stringify(exported)); change(bad); context.badText = JSON.stringify(bad);
    await assert.rejects(run('validateBackup(badText)'), /Érvénytelen mentés/);
    assert.equal(writes, 0);
  }
  await assert.rejects(run('validateBackup("not JSON")'), /JSON/);
  await rejects(b => b.version = 99);
  await rejects(b => b.format = 'other');
  await rejects(b => b.createdAt = 'not a date');
  await rejects(b => b.programs[1].id = 5);
  await rejects(b => b.programs[0].cost = -1);
  await rejects(b => b.programs[0].cost = '1500');
  await rejects(b => b.programs[0].favorite = 'true');
  await rejects(b => b.programs[0].name = ' ');
  await rejects(b => b.programs[0].category = 'Ismeretlen');
  await rejects(b => delete b.programs[0].description);
  await rejects(b => b.programs[0].image = 'https://example.com/image.png');
  await rejects(b => b.programs[0].image = 'data:image/png;base64,@@@');
  await rejects(b => b.programs[0].image = 'data:image/png;base64,YWJj');
  rejectImage = true;
  await assert.rejects(run('validateBackup(backupText)'), /sérült vagy nem olvasható/);
  rejectImage = false;
  await assert.rejects(run('validateBackup(backupText, () => true)'), { name: 'AbortError' });

  // Preview, separate confirmation, cancellation, invalid file, size limit.
  const file = document.querySelector('#restore-file');
  const validFile = {name:'csaladi-mentes.json',size:context.backupText.length,text:async()=>context.backupText};
  function selectFile(selected) {
    file.files = [selected]; file._value = `C:\\fakepath\\${selected.name}`;
  }
  selectFile(validFile);
  await file.onchange();
  assert.equal(writes, 0);
  assert.equal(nodes.get('#restore-preview').hidden, false);
  assert(nodes.get('#restore-summary').textContent.includes('Programok száma: 2'));
  assert(nodes.get('#restore-summary').textContent.includes(validFile.name));
  assert.equal(file.files[0], validFile, 'Validated selection must remain in the native input');
  assert(file.value.endsWith(validFile.name));

  // Reopening the picker invalidates the previous confirmation immediately.
  file.onclick();
  assert.equal(file.value, ''); assert.equal(file.files.length, 0);
  assert.equal(run('pendingRestore'), null); assert.equal(nodes.get('#restore-preview').hidden, true);
  await nodes.get('#confirm-restore').onclick(); assert.equal(writes, 0);
  // The same file can now generate a new change event and be checked again.
  selectFile(validFile); await file.onchange();
  assert.equal(file.files[0], validFile); assert.equal(nodes.get('#restore-preview').hidden, false);

  // A different invalid file must never leave the previous backup restorable.
  let finishInvalidRead;
  const invalidFile = {name:'hibas.json',size:10,text:()=>new Promise(resolve=>finishInvalidRead=resolve)};
  selectFile(invalidFile);
  const invalidReading = file.onchange();
  assert.equal(run('pendingRestore'), null); assert.equal(nodes.get('#restore-preview').hidden, true);
  assert.equal(nodes.get('#restore-summary').textContent, '');
  await nodes.get('#confirm-restore').onclick(); assert.equal(writes, 0);
  finishInvalidRead('not JSON'); await invalidReading;
  assert.equal(file.files[0], invalidFile); assert(file.value.endsWith(invalidFile.name));
  assert.equal(run('pendingRestore'), null); assert.equal(nodes.get('#restore-preview').hidden, true);
  await nodes.get('#confirm-restore').onclick(); assert.equal(writes, 0);

  file.onclick(); selectFile(validFile); await file.onchange();
  assert(nodes.get('#restore-summary').textContent.includes(validFile.name));
  file.onclick(); file.oncancel();
  assert.equal(run('pendingRestore'), null); assert.equal(file.value, '');
  await nodes.get('#confirm-restore').onclick(); assert.equal(writes, 0);
  selectFile(validFile); await file.onchange();
  nodes.get('#cancel-restore').onclick();
  await nodes.get('#confirm-restore').onclick();
  assert.equal(writes, 0);
  file.files = [{size: 200*1024*1024, text: async () => {throw Error('Should not read');}}];
  await file.onchange(); assert.match(nodes.get('#backup-status').textContent, /150 MB/);
  let finishRead;
  file.files = [{size:100, text:() => new Promise(resolve => finishRead = resolve)}];
  const reading = file.onchange(); nodes.get('#cancel-restore').onclick(); finishRead(context.backupText);
  await reading; assert.equal(run('pendingRestore'), null); assert.equal(writes, 0);

  context.restored = restored;
  const old = { programs: [{id:100,name:'Korábbi adat'}], initialized: false };
  state = structuredClone(old); failAt = 3;
  await assert.rejects(run('replacePrograms(restored.programs)'));
  assert.deepEqual(state, old, 'Injected mid-transaction error must roll back');
  failAt = 0; context.badRecords = [{id:-1}];
  await assert.rejects(run('replacePrograms(badRecords)'));
  assert.deepEqual(state, old, 'Synchronous failure must abort the pending clear');
  await run('replacePrograms(restored.programs)');
  assert.equal(state.programs.length, 2); assert.equal(state.initialized, true);
  await run('replacePrograms(restored.programs)'); assert.equal(state.programs.length, 2);
  await run('replacePrograms([])'); assert.equal(state.programs.length, 0); assert.equal(state.initialized, true);

  // Full export ignores in-memory filters and reads the complete database snapshot.
  context.snapshot = context.testRecords;
  run("readPrograms = async () => snapshot; programs = []; view = 'favorites'; $('#search').value = 'no match'");
  await nodes.get('#export-backup').onclick();
  const downloadedJSON = JSON.parse(await urls.get(downloaded.href).text());
  assert.equal(downloadedJSON.programs.length, 2);

  // Actual confirmation handler commits, clears filters and refreshes the cards.
  selectFile(validFile);
  await file.onchange();
  await nodes.get('#confirm-restore').onclick();
  assert.equal(state.programs.length, 2);
  assert.equal(run('view'), 'all'); assert.equal(run('programs.length'), 2);
  assert.equal(nodes.get('#search').value, '');
  assert.equal(nodes.get('#cards').children.length, 2);
  assert.equal(file.value, ''); assert.equal(file.files.length, 0);
  console.log('PASS: filename and native selection retained; old confirmation invalidated before reading; invalid replacement cannot restore old data; same-file reselection; picker cancel; selection cleared after successful restore.');
  console.log('PASS: complete JSON/image round trip; metadata and filename; invalid version/JSON/fields/IDs/images; decoder rejection; preview without writes; cancellation; size limit; simulated async and sync rollback; repeated and empty restore; unfiltered export; confirmation and immediate list refresh.');
  console.log('Limits: DOM, FileReader, Image decoder and IndexedDB transactions are simulated. No real browser/database/download was tested.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
