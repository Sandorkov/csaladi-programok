/* Kizárólag a Supabase közös listáját kezeli. Nincs IndexedDB vagy helyi mentési tartalékút. */
(() => {
  'use strict';
  const find = selector => document.querySelector(selector);
  const form = find('#shared-form');
  const columns = 'id,family_id,name,location,category,cost,description,favorite,version,created_at,updated_at,gallery_version,deletion_pending,deleted_at';
  const categoryIcons = { 'Kirándulás': '🌳', 'Bringázás': '🚲', 'Családi program': '🧺' };
  let client = null, revalidate = () => {}, access = null, generation = 0, readSequence = 0;
  let rows = [], editing = null, draftId = null, pending = false, loading = false, listState = 'blocked';
  let readRequest = null, writeRequest = null;
  const gallery=window.createFamilyGallery?.({
    onProgram(program){
      if(!access||(program.family_id&&program.family_id!==access.family.id))return;
      const previous=rows.find(p=>p.id===program.id);
      if(previous&&program.version&&previous.version>program.version)return;
      if(program.deleted_at){rows=rows.filter(p=>p.id!==program.id);if(editing?.id===program.id)resetForm();}
      else if(previous)rows=rows.map(p=>p.id===program.id?program:p);
      render();controls();
    },
    onAccessError(){revalidate();},report:tell
  });

  function node(tag, className, text) {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text !== undefined) result.textContent = text;
    return result;
  }
  function tell(text, error = false) {
    find('#shared-status').textContent = text;
    find('#shared-status').classList.toggle('error', error);
  }
  function current(ticket) { return Boolean(access) && ticket === generation; }
  function resetForm() {
    form.reset(); form.hidden = true; editing = null; draftId = null;
    find('#shared-reload-edit').hidden = true;
  }
  function controls() {
    find('#shared-workspace').dataset.state = listState;
    find('#shared-refresh').disabled = !access || pending || loading;
    find('#shared-new').disabled = !access || pending || loading || listState !== 'ready';
    find('#shared-fields').disabled = !access || pending || Boolean(editing&&rows.find(p=>p.id===editing.id)?.deletion_pending);
    find('#shared-filters').hidden = !access;
  }
  function setMembership(info) {
    const next = info.state === 'member' && info.userId && info.family ? info : null;
    if (next && access?.userId === next.userId && access.family.id === next.family.id) {
      access = next; gallery?.setContext(client,next);find('#shared-family-name').textContent = next.family.name; return;
    }
    generation++; readSequence++;
    readRequest?.abort(); writeRequest?.abort(); readRequest = writeRequest = null;
    access = next; rows = []; pending = loading = false; resetForm();
    gallery?.setContext(client,next);
    find('#shared-search').value = ''; find('#shared-category').value = '';
    find('#shared-only-favorites').checked = false;
    find('#shared-family-name').textContent = next?.family.name ?? '';
    listState = 'blocked'; render(); controls();
    if (next) { void refresh(); return; }
    const messages = {
      'loading': 'Családtagság ellenőrzése…',
      'no-membership': 'Még nem tartozol családhoz.',
      'error': 'A családtagság nem ellenőrizhető. Próbáld újra a fejlécben a Tagság újratöltése gombbal.',
      'signed-out': 'A családi programokhoz lépj be Google-fiókkal, és legyen érvényes családtagságod.'
    };
    tell(messages[info.state] || messages['signed-out'], info.state === 'error');
  }

  async function checkMembership(ticket, signal) {
    if (!current(ticket)) throw new Error('stale');
    const { data, error } = await client.from('family_memberships').select('family_id, role')
      .eq('user_id', access.userId).abortSignal(signal).maybeSingle();
    if (!current(ticket)) throw new Error('stale');
    if (error) throw error;
    if (!data || data.family_id !== access.family.id || !['admin','member'].includes(data.role)) {
      setMembership({state:'no-membership'});
      revalidate();
      throw new Error('membership-lost');
    }
  }

  async function refresh() {
    if (!client || !access || pending) return false;
    const ticket = generation, sequence = ++readSequence;
    readRequest?.abort();
    const controller = new AbortController(); readRequest = controller;
    const timeout = setTimeout(() => controller.abort(), 20000);
    loading = true; rows = []; listState = 'loading'; render(); controls();
    tell('Családi programok betöltése…');
    try {
      await checkMembership(ticket, controller.signal);
      const result = [];
      // Lapozás: a Supabase alapértelmezett sorkorlátja ne vágja le a teljes listát.
      for (let start = 0; ; start += 200) {
        const { data, error } = await client.from('family_programs').select(columns)
          .eq('family_id', access.family.id).order('created_at').order('id')
          .range(start, start + 199).abortSignal(controller.signal);
        if (!current(ticket) || sequence !== readSequence) return false;
        if (error || !Array.isArray(data)) throw error || new Error('invalid-data');
        result.push(...data);
        if (data.length < 200) break;
      }
      // A betöltés közben megszűnt tagságot se keverjük össze az üres családi listával.
      await checkMembership(ticket, controller.signal);
      if (!current(ticket) || sequence !== readSequence) return false;
      rows = result; listState = 'ready';
      gallery?.syncPrograms?.(rows);
      tell(rows.length ? 'A családi lista naprakész a lekérés időpontjában.' : 'Még nincs családi program. Adjátok hozzá az első közös ötletet!');
      return true;
    } catch {
      if (current(ticket) && sequence === readSequence) {
        rows = []; listState = 'error';
        tell('Nem sikerült betölteni a családi listát. Ellenőrizd a kapcsolatot és a 04-es/06-os SQL telepítését, majd nyomd meg a Lista frissítése gombot. Ez nem üres lista, és nincs helyi tartalékmentés.', true);
      }
      return false;
    } finally {
      clearTimeout(timeout);
      if (current(ticket) && sequence === readSequence) { loading = false; render(); controls(); }
      if (readRequest === controller) readRequest = null;
    }
  }

  function filtered() {
    const search = find('#shared-search').value.trim().toLocaleLowerCase('hu-HU');
    const category = find('#shared-category').value;
    return rows.filter(p => (!find('#shared-only-favorites').checked || p.favorite) &&
      (!category || p.category === category) &&
      (!search || [p.name,p.location].some(text => text.toLocaleLowerCase('hu-HU').includes(search))))
      .sort((a,b) => find('#shared-sort').value === 'desc' ? b.cost-a.cost : a.cost-b.cost);
  }
  function render() {
    gallery?.clearCards(Boolean(access)&&listState==='ready');
    const cards = find('#shared-cards'); cards.replaceChildren();
    find('#shared-count').textContent = '';
    if (!access || listState !== 'ready') return;
    const shown = filtered(); find('#shared-count').textContent = `${shown.length} családi ötlet`;
    if (!shown.length) {
      const empty = node('div','empty');
      const hasFilters = find('#shared-search').value.trim() || find('#shared-category').value || find('#shared-only-favorites').checked;
      empty.append(node('p','',hasFilters ? 'Nincs a szűrőknek megfelelő családi program.' : 'A közös családi lista még üres. A helyi programok külön nézetben maradtak.'));
      if (hasFilters) {
        const clear = node('button','','Szűrők törlése'); clear.type='button';
        clear.onclick=()=>{find('#shared-search').value='';find('#shared-category').value='';find('#shared-only-favorites').checked=false;render();};
        empty.append(clear);
      }
      cards.append(empty);
    }
    for (const p of shown) {
      const card = node('article','card');
      const image = node('button','card-image placeholder cover-button',categoryIcons[p.category]);
      image.type='button';image.setAttribute('aria-label',`Képek megnyitása: ${p.name}`);
      if(gallery)void gallery.decorateCard(image,p);else image.disabled=true;
      const body = node('div','card-body');
      body.append(node('span','badge',p.category),node('h3','',p.name),node('p','location',`⌖ ${p.location}`),node('p','description',p.description));
      const price=node('div','cost',`${new Intl.NumberFormat('hu-HU').format(p.cost)} Ft`);
      price.append(node('small','',' / fő · becsült költség'));
      const actions=node('div','card-actions');
      const favorite=node('button','favorite',p.favorite ? '♥ Közös kedvenc' : '♡ Közös kedvenc');
      favorite.setAttribute('aria-pressed',String(p.favorite));
      favorite.onclick=()=>mutate('update',{favorite:!p.favorite},p);
      const edit=node('button','','Szerkesztés'); edit.onclick=()=>openForm(p);
      const photos=node('button','','Képek');photos.onclick=()=>gallery?.open(p);
      const remove=node('button','delete',p.deletion_pending?'Törlés folytatása':'Törlés');
      remove.onclick=()=>{
        if (!pending && confirm(`Biztosan törlöd a család közös programját ÉS a hozzá tartozó képeket: „${p.name}”? Minden családtag listájáról eltűnik.`)) return mutate('delete',null,p);
      };
      for(const button of [favorite,edit,remove,photos]) {button.type='button';button.disabled=pending||loading;}
      if(p.deletion_pending){favorite.disabled=edit.disabled=true;body.append(node('p','hint','A törlés még nem fejeződött be. A folytatás biztonságosan újrapróbálható.'));}
      actions.append(favorite,edit,photos,remove);body.append(price,actions);card.append(image,body);cards.append(card);
    }
  }

  function openForm(program = null) {
    if (!access || pending || loading || listState !== 'ready') return;
    resetForm(); editing = program ? {...program} : null;
    draftId = program?.id ?? crypto.randomUUID();
    find('#shared-form-title').textContent = program ? 'Családi program szerkesztése' : 'Új családi program';
    if (program) for (const key of ['name','location','category','cost','description']) form.elements[key].value=program[key];
    form.hidden=false;
    form.scrollIntoView({behavior:'smooth',block:'start'}); form.elements.name.focus({preventScroll:true});
  }

  async function mutate(kind, values, record = null) {
    if (!client || !access || pending || loading) return;
    if(kind==='delete'){
      if(!gallery){tell('A galériamodul nem töltődött be. Frissítsd az oldalt; a törlés nem indult el.',true);return;}
      return gallery.deleteProgram(record);
    }
    const ticket=generation, familyId=access.family.id;
    readSequence++;readRequest?.abort();readRequest=null;
    const controller=new AbortController();writeRequest=controller;
    const timeout=setTimeout(()=>controller.abort(),20000);
    pending=true;controls();render();tell('Családi módosítás mentése…');
    try {
      await checkMembership(ticket,controller.signal);
      if (!current(ticket)) return;
      let query=client.from('family_programs');
      if(kind==='create') query=query.insert({id:draftId,family_id:familyId,...values,favorite:false});
      else {
        query=kind==='delete' ? query.delete() : query.update({...values,version:record.version+1});
        // A feltételeket a szerver ellenőrzi, nem csak a felület.
        query=query.eq('id',record.id).eq('family_id',familyId).eq('version',record.version);
      }
      const {data,error}=await query.select(columns).abortSignal(controller.signal).maybeSingle();
      if(!current(ticket)) return;
      if(error) {
        // A felvétel közben elvesztett tagság RLS-hibát is eredményezhet.
        if(error.code==='42501') await checkMembership(ticket,controller.signal);
        throw error;
      }
      if(!data) {
        await checkMembership(ticket,controller.signal);
        throw Object.assign(new Error('conflict'),{code:'CONFLICT'});
      }
      await checkMembership(ticket,controller.signal);
      if(!current(ticket)) return;
      if(kind==='delete') rows=rows.filter(p=>p.id!==data.id);
      else {
        rows=rows.filter(p=>p.id!==data.id);rows.push(data);
      }
      if(kind==='create'||(kind==='update'&&values.name!==undefined)) resetForm();
      if(kind==='delete'&&editing?.id===data.id)resetForm();
      listState='ready';tell(kind==='delete'?'A családi program törölve.':'A családi módosítást a szerver visszaigazolta.');
    } catch(error) {
      if(!current(ticket)) return;
      if(error.code==='CONFLICT'||error.code==='40001') {
        tell('A programot közben módosították vagy törölték. Töltsd újra a listát; szerkesztésnél az Űrlap újratöltése gombbal kérd le az aktuális változatot. A beírt adataidat megtartottuk.',true);
        find('#shared-reload-edit').hidden=!editing;
      } else {
        tell('Nem sikerült visszaigazolni a családi mentést. Az űrlap adatai megmaradtak; nem mentettünk helyileg. Ellenőrizd a kapcsolatot és frissítsd a listát, mielőtt újrapróbálod: hálózati hiba esetén a szerver már fogadhatta a kérést.',true);
      }
    } finally {
      clearTimeout(timeout);
      if(current(ticket)){pending=false;controls();render();}
      if(writeRequest===controller)writeRequest=null;
    }
  }

  form.onsubmit=event=>{
    event.preventDefault();
    if(!access||pending||loading||!form.reportValidity())return;
    if(editing&&rows.find(p=>p.id===editing.id)?.deletion_pending){tell('A program törlése folyamatban van; előbb fejezd be a törlést.',true);return;}
    const values=Object.fromEntries(new FormData(form));
    for(const key of ['name','location','description'])values[key]=values[key].trim();
    values.cost=Number(values.cost);
    if(!values.name||!values.location||!values.description||!Number.isInteger(values.cost)||values.cost<0||values.cost>100000000||!Object.hasOwn(categoryIcons,values.category)){
      tell('Töltsd ki a kötelező mezőket. A költség 0 és 100 000 000 közötti egész forintösszeg legyen.',true);return;
    }
    return mutate(editing?'update':'create',values,editing);
  };
  find('#shared-cancel').onclick=()=>{if(!pending)resetForm();};
  find('#shared-new').onclick=()=>openForm();
  find('#shared-refresh').onclick=refresh;
  find('#shared-reload-edit').onclick=async()=>{
    if(!editing||pending||!confirm('Az űrlap újratöltése felülírja a beírt, el nem mentett mezőket. Folytatod?'))return;
    const id=editing.id,ticket=generation;
    if(await refresh()&&current(ticket)){
      const latest=rows.find(p=>p.id===id);
      if(latest)openForm(latest);
      else tell('Ez a program már nem elérhető. A beírt adataid az űrlapon maradtak; a Mégse gombbal zárhatod be.',true);
    }
  };
  find('#shared-search').oninput=render;
  for(const selector of ['#shared-category','#shared-sort','#shared-only-favorites'])find(selector).onchange=render;
  function chooseScope(shared) {
    find('#local-workspace').hidden=shared;find('#shared-workspace').hidden=!shared;
    for(const [selector,active]of [['#scope-local',!shared],['#scope-shared',shared]]){
      find(selector).setAttribute('aria-pressed',String(active));find(selector).classList.toggle('active',active);
    }
    if(shared)void refresh();
  }
  find('#scope-local').onclick=()=>chooseScope(false);
  find('#scope-shared').onclick=()=>chooseScope(true);
  find('#shared-backup').onclick=()=>{chooseScope(false);if(typeof window.navigate==='function')window.navigate('backup');else find('[data-view="backup"]').click();};
  window.addEventListener('focus',()=>{if(!find('#shared-workspace').hidden)void refresh();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!find('#shared-workspace').hidden)void refresh();});
  window.sharedPrograms={setClient(next,onInvalid){client=next;revalidate=onInvalid||(()=>{});gallery?.setContext(next,access);},setMembership,
    reloadAfterRestore(){gallery?.setContext(null,null);gallery?.setContext(client,access);resetForm();rows=[];return refresh();}};
  setMembership({state:'signed-out'});
})();
