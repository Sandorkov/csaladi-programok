/* Családi mentés v1: szabványos ZIP STORE, CRC32 minden bejegyzéshez, SHA-256 minden fotóhoz.
   Nincs tömörítés, ZIP64, titkosítás vagy külső függőség. Böngészőben és Node-tesztben közös. */
((root)=>{
  'use strict';
  const limits={programs:100,images:500,imageBytes:8388608,totalBytes:200*1024*1024,archiveBytes:220*1024*1024,manifestBytes:2*1024*1024};
  const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
  const fail=message=>{throw Error(message);};
  const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
  function crc32(bytes){let n=0xffffffff;for(const b of bytes)n=crcTable[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
  async function sha256(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
  const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
  const str=(s,max)=>typeof s==='string'&&s.trim().length>0&&s.length<=max;
  const integer=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
  const date=s=>typeof s==='string'&&s.length<=40&&Number.isFinite(Date.parse(s));
  function keys(object,names){if(!object||Array.isArray(object)||typeof object!=='object'||Object.keys(object).sort().join(',')!==names.split(',').sort().join(','))fail('Hibás vagy ismeretlen mezőket tartalmazó mentés.');}
  function validateManifest(m){
    keys(m,'format,version,created_at,source_family,programs,images');
    if(m.format!=='csaladi-programok-family'||m.version!==1)fail('Nem támogatott családi mentésformátum vagy verzió. A helyi JSON-mentés külön állítható vissza.');
    if(!date(m.created_at))fail('Hibás mentési időpont.');
    keys(m.source_family,'id,name');if(!uuid(m.source_family.id)||!str(m.source_family.name,100))fail('Hibás forráscsalád-adat.');
    if(!Array.isArray(m.programs)||m.programs.length>limits.programs||!Array.isArray(m.images)||m.images.length>limits.images)fail('Túl sok program vagy kép a mentésben.');
    const programs=new Set(),images=new Set(),covers=new Set(),counts=new Map();let total=0;
    for(const p of m.programs){
      keys(p,'id,name,location,category,cost,description,favorite,version,gallery_version,created_at,updated_at');
      if(!uuid(p.id)||programs.has(p.id)||!str(p.name,100)||!str(p.location,150)||!str(p.description,1500)||!['Kirándulás','Bringázás','Családi program'].includes(p.category)||
        !integer(p.cost,0,100000000)||typeof p.favorite!=='boolean'||!integer(p.version,1,2147483646)||!integer(p.gallery_version,0,2147483646)||!date(p.created_at)||!date(p.updated_at))fail('Hibás programadat vagy ismétlődő azonosító.');
      programs.add(p.id);
    }
    for(const i of m.images){
      keys(i,'id,program_id,original_name,mime_type,byte_size,created_at,is_cover,cover_mode,cover_x,cover_y,cover_zoom,sha256,file');
      if(!uuid(i.id)||images.has(i.id)||!programs.has(i.program_id)||!str(i.original_name,180)||!['image/jpeg','image/png','image/webp','image/gif'].includes(i.mime_type)||
        !integer(i.byte_size,1,limits.imageBytes)||!date(i.created_at)||typeof i.is_cover!=='boolean'||!['crop','contain','free'].includes(i.cover_mode)||
        ![i.cover_x,i.cover_y].every(n=>Number.isFinite(n)&&n>=0&&n<=1)||!Number.isFinite(i.cover_zoom)||i.cover_zoom<(i.cover_mode==='free'?0:1)||i.cover_zoom>4||
        typeof i.sha256!=='string'||!/^[a-f0-9]{64}$/.test(i.sha256)||i.file!==`images/${i.id}`)fail('Hibás képadat, hivatkozás vagy borítóigazítás.');
      images.add(i.id);total+=i.byte_size;counts.set(i.program_id,(counts.get(i.program_id)||0)+1);
      if(counts.get(i.program_id)>20)fail('Programonként legfeljebb 20 kép lehet.');
      if(i.is_cover){if(covers.has(i.program_id))fail('Egy programnak több borítóképe van.');covers.add(i.program_id);}
    }
    if(total>limits.totalBytes)fail('A képek együttes mérete meghaladja a 200 MiB-os határt.');
    for(const id of counts.keys())if(!covers.has(id))fail('Egy képes programnak nincs borítóképe.');
    return {programs:m.programs.length,images:m.images.length,bytes:total};
  }
  function signature(bytes,mime){
    const starts=(...n)=>n.every((b,i)=>bytes[i]===b),ascii=(a,b)=>String.fromCharCode(...bytes.subarray(a,b));
    return mime==='image/jpeg'?starts(255,216,255):mime==='image/png'?starts(137,80,78,71,13,10,26,10):mime==='image/gif'?/^GIF8[79]a$/.test(ascii(0,6)):mime==='image/webp'&&starts(82,73,70,70)&&ascii(8,12)==='WEBP';
  }
  function makeZip(entries){
    const parts=[],central=[];let offset=0,centralSize=0;const names=new Set();
    for(const [name,bytes]of entries){
      if(names.has(name))fail('Ismétlődő archívumbejegyzés.');names.add(name);
      const n=encoder.encode(name),crc=crc32(bytes),local=new Uint8Array(30+n.length),v=new DataView(local.buffer);
      v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,crc,true);v.setUint32(18,bytes.length,true);v.setUint32(22,bytes.length,true);v.setUint16(26,n.length,true);local.set(n,30);
      const c=new Uint8Array(46+n.length),cv=new DataView(c.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint32(16,crc,true);cv.setUint32(20,bytes.length,true);cv.setUint32(24,bytes.length,true);cv.setUint16(28,n.length,true);cv.setUint32(42,offset,true);c.set(n,46);
      parts.push(local,bytes);central.push(c);offset+=local.length+bytes.length;centralSize+=c.length;
    }
    if(offset+centralSize+22>limits.archiveBytes||entries.length>limits.images+1)fail('Túl nagy családi archívum.');
    const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,entries.length,true);v.setUint16(10,entries.length,true);v.setUint32(12,centralSize,true);v.setUint32(16,offset,true);
    return new Blob([...parts,...central,end],{type:'application/zip'});
  }
  function readZip(bytes){
    if(bytes.length<22||bytes.length>limits.archiveBytes)fail('Hibás vagy túl nagy ZIP-fájl.');
    const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),end=bytes.length-22;
    if(v.getUint32(end,true)!==0x06054b50||v.getUint16(end+4,true)||v.getUint16(end+6,true)||v.getUint16(end+20,true))fail('Csak a saját ZIP STORE mentésünk támogatott, ZIP64 és komment nélkül.');
    const count=v.getUint16(end+10,true),centralSize=v.getUint32(end+12,true),centralStart=v.getUint32(end+16,true);
    if(count<1||count>limits.images+1||count!==v.getUint16(end+8,true)||centralStart+centralSize!==end)fail('Hibás ZIP-tartalomjegyzék.');
    let c=centralStart,offset=0;const result=new Map();
    for(let i=0;i<count;i++){
      if(c+46>end||v.getUint32(c,true)!==0x02014b50)fail('Hiányos ZIP-tartalomjegyzék.');
      const flags=v.getUint16(c+8,true),method=v.getUint16(c+10,true),crc=v.getUint32(c+16,true),size=v.getUint32(c+24,true),nl=v.getUint16(c+28,true);
      if(flags!==0x800||method!==0||v.getUint32(c+20,true)!==size||v.getUint16(c+30,true)||v.getUint16(c+32,true)||v.getUint16(c+34,true)||v.getUint32(c+38,true)||v.getUint32(c+42,true)!==offset||c+46+nl>end)fail('Nem támogatott vagy sérült ZIP-bejegyzés.');
      const name=decoder.decode(bytes.subarray(c+46,c+46+nl));
      if((name!=='manifest.json'&&!/^images\/[0-9a-f-]{36}$/.test(name))||result.has(name)||size>(name==='manifest.json'?limits.manifestBytes:limits.imageBytes))fail('Hibás archívumútvonal, méret vagy ismétlődő fájl.');
      if(offset+30+nl+size>centralStart||v.getUint32(offset,true)!==0x04034b50||v.getUint16(offset+6,true)!==flags||v.getUint16(offset+8,true)!==0||v.getUint32(offset+14,true)!==crc||v.getUint32(offset+18,true)!==size||v.getUint32(offset+22,true)!==size||v.getUint16(offset+26,true)!==nl||v.getUint16(offset+28,true)!==0||decoder.decode(bytes.subarray(offset+30,offset+30+nl))!==name)fail('Eltérő vagy sérült ZIP-fejléc.');
      const data=bytes.subarray(offset+30+nl,offset+30+nl+size);if(crc32(data)!==crc)fail(`Sérült fájl (CRC32): ${name}`);
      result.set(name,data);offset+=30+nl+size;c+=46+nl;
    }
    if(c!==end||offset!==centralStart||!result.has('manifest.json'))fail('Hiányos vagy idegen adatot tartalmazó ZIP.');
    return result;
  }
  async function validatePackage(bytes,onProgress=()=>{},decode=async()=>{}){
    const files=readZip(bytes);let manifest;
    try{manifest=JSON.parse(decoder.decode(files.get('manifest.json')));}catch{fail('Nem olvasható a családi mentés leírófájlja.');}
    const summary=validateManifest(manifest);
    if(files.size!==manifest.images.length+1)fail('Hiányzó vagy fölösleges képfájl a mentésben.');
    for(let n=0;n<manifest.images.length;n++){
      const image=manifest.images[n],data=files.get(image.file);onProgress(n+1,manifest.images.length,image.original_name);
      if(!data||data.length!==image.byte_size||!signature(data,image.mime_type)||await sha256(data)!==image.sha256)fail(`Hibás, hiányzó vagy sérült kép: ${image.original_name}`);
      await decode(data,image.mime_type);
    }
    return {manifest,files,summary};
  }
  root.FamilyArchive={limits,crc32,sha256,validateManifest,signature,makeZip,readZip,validatePackage,encode:obj=>encoder.encode(JSON.stringify(obj))};
})(globalThis);
