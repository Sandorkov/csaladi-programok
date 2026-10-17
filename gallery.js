/* Privát Storage-letöltések, eredeti fájlok és követhető, verziózott SQL-műveletek. */
window.createFamilyGallery = function createFamilyGallery(callbacks) {
  'use strict';
  const find=s=>document.querySelector(s), dialog=find('#photo-dialog');
  const bucket='family-program-images', maxBytes=8*1024*1024;
  let client=null,access=null,epoch=0,cardEpoch=0,viewEpoch=0,snapshot=null,programId=null,busy=false;
  let currentIndex=0,loadIndex=0,bigURL=null,opener=null,touch=null,operation=0,viewRead=0;
  const cardURLs=new Set();
  const validationURLs=new Set(),coverInfo=new Map(),coverMedia=new Map();
  let cacheEpoch=0;
  const valid=t=>access&&t===epoch;
  const visible=(t,v)=>valid(t)&&v===viewEpoch&&dialog.open;
  function text(message,error=false){find('#photo-status').textContent=message;find('#photo-status').classList.toggle('error',error);}
  function clearCards(preserve=false){
    cardEpoch++;
    if(preserve)return;
    cacheEpoch++;for(const url of cardURLs)URL.revokeObjectURL(url);cardURLs.clear();coverInfo.clear();coverMedia.clear();
  }
  function clearBig(){loadIndex++;find('#photo-large').removeAttribute('src');if(bigURL)URL.revokeObjectURL(bigURL);bigURL=null;}
  function clearView(){
    viewEpoch++;operation++;viewRead++;clearBig();snapshot=null;programId=null;busy=false;touch=null;currentIndex=0;
    for(const url of validationURLs)URL.revokeObjectURL(url);validationURLs.clear();
    find('#photo-files').value='';find('#photo-items').replaceChildren();find('#photo-results').replaceChildren();
    find('#photo-title').textContent='Képek';find('#photo-counter').textContent='';text('');
    find('#photo-stage').classList.remove('zoomed');
    find('#photo-zoom').setAttribute('aria-pressed','false');
  }
  function close(force=false){
    if(!force&&busy&&!confirm('Művelet folyamatban. Bezárod? A már elküldött kérés még befejeződhet; a félbemaradt lépések később rendezhetők.'))return;
    if(dialog.open)dialog.close();clearView();
    if(!force&&opener?.isConnected)opener.focus();opener=null;
  }
  function setContext(nextClient,nextAccess){
    if(client===nextClient&&access?.userId===nextAccess?.userId&&access?.family.id===nextAccess?.family.id){access=nextAccess;return;}
    epoch++;close(true);clearCards();client=nextClient;access=nextAccess;
  }
  function errorText(error){
    if(error.code==='40001')return 'A program vagy a galéria közben megváltozott. Frissítsd a galériát/listát, majd próbáld újra.';
    if(error.code==='42501')return 'Nincs hozzáférés ehhez a programhoz. Ellenőrizzük újra a családtagságot.';
    if(['22023','55000'].includes(error.code))return error.message;
    return 'Nem kaptunk biztos visszaigazolást. A már elmentett képek megmaradnak. Frissítsd a galériát, és rendezd a függő műveleteket.';
  }
  async function rpc(id,action,extra={},t=epoch){
    if(!valid(t))throw Error('stale');
    const {data,error}=await client.rpc('family_gallery',{p_program_id:id,p_action:action,...extra});
    if(!valid(t))throw Error('stale');
    if(error){if(error.code==='42501')callbacks.onAccessError?.();throw error;}
    if(!data?.program||!Array.isArray(data.images))throw Error('invalid-response');
    for(const [id,media]of coverMedia){
      if(media.programId===data.program.id&&!data.images.some(i=>i.id===id&&i.state==='ready')){
        if(media.url){URL.revokeObjectURL(media.url);cardURLs.delete(media.url);}coverMedia.delete(id);
      }
    }
    callbacks.onProgram(data.program);
    return data;
  }
  function extraFor(snap,id=null){return {p_expected_gallery:snap.program.gallery_version,p_image_id:id};}
  async function read(id=programId){return rpc(id,'list');}
  function readyImages(){return snapshot?.images.filter(i=>i.state==='ready')||[];}
  function updateControls(){
    for(const id of ['#photo-upload','#photo-cleanup','#photo-files'])find(id).disabled=busy||!snapshot||snapshot.program.deletion_pending;
    find('#photo-refresh').disabled=busy||!programId;
    find('#photo-prev').disabled=find('#photo-next').disabled=readyImages().length<2;
    // A törlés alatt álló program maradék képeit a kártya Törlés folytatása gombja rendezi.
    for(const button of find('#photo-items').querySelectorAll('button'))button.disabled=busy||snapshot?.program.deletion_pending;
  }
  async function showImage(index){
    const images=readyImages(),t=epoch,v=viewEpoch;
    clearBig();const request=loadIndex;
    if(!images.length){find('#photo-counter').textContent='Még nincs véglegesített kép.';return;}
    currentIndex=(index+images.length)%images.length;
    const photo=images[currentIndex];find('#photo-counter').textContent=`${currentIndex+1} / ${images.length} · ${photo.original_name}`;
    find('#photo-large').alt=photo.original_name;
    try{
      const {data,error}=await client.storage.from(bucket).download(photo.object_path);
      if(!visible(t,v)||request!==loadIndex)return;
      if(error||!data)throw error||Error('missing-image');
      bigURL=URL.createObjectURL(data);find('#photo-large').src=bigURL;
    }catch(error){if(visible(t,v)&&request===loadIndex){text('A kép letöltése nem sikerült. Ellenőrizd a kapcsolatot/jogosultságot, majd frissítsd a galériát.',true);if(String(error.statusCode)==='403')callbacks.onAccessError?.();}}
  }
  function render(){
    const items=find('#photo-items');items.replaceChildren();
    if(!snapshot)return;
    find('#photo-title').textContent=`Képek · ${snapshot.program.name}`;
    for(const image of snapshot.images){
      const row=document.createElement('li'),label=document.createElement('span');
      label.textContent=`${image.original_name} · ${image.state==='ready'?(image.is_cover?'Borítókép':'Mentett kép'):image.state==='pending'?'Függő feltöltés':'Törlés alatt'}`;
      row.append(label);
      function button(title,action){const b=document.createElement('button');b.type='button';b.textContent=title;b.onclick=action;row.append(b);}
      if(image.state==='ready'){
        button('Megnézem',()=>showImage(readyImages().findIndex(i=>i.id===image.id)));
        if(!image.is_cover)button('Legyen borító',()=>perform(async(t,v)=>{const next=await rpc(programId,'cover',extraFor(snapshot,image.id),t);if(visible(t,v))snapshot=next;}));
      }else if(image.state==='pending'){
        button('Véglegesítés újrapróbálása',()=>perform(async(t,v)=>{const next=await rpc(programId,'finalize',extraFor(snapshot,image.id),t);if(visible(t,v))snapshot=next;}));
      }
      button(image.state==='deleting'?'Törlés folytatása':'Kép törlése',()=>{
        if(confirm(`Biztosan törlöd ezt a képet minden családtag számára: „${image.original_name}”? A kész fájl végleges törlése nem vonható vissza ebből az alkalmazásból.`))return perform(async(t,v)=>{const next=await deleteImage(snapshot,image,t);if(visible(t,v))snapshot=next;});
      });
      items.append(row);
    }
    updateControls();void showImage(Math.min(currentIndex,readyImages().length-1));
  }
  async function perform(action){
    if(busy||!snapshot||snapshot.program.deletion_pending)return;
    const t=epoch,v=viewEpoch,op=++operation;viewRead++;busy=true;updateControls();text('Művelet folyamatban…');
    try{await action(t,v);if(visible(t,v)&&op===operation){render();text('A műveletet a szerver visszaigazolta.');}}
    catch(error){if(visible(t,v)&&op===operation)text(errorText(error),true);}
    finally{if(visible(t,v)&&op===operation){busy=false;updateControls();}}
  }
  async function deleteImage(snap,image,t=epoch,expireOnly=false){
    const v=viewEpoch,op=operation;
    let result=await rpc(snap.program.id,expireOnly?'expire':'mark_delete',extraFor(snap,image.id),t);
    if(visible(t,v)&&op===operation&&programId===snap.program.id){snapshot=result;render();}
    const target=result.images.find(i=>i.id===image.id);
    if(!target)return result; // Már lezárt törlés, idempotens újrapróbálás.
    const {error}=await client.storage.from(bucket).remove([target.object_path]);
    if(!valid(t))throw Error('stale');
    if(error&&String(error.statusCode??error.status)!=='404')throw error;
    // 404 esetén is az SQL ellenőrzi az objektum hiányát; a hibakód önmagában nem elég.
    result=await rpc(snap.program.id,'finish_delete',{p_image_id:image.id},t);
    return result;
  }
  async function open(program){
    if(!access)return;
    if(busy){callbacks.report?.('Előbb várd meg a galériaművelet végét.',true);return;}
    close(true);opener=document.activeElement;programId=program.id;
    dialog.showModal();const t=epoch,v=viewEpoch,seq=++viewRead;text('Galéria betöltése…');updateControls();
    try{const next=await read(program.id);if(visible(t,v)&&seq===viewRead){snapshot=next;currentIndex=Math.max(0,readyImages().findIndex(i=>i.is_cover));render();text(next.program.deletion_pending?'A program törlése folyamatban van. Bezárás után a kártya Törlés folytatása gombjával folytathatod.':'A képek privát letöltéssel jelennek meg.');}}
    catch(error){if(visible(t,v)&&seq===viewRead)text(errorText(error),true);}
  }
  async function validateFile(file){
    if(!file.size||file.size>maxBytes)throw Error('A kép mérete 1 byte és 8 MiB között lehet.');
    if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type))throw Error('Csak JPG, PNG, WebP és GIF támogatott. A HEIC/HEIF és SVG nem támogatott; válassz vagy készíts külön támogatott másolatot.');
    if(!file.name.trim()||file.name.length>180)throw Error('A fájlnév 1–180 karakter hosszú lehet.');
    const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
    const starts=(...values)=>values.every((b,i)=>bytes[i]===b);
    const ascii=(start,end)=>String.fromCharCode(...bytes.slice(start,end));
    const signature=file.type==='image/jpeg'?starts(255,216,255):file.type==='image/png'?starts(137,80,78,71,13,10,26,10):file.type==='image/gif'?/^GIF8[79]a$/.test(ascii(0,6)):starts(82,73,70,70)&&ascii(8,12)==='WEBP';
    if(!signature)throw Error('A fájl tartalma nem felel meg a képformátumnak.');
    const url=URL.createObjectURL(file);
    validationURLs.add(url);
    try{const image=new Image();image.src=url;await image.decode();if(!image.naturalWidth||!image.naturalHeight)throw Error('empty');}
    catch{throw Error('A kép sérült vagy ebben a böngészőben nem olvasható.');}
    finally{URL.revokeObjectURL(url);validationURLs.delete(url);}
  }
  find('#photo-upload').onclick=async()=>{
    if(busy||!snapshot||snapshot.program.deletion_pending)return;
    const files=Array.from(find('#photo-files').files||[]);
    if(!files.length){text('Előbb válassz egy vagy több képfájlt.',true);return;}
    if(files.length>10){text('Egyszerre legfeljebb 10 fájlt válassz. Programonként összesen legfeljebb 20 kép/foglalás lehet.',true);return;}
    const t=epoch,v=viewEpoch,op=++operation;viewRead++;busy=true;updateControls();find('#photo-results').replaceChildren();
    let saved=0,stopped=false;
    for(const file of files){
      if(!visible(t,v))break;
      const result=document.createElement('li');result.textContent=`${file.name} · Ellenőrzés…`;find('#photo-results').append(result);
      if(stopped){result.textContent=`${file.name} · Kimaradt: előbb frissítsd a galériát és rendezd az előző műveletet.`;continue;}
      try{await validateFile(file);}catch(error){if(visible(t,v))result.textContent=`${file.name} · Nem mentettük: ${error.message}`;continue;}
      if(!visible(t,v))break;
      try{
        const id=crypto.randomUUID();
        result.textContent=`${file.name} · Feltöltés előkészítése…`;
        const reserved=await rpc(programId,'reserve',{...extraFor(snapshot,id),p_name:file.name,p_mime:file.type,p_bytes:file.size},t);
        if(!visible(t,v))break;snapshot=reserved;
        const image=reserved.images.find(i=>i.id===id);
        result.textContent=`${file.name} · Eredeti fájl feltöltése…`;
        const {error}=await client.storage.from(bucket).upload(image.object_path,file,{contentType:file.type,upsert:false,cacheControl:'0'});
        if(!visible(t,v))break;
        if(error)throw error;
        const finalized=await rpc(programId,'finalize',extraFor(snapshot,id),t);
        if(!visible(t,v))break;
        snapshot=finalized;
        saved++;result.textContent=`${file.name} · Mentve.`;
      }catch(error){if(!visible(t,v))break;result.textContent=`${file.name} · Nem véglegesítettük / nincs biztos visszaigazolás: ${errorText(error)} Ha létrejött foglalás, frissítés után rendezhető.`;stopped=true;}
    }
    if(visible(t,v)&&op===operation){
      busy=false;render();find('#photo-files').value='';
      text(`Véglegesített képek: ${saved} / ${files.length}. A fájlonkénti eredmények alább láthatók.${stopped?' Frissítsd a galériát a tényleges állapot ellenőrzéséhez.':''}`,saved!==files.length);
    }
  };
  find('#photo-refresh').onclick=async()=>{
    if(busy||!programId)return;
    const t=epoch,v=viewEpoch,seq=++viewRead;text('Galéria frissítése…');
    try{const next=await read();if(visible(t,v)&&seq===viewRead){snapshot=next;render();text('Galéria frissítve.');}}catch(error){if(visible(t,v)&&seq===viewRead)text(errorText(error),true);}
  };
  find('#photo-cleanup').onclick=()=>{
    if(!snapshot||!confirm('Folytatod a törlésre jelölt képek eltávolítását, és törlöd a 15 percnél régebbi, nem véglegesített feltöltéseket? A mentett, kész képeket ez nem törli.'))return;
    return perform(async(t,v)=>{
      let state=await read();if(!visible(t,v))return;snapshot=state;
      const candidates=state.images.filter(i=>i.state==='deleting'||(i.state==='pending'&&Date.parse(i.upload_expires_at)<=Date.now()));
      for(const image of candidates){if(!visible(t,v))return;state=await deleteImage(state,image,t,image.state==='pending');if(visible(t,v))snapshot=state;}
    });
  };
  async function deleteProgram(program){
    if(!access||busy){callbacks.report?.('Előbb várd meg a galériaművelet végét.',true);return;}
    const t=epoch,op=++operation;busy=true;callbacks.report?.('A program és képei törlésének előkészítése…');
    try{
      let state=await rpc(program.id,'prepare_program_delete',{p_expected_gallery:program.gallery_version??0,p_expected_version:program.version},t);
      for(const image of state.images){if(!valid(t)||op!==operation)return;state=await deleteImage(state,image,t);}
      if(!valid(t)||op!==operation)return;
      const end=await rpc(program.id,'finish_program_delete',{p_expected_gallery:state.program.gallery_version,p_expected_version:state.program.version},t);
      if(valid(t)){if(programId===program.id)close(true);callbacks.report?.('A program és a hozzá tartozó képfájlok törlése befejeződött.');}
      return end;
    }catch(error){if(valid(t))callbacks.report?.(`${errorText(error)} Részleges törlésnél a kártyán a Törlés folytatása gombbal rendezheted a maradékot.`,true);}
    finally{if(valid(t)&&op===operation)busy=false;}
  }
  async function decorateCard(button,program){
    const t=epoch,c=cardEpoch;
    button.onclick=()=>open(program);button.title='Képek megnyitása / hozzáadása';
    try{
      let info=coverInfo.get(program.id);
      if(!info||info.version!==program.gallery_version){
        info={version:program.gallery_version,promise:client.from('family_program_images').select('id,object_path,original_name')
          .eq('program_id',program.id).eq('is_cover',true).eq('state','ready').maybeSingle()};
        coverInfo.set(program.id,info);
      }
      const {data,error}=await info.promise;
      if(!valid(t)||c!==cardEpoch)return;
      if(error)throw error;if(!data)return;
      let media=coverMedia.get(data.id);
      if(!media){
        media={programId:program.id,url:null};coverMedia.set(data.id,media);const cache=cacheEpoch;
        media.promise=(async()=>{
          const download=await client.storage.from(bucket).download(data.object_path);
          if(!valid(t)||cache!==cacheEpoch||coverMedia.get(data.id)!==media)return null;
          if(download.error||!download.data){coverMedia.delete(data.id);throw download.error||Error('download');}
          media.url=URL.createObjectURL(download.data);cardURLs.add(media.url);return media.url;
        })();
      }
      const url=await media.promise;
      if(!url||!valid(t)||c!==cardEpoch)return;
      const image=document.createElement('img');image.className='card-image';image.alt=`Borítókép: ${program.name}`;image.src=url;
      image.onerror=()=>{URL.revokeObjectURL(url);cardURLs.delete(url);button.textContent='Kép nem tölthető be';};
      button.replaceChildren(image);
    }catch{if(valid(t)&&c===cardEpoch){button.title='A borító nem tölthető be. Nyisd meg a galériát a hiba ellenőrzéséhez.';}}
  }
  find('#photo-close').onclick=()=>close();
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('close',()=>{if(!dialog.open)clearView();});
  find('#photo-prev').onclick=()=>showImage(currentIndex-1);
  find('#photo-next').onclick=()=>showImage(currentIndex+1);
  find('#photo-zoom').onclick=()=>{const on=find('#photo-stage').classList.toggle('zoomed');find('#photo-zoom').setAttribute('aria-pressed',String(on));};
  dialog.addEventListener('keydown',event=>{
    if(['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName))return;
    if(event.key==='ArrowLeft'){event.preventDefault();void showImage(currentIndex-1);}
    if(event.key==='ArrowRight'){event.preventDefault();void showImage(currentIndex+1);}
  });
  find('#photo-stage').addEventListener('pointerdown',event=>{if(event.pointerType==='touch')touch=event.isPrimary===false?null:{x:event.clientX,y:event.clientY};});
  find('#photo-stage').addEventListener('pointercancel',()=>{touch=null;});
  find('#photo-stage').addEventListener('pointerup',event=>{
    if(!touch)return;const dx=event.clientX-touch.x,dy=event.clientY-touch.y;touch=null;
    if(!find('#photo-stage').classList.contains('zoomed')&&Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.5)void showImage(currentIndex+(dx<0?1:-1));
  });
  find('#photo-large').onerror=()=>{if(dialog.open)text('Ez a képfájl nem jeleníthető meg. Frissítsd a galériát; a fájlt nem módosítottuk.',true);};
  return {setContext,clearCards,decorateCard,open,deleteProgram,isBusy:()=>busy,
    syncPrograms(programs){if(programId&&!programs.some(p=>p.id===programId))close(true);}};
};
