/* Relatív fókuszpont az eredeti képen. Nincs képfájl-átalakítás. */
window.familyCoverLayout=function(frameWidth,frameHeight,imageWidth,imageHeight,settings={}){
  if(![frameWidth,frameHeight,imageWidth,imageHeight].every(n=>Number.isFinite(n)&&n>0))return null;
  const contain=settings.cover_mode==='contain';
  const scale=(contain?Math.min:Math.max)(frameWidth/imageWidth,frameHeight/imageHeight)*(contain?1:settings.cover_zoom??1);
  const width=imageWidth*scale,height=imageHeight*scale;
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  return {width,height,left:contain?(frameWidth-width)/2:clamp(frameWidth/2-(settings.cover_x??0.5)*width,frameWidth-width,0),
    top:contain?(frameHeight-height)/2:clamp(frameHeight/2-(settings.cover_y??0.5)*height,frameHeight-height,0)};
};
