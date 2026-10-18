/* Az oldal elején, szinkron módon fut. Nincs hálózati hívás vagy naplózás. */
(()=>{
 'use strict';
 const key='csaladi-programok.pending-invite';let token=null,persisted=false,invalid=false;
 function capture(){
  const url=new URL(location.href),params=new URLSearchParams(url.hash.slice(1));
  if(params.has('family-invite')){
   const value=params.get('family-invite');token=params.getAll('family-invite').length===1&&/^[a-f0-9]{64}$/.test(value||'')?value:null;invalid=!token;
   // A teljes meghívófragmentumot eltávolítjuk; nem irányítunk át, nem továbbítjuk.
   url.hash='';try{history.replaceState(history.state,'',url.href);}catch{/* Az URL-fragmentum HTTP-ben akkor sem továbbítódik. */}
   try{sessionStorage.removeItem(key);if(token){sessionStorage.setItem(key,token);persisted=sessionStorage.getItem(key)===token;}}catch{persisted=false;}
  }else if(!token){
   try{const saved=sessionStorage.getItem(key);if(/^[a-f0-9]{64}$/.test(saved||'')){token=saved;persisted=true;}else sessionStorage.removeItem(key);}catch{/* Fülen belüli memória továbbra is használható. */}
  }
 }
 function clear(){token=null;invalid=false;persisted=false;try{sessionStorage.removeItem(key);}catch{/* Tiltott tárhely. */}}
 function canLeave(){
  if(!token)return true;
  try{sessionStorage.setItem(key,token);persisted=sessionStorage.getItem(key)===token;}catch{persisted=false;}
  return persisted;
 }
 capture();
 window.FamilyInviteLink={get:()=>token,invalid:()=>invalid,canLeave,clear};
 window.addEventListener('hashchange',()=>{capture();window.familyMembers?.checkInvite();});
})();
