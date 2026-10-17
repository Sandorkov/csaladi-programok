/* Külön családi ZIP-mentés. Nem használ IndexedDB-t, helyi JSON-t vagy tartalék mentési útvonalat. */
(()=>{
 'use strict';
 const find=s=>document.querySelector(s),A=globalThis.FamilyArchive,bucket='family-program-images';
 let client=null,access=null,epoch=0,operation=0,working=false,pending=null,job=null;
 const urls=new Set();
 const valid=(e,o)=>Boolean(access)&&e===epoch&&o===operation;
 function message(text,error=false){find('#family-backup-status').textContent=text;find('#family-backup-status').classList.toggle('error',error);}
 function progress(value,max,label){const p=find('#family-backup-progress');p.hidden=false;p.max=Math.max(1,max);p.value=value;message(label);}
 function controls(){
  const admin=access?.family.role==='admin';
  find('#family-export').disabled=!access||working;
  find('#family-restore-file').disabled=!admin||working;
  find('#family-restore-confirm').disabled=!admin||working||!pending;
  find('#family-restore-preview').hidden=!pending;
  find('#family-job-status').disabled=!admin||working;
  find('#family-job-cancel').hidden=!admin||!job||job.status!=='preparing';find('#family-job-cancel').disabled=working;
  find('#family-backup-stop').hidden=!working&&!pending;
  find('#family-backup-access').textContent=access?`${access.family.name} · ${admin?'Adminisztrátor: mentés és visszaállítás':'Tag: mentés; visszaállítás csak adminisztrátornak'}`:'A családi mentéshez lépj be, és legyen érvényes családtagságod.';
 }
 function clear(){
  operation++;pending=null;job=null;working=false;
  for(const url of urls)URL.revokeObjectURL(url);urls.clear();
  find('#family-restore-file').value='';find('#family-restore-summary').textContent='';find('#family-backup-progress').hidden=true;message('');controls();
 }
 async function rpc(action,args={}){
  const {data,error}=await client.rpc('family_backup',{p_action:action,...args});
  if(error)throw error;if(!data)throw Error('A szerver nem adott ellenőrizhető választ.');return data;
 }
 function explain(error){
  if(['TypeError','RangeError','SyntaxError'].includes(error?.name))return 'A fájl feldolgozása vagy a kapcsolat hibába ütközött. Nagy csomagnál használj több szabad memóriájú gépet. Nincs biztos siker-visszaigazolás.';
  return ['40001','42501','55000','22023'].includes(error?.code)?error.message:error?.message&&error instanceof Error?error.message:'A kapcsolat vagy a szerveroldali művelet nem sikerült. Ellenőrizd a 10-es SQL és az Edge Function telepítését. Nincs biztos siker-visszaigazolás.';
 }
 async function decode(bytes,mime){
  const url=URL.createObjectURL(new Blob([bytes],{type:mime}));urls.add(url);
  try{const image=new Image();image.src=url;await image.decode();if(!image.naturalWidth||!image.naturalHeight)throw Error('empty');}
  catch{throw Error('Egy fotó sérült vagy a böngészőben nem dekódolható. Nincs teljes, sikeres művelet.');}
  finally{URL.revokeObjectURL(url);urls.delete(url);}
 }
 async function edge(action,id,image=null){
  const {data,error}=await client.functions.invoke('family-restore',{body:{action,job:id,...(image?{image}: {})}});
  if(error){let detail;try{detail=await error.context?.json();}catch{/* Nem JSON hiba. */}
    const e=Error(detail?.error||'A szerveroldali fájlellenőrzés vagy véglegesítés nem igazolt. Kérd le az állapotot, majd ugyanazzal a fájllal folytathatod.');e.code=detail?.code;throw e;}
  if(!data||data.error)throw Error(data?.error||'Hiányzó szerveroldali visszaigazolás.');return data;
 }
 function completed(result){
  if(result.status!=='committed'||!Number.isInteger(result.programs)||!Number.isInteger(result.images))throw Error('Nem kaptunk biztos, ellenőrizhető visszaállítási eredményt. Kérd le az állapotot.');
  job={...job,status:'committed'};pending=null;find('#family-restore-file').value='';
  message(`A családi lista cseréjét a szerver visszaigazolta. Programok: ${result.programs}, képek: ${result.images}. A régi állapot archiválva megmaradt.`);
  void window.sharedPrograms?.reloadAfterRestore();
 }
 find('#family-export').onclick=async()=>{
  if(!access||working)return;const e=epoch,o=++operation;working=true;controls();
  try{
   progress(0,1,'Családi pillanatkép ellenőrzése…');const snapshot=await rpc('snapshot');if(!valid(e,o))return;
   if(snapshot.family.id!==access.family.id)throw Error('A célcsalád közben megváltozott.');
   const manifest={format:'csaladi-programok-family',version:1,created_at:new Date().toISOString(),source_family:snapshot.family,programs:snapshot.programs,images:[]},entries=[];
   for(let n=0;n<snapshot.images.length;n++){
    if(!valid(e,o))return;const photo=snapshot.images[n];progress(n,snapshot.images.length+1,`Kép letöltése és ellenőrzése: ${n+1}/${snapshot.images.length} · ${photo.original_name}`);
    const {data,error}=await client.storage.from(bucket).download(photo.object_path);if(!valid(e,o))return;
    if(error||!data)throw Error(`Nem sikerült letölteni: ${photo.original_name}. Nem készült teljes mentés.`);
    if(data.size!==photo.byte_size)throw Error(`Eltérő képméret: ${photo.original_name}. Nem készült teljes mentés.`);
    const bytes=new Uint8Array(await data.arrayBuffer()),hash=await A.sha256(bytes);if(!valid(e,o))return;
    if(!A.signature(bytes,photo.mime_type)||(photo.sha256&&photo.sha256!==hash))throw Error(`Hibás kép vagy ellenőrzőösszeg: ${photo.original_name}. Nem készült teljes mentés.`);
    await decode(bytes,photo.mime_type);if(!valid(e,o))return;
    const {object_path,sha256,...fields}=photo;manifest.images.push({...fields,sha256:hash,file:`images/${photo.id}`});entries.push([`images/${photo.id}`,bytes]);
   }
   A.validateManifest(manifest);
   progress(snapshot.images.length,snapshot.images.length+1,'Konzisztencia ellenőrzése…');const end=await rpc('snapshot');if(!valid(e,o))return;
   if(end.family.id!==snapshot.family.id||end.revision!==snapshot.revision)throw Error('Mentés közben megváltoztak a családi adatok. Nem készült kevert mentés; indítsd újra, amikor senki nem szerkeszt.');
   const zip=A.makeZip([['manifest.json',A.encode(manifest)],...entries]);if(!valid(e,o))return;
   const url=URL.createObjectURL(zip);urls.add(url);const a=document.createElement('a');a.href=url;a.download=`csaladi-mentes-${manifest.created_at.replace(/[:.]/g,'-')}.zip`;document.body.append(a);a.click();a.remove();
   setTimeout(()=>{URL.revokeObjectURL(url);urls.delete(url);},1000);
   progress(1,1,`Teljes családi ZIP elkészült: ${manifest.programs.length} program, ${manifest.images.length} eredeti kép. A böngésző elindította a letöltést; ellenőrizd a letöltések között.`);
  }catch(error){if(valid(e,o))message(`Nem készült teljes családi mentés. ${explain(error)}`,true);}
  finally{if(valid(e,o)){working=false;controls();}}
 };
 function invalidateFile(){if(working)return;operation++;pending=null;find('#family-restore-summary').textContent='';find('#family-restore-file').value='';message('Válassz családi ZIP-fájlt az ellenőrzéshez.');controls();}
 find('#family-restore-file').onclick=invalidateFile;
 find('#family-restore-file').onchange=async()=>{
  if(working||access?.family.role!=='admin')return;
  pending=null;const file=find('#family-restore-file').files?.[0];const e=epoch,o=++operation;controls();if(!file)return;
  working=true;controls();
  try{
   if(file.size>A.limits.archiveBytes)throw Error('A ZIP legfeljebb 220 MiB lehet.');
   const bytes=new Uint8Array(await file.arrayBuffer());if(!valid(e,o))return;
   const pack=await A.validatePackage(bytes,(n,max,name)=>{if(!valid(e,o))throw Error('Megszakítva.');progress(n,max,`Csomag ellenőrzése: ${n}/${max} · ${name}`);},async(b,m)=>{if(!valid(e,o))throw Error('Megszakítva.');await decode(b,m);});
   if(!valid(e,o))return;pending={...pack,jobId:crypto.randomUUID()};job=null;
   find('#family-restore-summary').textContent=`Beolvasott fájl: ${file.name}. Mentés: ${new Date(pack.manifest.created_at).toLocaleString('hu-HU')}. ${pack.summary.programs} program, ${pack.summary.images} kép. Cél: ${access.family.name}.`;
   message('A teljes csomag ellenőrzése sikeres. Még semmit nem módosítottunk; külön megerősítés szükséges.');
  }catch(error){if(valid(e,o)){pending=null;message(explain(error),true);}}
  finally{if(valid(e,o)){working=false;controls();}}
 };
 find('#family-restore-confirm').onclick=async()=>{
  if(!pending||working||access?.family.role!=='admin')return;
  if(!confirm(`A(z) „${access.family.name}” teljes családi listáját lecseréled ${pending.summary.programs} programra és ${pending.summary.images} képre? A helyi lista nem változik.`))return;
  const pack=pending,e=epoch,o=++operation;working=true;controls();
  try{
   progress(0,pack.summary.images+2,'Elkülönített előkészítés indítása / folytatása…');
   pack.started=true;const state=await rpc('start',{p_job:pack.jobId,p_manifest:pack.manifest});if(!valid(e,o))return;job=state;pack.jobId=state.id;
   if(job.status==='committed'){completed(job);return;}if(job.status!=='preparing')throw Error('Ez az előkészítés megszakított. Válaszd ki újra a ZIP-fájlt új indításhoz.');
   for(let n=0;n<job.files.length;n++){
    if(!valid(e,o))return;const photo=job.files[n];progress(n+1,job.files.length+2,`Előkészítés és szerverellenőrzés: ${n+1}/${job.files.length}`);
    if(photo.state==='ready')continue;
    const original=pack.manifest.images.find(i=>i.id===photo.source_id),bytes=pack.files.get(original?.file);
    if(!bytes)throw Error('Hiányzó ellenőrzött képfájl.');
    const {error}=photo.uploaded?{error:null}:await client.storage.from(bucket).upload(photo.object_path,new Blob([bytes],{type:photo.mime_type}),{contentType:photo.mime_type,upsert:false,cacheControl:'0'});if(!valid(e,o))return;
    // Bizonytalan korábbi feltöltésnél az immutábilis útvonal már létezhet: a szerver
    // letölti és hash-eli, nem tekintjük a 409-et sikernek és nem írjuk felül a fájlt.
    if(error&&String(error.statusCode??error.status)!=='409')throw Error(`A feltöltés megszakadt: ${original.original_name}. Az aktív lista változatlan. Ugyanezzel a csomaggal újrapróbálható; előbb kérd le az állapotot.`);
    let verified;try{verified=await edge('verify',job.id,photo.id);}catch(error){const detail=Error(`Kép: ${original.original_name}. ${explain(error)}`);detail.code=error.code;throw detail;}if(!valid(e,o))return;
    if(verified.status!=='verified')throw Error('A kép ellenőrzésére nem érkezett biztos visszaigazolás.');
   }
   if(!valid(e,o))return;progress(job.files.length+1,job.files.length+2,'Minden kép ellenőrizve. Tranzakciós átváltás és verzióellenőrzés…');
   const result=await edge('commit',job.id);if(!valid(e,o))return;completed(result);find('#family-backup-progress').value=find('#family-backup-progress').max;
  }catch(error){if(valid(e,o))message(`${explain(error)} Nincs biztos teljes siker. A Visszaállítások állapota gombbal ellenőrizd az eredményt.`,true);}
  finally{if(valid(e,o)){working=false;controls();}}
 };
 find('#family-job-status').onclick=async()=>{
  if(working||access?.family.role!=='admin')return;const e=epoch,o=++operation;working=true;controls();
  try{
   if(job){const state=await rpc('status',{p_job:job.id});if(!valid(e,o))return;job=state;
    if(state.status==='committed')completed(state);
    else message(`Művelet: ${state.id}\nÁllapot: ${state.status==='preparing'?'előkészítés; az aktív lista még változatlan':'megszakított'}. Programok: ${state.programs}, kész képek: ${state.files.filter(f=>f.state==='ready').length}/${state.images}. ${state.base_revision!==state.current_revision?'A lista közben módosult: ez a művelet nem véglegesíthető.':''}`);
   }else{const result=await rpc('jobs');if(!valid(e,o))return;
    const active=result.jobs.find(j=>j.status==='preparing');job=active||null;
    message(result.jobs.length?result.jobs.map(j=>`${j.id} · ${j.status} · ${j.programs} program, ${j.images} kép`).join('\n')+'\nFolytatáshoz válaszd ki ugyanazt az eredeti ZIP-fájlt és erősítsd meg a visszaállítást.':'Nincs korábbi visszaállításod.');}
  }catch(error){if(valid(e,o))message(explain(error),true);}finally{if(valid(e,o)){working=false;controls();}}
 };
 find('#family-job-cancel').onclick=async()=>{
  if(working||!job||access?.family.role!=='admin'||!confirm('Megszakítod az elkülönített előkészítést? Az aktív lista változatlan; a feltöltött maradványokat később lehet takarítani.'))return;
  const e=epoch,o=++operation;working=true;controls();try{const result=await rpc('cancel',{p_job:job.id});if(!valid(e,o))return;job=result;pending=null;
   if(result.status==='committed')completed(result);else message('Az előkészítés megszakított. Az aktív lista változatlan, a maradványok elkülönítve megmaradtak.');
  }catch(error){if(valid(e,o))message(explain(error),true);}finally{if(valid(e,o)){working=false;controls();}}
 };
 find('#family-backup-stop').onclick=()=>{
  operation++;working=false;pending=null;for(const url of urls)URL.revokeObjectURL(url);urls.clear();
  find('#family-restore-file').value='';find('#family-backup-progress').hidden=true;
  message('A böngészős folyamatot leállítottad. A már elküldött kérés még befejeződhetett: kérd le a visszaállítás állapotát. Az elkülönített előkészítést külön megszakíthatod.');controls();
 };
 window.familyBackup={setClient(next){if(client!==next){epoch++;clear();client=next;}},setMembership(info){
  const next=info.state==='member'?info:null;
  if(access?.userId!==next?.userId||access?.family.id!==next?.family.id||access?.family.role!==next?.family.role){epoch++;access=next;clear();}else{access=next;controls();}
 }};
 controls();
})();
