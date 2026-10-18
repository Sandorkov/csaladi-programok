/* Admin taglista/meghívók és külön megerősített csatlakozás. Nincs helyi adatírás. */
(()=>{
 'use strict';
 const find=s=>document.querySelector(s),linkState=window.FamilyInviteLink;
 const labels={active:'Aktív',expired:'Lejárt',revoked:'Visszavont',used:'Felhasznált',issuer_inactive:'A kiállító adminjoga megszűnt'};
 let client=null,userId=null,access=null,epoch=0,adminTicket=0,inviteTicket=0,adminBusy=false,inviteBusy=false,result=null,lastLink=null,reload=()=>{};
 const admin=()=>Boolean(client&&userId&&access?.userId===userId&&access?.family.role==='admin');
 function say(id,text,error=false){find(id).textContent=text;find(id).classList.toggle('error',error);}
 function clearLink(){lastLink=null;find('#family-invite-link').value='';find('#family-invite-result').hidden=true;}
 function controls(){
  find('#family-members-open').hidden=!admin();
  for(const id of ['#family-members-refresh','#family-invite-create'])find(id).disabled=!admin()||adminBusy;
  find('#family-invite-copy').disabled=!admin()||!lastLink;
  find('#invite-login').hidden=Boolean(userId)||!linkState?.get();
  find('#invite-refresh').hidden=!userId||!linkState?.get();find('#invite-refresh').disabled=inviteBusy;
  find('#invite-accept').hidden=!userId||result?.status!=='valid';find('#invite-accept').disabled=inviteBusy;
  find('#invite-dismiss').disabled=inviteBusy;
 }
 function clearAdmin(){adminTicket++;adminBusy=false;clearLink();find('#family-member-list').replaceChildren();find('#family-invite-list').replaceChildren();find('#family-members-panel').hidden=true;say('#family-members-status','');controls();}
 function detail(error){return ['42501','55000','22023'].includes(error?.code)?error.message:'Nem érkezett biztos szerverválasz. Ellenőrizd a kapcsolatot, a 12-es migrációt és a family-invite Edge telepítését, majd frissítsd az állapotot.';}
 async function rpc(action,args={}){const {data,error}=await client.rpc('family_members_admin',{p_action:action,...args});if(error)throw error;if(!data)throw Error('missing');return data;}
 async function edge(action,token){
  const {data,error}=await client.functions.invoke('family-invite',{body:{action,...(token?{token}:{})}});
  if(error){let info;try{info=await error.context?.json();}catch{/* Nem naplózunk hibatörzset. */}const e=Error(info?.error||'Nem érkezett biztos szerverválasz. Ellenőrizd újra a meghívót.');e.code=info?.code;throw e;}
  if(!data||data.error)throw Error('missing');return data;
 }
 function node(tag,text){const n=document.createElement(tag);n.textContent=text;return n;}
 function date(s){return new Date(s).toLocaleString('hu-HU');}
 async function load(){
  if(!admin())return;const e=epoch,t=++adminTicket;adminBusy=true;controls();say('#family-members-status','Családtagok és meghívók betöltése…');
  try{const data=await rpc('list');if(e!==epoch||t!==adminTicket||!admin())return;
   if(!Array.isArray(data.members)||!Array.isArray(data.invites))throw Error('shape');
   find('#family-member-list').replaceChildren();find('#family-invite-list').replaceChildren();
   for(const m of data.members){if(!['admin','member'].includes(m.role))throw Error('role');find('#family-member-list').append(node('li',`${m.display_name}${m.email&&m.email!==m.display_name?' · '+m.email:''} · ${m.role==='admin'?'Adminisztrátor':'Tag'} · Csatlakozás: ${date(m.joined_at)}`));}
   for(const i of data.invites){
    const row=node('li',`${i.id.slice(0,8)} · ${labels[i.status]||'Ismeretlen állapot'} · Érvényes eddig: ${date(i.expires_at)}`);
    if(i.status==='active'){
     const b=node('button','Visszavonás');b.type='button';b.onclick=async()=>{
      if(!admin()||adminBusy||!confirm('Visszavonod ezt az egyszer használható családi meghívót?'))return;
      const e=epoch,t=++adminTicket;adminBusy=true;controls();b.disabled=true;
      try{const answer=await rpc('revoke',{p_invite:i.id});if(e!==epoch||t!==adminTicket||!admin())return;
       clearLink();await load();if(e===epoch&&admin())say('#family-members-status',answer.status==='used'?'A meghívót időközben felhasználták; meglévő tagságot nem töröltünk.':'A meghívó visszavonva.');
      }catch(error){if(e===epoch&&t===adminTicket&&admin())say('#family-members-status',detail(error),true);}
      finally{if(e===epoch&&t===adminTicket){adminBusy=false;controls();b.disabled=false;}}
     };row.append(b);
    }
    find('#family-invite-list').append(row);
   }
   say('#family-members-status',`${data.family_name} · ${data.members.length} családtag. A legutóbbi legfeljebb 100 meghívó látható.`);
  }catch(error){if(e===epoch&&t===adminTicket&&admin()){find('#family-member-list').replaceChildren();find('#family-invite-list').replaceChildren();say('#family-members-status',detail(error),true);}}
  finally{if(e===epoch&&t===adminTicket){adminBusy=false;controls();}}
 }
 function showResult(data){
  const name=data?.family_name;
  if(!data||(['valid','joined','already_member','other_family'].includes(data.status)&&(typeof name!=='string'||!name.trim()))){result=null;say('#invite-status','A szerver nem adott ellenőrizhető családnevet. Próbáld újra; nem indult csatlakozás.',true);return;}
  result=data;
  if(data.status==='valid'&&typeof name==='string')say('#invite-status',`Ehhez a családhoz csatlakoznál: ${name}. Normál tagként használhatod a közös programokat és galériákat. A csatlakozáshoz külön megerősítés szükséges.`);
  else if(['joined','already_member'].includes(data.status)&&typeof name==='string'){
   linkState.clear();say('#invite-status',data.status==='joined'?`Sikeresen csatlakoztál: ${name} · Tag. A Családi programok nézetben éred el a közös listát.`:`Már ennek a családnak a tagja vagy: ${name}. Nem hoztunk létre új tagságot.`);
  }else if(data.status==='other_family')say('#invite-status',`Már másik családhoz tartozol. Nem léptetünk át a(z) ${name} családba, és nem töröljük a tagságodat. Ha másik Google-fiókkal szeretnél csatlakozni, jelentkezz ki, majd lépj be azzal.`,true);
  else say('#invite-status',({expired:'A meghívó lejárt. Kérj új linket az adminisztrátortól.',revoked:'A meghívót visszavonták. Kérj új linket.',used:'Ezt az egyszer használható meghívót már felhasználták.',issuer_inactive:'A meghívó kiállítójának adminjoga megszűnt. Kérj új meghívót.'})[data.status]||'A meghívó hibás vagy már nem elérhető. Kérj új linket.',true);
 }
 async function checkInvite(){
  const token=linkState?.get();const e=epoch,t=++inviteTicket;inviteBusy=false;result=null;
  find('#invite-panel').hidden=!token&&!linkState?.invalid();controls();
  if(!token){if(linkState?.invalid())say('#invite-status','A meghívólink hibás. Kérj új linket az adminisztrátortól.',true);return;}
  if(!userId||!client){say('#invite-status',linkState.canLeave()?'Meghívót nyitottál meg. Először lépj be a saját Google-fiókoddal; ettől még nem csatlakozol automatikusan.':'A böngésző tiltja a fülen belüli tárolást. A meghívó nem őrizhető meg a Google-átirányítás alatt. Engedélyezd a sessionStorage használatát, vagy előbb lépj be meghívó nélkül, majd nyisd meg újra a linket.',!linkState.canLeave());return;}
  inviteBusy=true;controls();say('#invite-status','Meghívó ellenőrzése…');
  try{const data=await edge('preview',token);if(e!==epoch||t!==inviteTicket||token!==linkState.get())return;showResult(data);}
  catch(error){if(e===epoch&&t===inviteTicket)say('#invite-status',error.message&&error.message!=='missing'?error.message:'A meghívó ellenőrzése nem sikerült. Próbáld újra.',true);}
  finally{if(e===epoch&&t===inviteTicket){inviteBusy=false;controls();}}
 }
 find('#invite-accept').onclick=async()=>{
  const token=linkState?.get();if(!client||!userId||inviteBusy||!token||result?.status!=='valid')return;
  if(!confirm(`Csatlakozol a(z) „${result.family_name}” családhoz normál tagként?`))return;
  const e=epoch,t=++inviteTicket;inviteBusy=true;controls();say('#invite-status','Csatlakozás szerveroldali ellenőrzése…');
  try{const answer=await edge('accept',token);if(e!==epoch||t!==inviteTicket||token!==linkState.get())return;showResult(answer);
   if(['joined','already_member'].includes(answer.status))reload();
  }catch{if(e===epoch&&t===inviteTicket){result=null;say('#invite-status','Nem érkezett biztos visszaigazolás. Lehet, hogy a csatlakozás befejeződött; a Meghívó ellenőrzése újra gombbal ellenőrizd. Nem jelzünk hamis sikert.',true);}}
  finally{if(e===epoch&&t===inviteTicket){inviteBusy=false;controls();}}
 };
 find('#invite-refresh').onclick=()=>{if(!inviteBusy)return checkInvite();};
 find('#invite-dismiss').onclick=()=>{if(inviteBusy)return;inviteTicket++;linkState?.clear();result=null;find('#invite-panel').hidden=true;say('#invite-status','');controls();};
 find('#invite-login').onclick=()=>find('#google-login').click();
 find('#family-members-open').onclick=()=>{if(!admin())return;find('#family-members-panel').hidden=false;void load();};
 find('#family-members-close').onclick=()=>{adminTicket++;adminBusy=false;clearLink();find('#family-members-panel').hidden=true;controls();find('#family-members-open').focus();};
 find('#family-members-refresh').onclick=()=>{if(!adminBusy)return load();};
 find('#family-invite-create').onclick=async()=>{
  if(!admin()||adminBusy)return;const e=epoch,t=++adminTicket;adminBusy=true;clearLink();controls();say('#family-members-status','Biztonságos meghívó létrehozása…');
  try{const data=await edge('create');if(e!==epoch||t!==adminTicket||!admin())return;
   if(!/^[a-f0-9]{64}$/.test(data.token||'')||data.invite?.status!=='active')throw Error('shape');
   lastLink=`https://sandorkov.github.io/csaladi-programok/#family-invite=${data.token}`;
   find('#family-invite-link').value=lastLink;find('#family-invite-result').hidden=false;
   await load();if(e===epoch&&admin())say('#family-members-status','A meghívó elkészült, 7 napig érvényes. Másold ki most a linket; később nem kérhető vissza.');
  }catch(error){if(e===epoch&&t===adminTicket&&admin())say('#family-members-status',detail(error),true);}
  finally{if(e===epoch&&t===adminTicket){adminBusy=false;controls();}}
 };
 find('#family-invite-copy').onclick=async()=>{
  if(!admin()||!lastLink)return;const value=lastLink,e=epoch;
  try{await navigator.clipboard.writeText(value);if(e===epoch&&value===lastLink)say('#family-members-status','Meghívólink a vágólapra másolva. Te oszthatod meg a családtaggal.');}
  catch{if(e===epoch&&value===lastLink){find('#family-invite-link').focus();find('#family-invite-link').select();say('#family-members-status','Az automatikus másolás nem engedélyezett. Másold ki a kijelölt linket (Ctrl+C vagy telefonon Másolás).');}}
 };
 window.familyMembers={setClient(next,onJoined){if(client!==next){epoch++;client=next;clearAdmin();}reload=onJoined||(()=>{});},
  setUser(next){if(next===userId)return;epoch++;inviteTicket++;userId=next;access=null;inviteBusy=false;result=null;clearAdmin();say('#invite-status','');controls();setTimeout(()=>{void checkInvite();},0);},
  setMembership(info){const next=info.state==='member'&&info.userId===userId?info:null;
   if(access?.family.id!==next?.family.id||access?.family.role!==next?.family.role){access=next;clearAdmin();}else access=next;controls();},checkInvite};
 controls();void checkInvite();
})();
