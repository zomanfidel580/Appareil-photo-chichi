'use strict';
const $=s=>document.querySelector(s);
const video=$('#v'),cv=$('#cv'),ctx=cv.getContext('2d'),hist=$('#hist').getContext('2d');
const AW=160;let AH=90;
const an=document.createElement('canvas'),actx=an.getContext('2d',{willReadFrequently:true});
const pk=document.createElement('canvas'),pkx=pk.getContext('2d');
const S={facing:'environment',stab:true,peak:false,fmt:'jpg',focus:'continuous'};
const FMTS=['jpg','png','raw'];
let stream=null,track=null,caps={};
let prev=new Uint8Array(0),cur=new Uint8Array(0),hasPrev=false,pkImg=null;
const D={x:0,y:0},SM={x:0,y:0};let off={x:0,y:0};
const MARGIN=0.05;let sharp=0,frameN=0,busy=false;

function toast(m,t=2200){const e=$('#toast');e.textContent=m;e.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('on'),t)}
async function apply(c){try{await track.applyConstraints({advanced:[c]});return true}catch(e){toast('Réglage non pris en charge');return false}}

/* ---------- Caméra ---------- */
async function start(){
  if(stream)stream.getTracks().forEach(t=>t.stop());
  try{
    stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:S.facing},width:{ideal:4096},height:{ideal:2160},frameRate:{ideal:30}}});
  }catch(e){toast('Caméra inaccessible : '+e.message,5000);return}
  track=stream.getVideoTracks()[0];video.srcObject=stream;await video.play().catch(()=>{});
  caps=track.getCapabilities?track.getCapabilities():{};
  hasPrev=false;D.x=D.y=SM.x=SM.y=0;
  document.querySelectorAll('[data-af]').forEach(b=>{const ok=(caps.focusMode||[]).includes(b.dataset.af);b.disabled=!ok});
  if((caps.focusMode||[]).includes('continuous')){S.focus='continuous';apply({focusMode:'continuous'})}
  syncAF();buildPro();
  const st=track.getSettings();$('#res').textContent=`${st.width}×${st.height}`;
  if(!caps.focusMode)toast('Autofocus matériel non exposé par ce navigateur');
}
function syncAF(){document.querySelectorAll('[data-af]').forEach(b=>b.classList.toggle('on',b.dataset.af===S.focus))}
document.querySelectorAll('[data-af]').forEach(b=>b.onclick=async()=>{
  S.focus=b.dataset.af;syncAF();await apply({focusMode:S.focus});
  if(S.focus==='manual'){$('#pro').classList.add('on');$('#tPro').classList.add('on')}
});

/* ---------- Réglages pro ---------- */
function slider(label,key,fmt,extra){
  const c=caps[key];if(!c||c.max===undefined)return;
  const st=track.getSettings(),row=document.createElement('div');row.className='row';
  const v=st[key]??c.min,step=c.step||(c.max-c.min)/100;
  row.innerHTML=`<label>${label}</label><input type="range" min="${c.min}" max="${c.max}" step="${step}" value="${v}"><output></output>`;
  const i=row.querySelector('input'),o=row.querySelector('output');
  const show=()=>o.textContent=fmt?fmt(+i.value):(+i.value).toFixed(step<1?1:0);show();
  i.oninput=()=>{show();const c2={[key]:+i.value,...(extra||{})};apply(c2);
    if(key==='focusDistance'){S.focus='manual';syncAF()}};
  $('#pro').appendChild(row);
}
function modeChip(label,key,autoVal,id){
  if(!(caps[key]||[]).includes(autoVal))return;
  const b=document.createElement('button');b.className='chip';b.textContent=label;b.style.marginRight='6px';
  b.onclick=()=>apply({[key]:autoVal});$('#pro').appendChild(b);
}
function buildPro(){
  const p=$('#pro');p.innerHTML='';
  modeChip('Expo auto','exposureMode','continuous');modeChip('Balance des blancs auto','whiteBalanceMode','continuous');
  slider('Zoom','zoom',v=>v.toFixed(1)+'×');
  slider('Exposition (EV)','exposureCompensation',v=>(v>0?'+':'')+v.toFixed(1));
  slider('ISO','iso',null,{exposureMode:'manual'});
  slider('Vitesse','exposureTime',v=>{const s=v*1e-4;return s>=0.5?s.toFixed(1)+'s':'1/'+Math.round(1/s)},{exposureMode:'manual'});
  slider('Température (K)','colorTemperature',null,{whiteBalanceMode:'manual'});
  slider('Mise au point','focusDistance',v=>v.toFixed(2)+'m',{focusMode:'manual'});
  if(!p.children.length)p.textContent='Aucun réglage manuel exposé par ce navigateur/appareil (Chrome Android recommandé).';
}
$('#tPro').onclick=e=>{const on=$('#pro').classList.toggle('on');e.target.classList.toggle('on',on)};
$('#tStab').onclick=e=>{S.stab=!S.stab;e.target.classList.toggle('on',S.stab);hasPrev=false;D.x=D.y=SM.x=SM.y=0;off={x:0,y:0}};
$('#tPeak').onclick=e=>{S.peak=!S.peak;e.target.classList.toggle('on',S.peak)};
$('#tGrid').onclick=e=>{const g=$('#grid');g.style.display=g.style.display==='none'?'':'none';e.target.classList.toggle('on')};
$('#flip').onclick=()=>{S.facing=S.facing==='environment'?'user':'environment';start()};
$('#fmt').onclick=e=>{S.fmt=FMTS[(FMTS.indexOf(S.fmt)+1)%3];e.target.textContent=S.fmt==='raw'?'RAW':S.fmt.toUpperCase();
  if(S.fmt==='raw')toast('RAW : image non traitée, non stabilisée, TIFF sans perte')};

/* ---------- Autofocus tactile ---------- */
$('#stage').addEventListener('click',async e=>{
  const r=cv.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;
  if(x<0||x>1||y<0||y>1)return;
  const ring=$('#ring'),sr=$('#stage').getBoundingClientRect();
  ring.style.left=e.clientX-sr.left+'px';ring.style.top=e.clientY-sr.top+'px';ring.classList.remove('on');void ring.offsetWidth;ring.classList.add('on');
  setTimeout(()=>ring.classList.remove('on'),1200);
  const f=caps.focusMode||[];if(!f.length){toast('Autofocus tactile indisponible ici');return}
  const c={pointsOfInterest:[{x,y}]};if(f.includes('single-shot'))c.focusMode='single-shot';
  await apply(c);
  if(S.focus==='continuous'&&f.includes('continuous'))setTimeout(()=>apply({focusMode:'continuous'}),2500);
});

/* ---------- Stabilisation numérique (estimation de mouvement + lissage) ---------- */
function motion(a,b){
  const R=8,step=2,W=2*R+1,x0=R,x1=AW-R,y0=R,y1=AH-R,g=new Float64Array(W*W);
  let best=Infinity,bu=0,bv=0;
  for(let v=-R;v<=R;v++)for(let u=-R;u<=R;u++){
    let s=0;for(let y=y0;y<y1;y+=step){const ro=y*AW,rp=(y+v)*AW+u;for(let x=x0;x<x1;x+=step)s+=Math.abs(b[ro+x]-a[rp+x])}
    g[(v+R)*W+u+R]=s;if(s<best){best=s;bu=u;bv=v}
  }
  const n=Math.ceil((x1-x0)/step)*Math.ceil((y1-y0)/step);if(best/n>35)return; // changement de scène : on ignore
  const sub=(m,c,p)=>{const d=m-2*c+p;return d>1e-6?(m-p)/(2*d):0};
  let u=bu,v=bv;
  if(Math.abs(bu)<R&&Math.abs(bv)<R){const c=g[(bv+R)*W+bu+R];
    u+=sub(g[(bv+R)*W+bu+R-1],c,g[(bv+R)*W+bu+R+1]);v+=sub(g[(bv+R-1)*W+bu+R],c,g[(bv+R+1)*W+bu+R]);}
  D.x-=u;D.y-=v;                       // trajectoire cumulée du contenu
  const a_=0.92;SM.x=SM.x*a_+D.x*(1-a_);SM.y=SM.y*a_+D.y*(1-a_);
  let ox=SM.x-D.x,oy=SM.y-D.y;const lx=MARGIN*AW,ly=MARGIN*AH;
  if(Math.abs(ox)>lx){ox=Math.sign(ox)*lx;D.x=SM.x-ox}
  if(Math.abs(oy)>ly){oy=Math.sign(oy)*ly;D.y=SM.y-oy}
  off.x=ox;off.y=oy;
}

/* ---------- Boucle de rendu ---------- */
function frame(){
  requestAnimationFrame(frame);
  if(!video.videoWidth||video.readyState<2)return;
  const vw=video.videoWidth,vh=video.videoHeight,pw=Math.min(vw,1280),ph=Math.round(pw*vh/vw);
  if(cv.width!==pw||cv.height!==ph){cv.width=pw;cv.height=ph;AH=Math.round(AW*vh/vw);an.width=pk.width=AW;an.height=pk.height=AH;
    prev=new Uint8Array(AW*AH);cur=new Uint8Array(AW*AH);pkImg=pkx.createImageData(AW,AH);hasPrev=false;D.x=D.y=SM.x=SM.y=0}
  actx.drawImage(video,0,0,AW,AH);const d=actx.getImageData(0,0,AW,AH).data;
  for(let i=0,j=0;j<cur.length;i+=4,j++)cur[j]=(d[i]*77+d[i+1]*150+d[i+2]*29)>>8;
  if(S.stab&&hasPrev)motion(prev,cur);else if(!S.stab)off={x:0,y:0};
  // netteté (variance du laplacien) + peaking
  let sum=0,sq=0,cnt=0;const px=pkImg.data;
  for(let y=1;y<AH-1;y++)for(let x=1;x<AW-1;x++){const i=y*AW+x,l=4*cur[i]-cur[i-1]-cur[i+1]-cur[i-AW]-cur[i+AW];
    sum+=l;sq+=l*l;cnt++;
    if(S.peak){const o=i*4,hit=Math.abs(l)>45;px[o]=255;px[o+1]=40;px[o+2]=40;px[o+3]=hit?220:0}}
  const vr=sq/cnt-(sum/cnt)**2;sharp=sharp*0.7+vr*0.3;
  const q=Math.min(1,Math.log10(1+sharp)/3);const bar=$('#sharpbar');bar.style.width=(q*100)+'%';bar.style.background=q>0.66?'#4cd964':q>0.33?'#ffb300':'#ff3b30';
  if(S.peak)pkx.putImageData(pkImg,0,0);
  if(++frameN%6===0)drawHist(cur);
  // dessin
  const k=pw/AW,z=S.stab?1+2*MARGIN:1;
  ctx.save();ctx.translate(pw/2+off.x*k,ph/2+off.y*k);ctx.scale(z,z);
  ctx.drawImage(video,-pw/2,-ph/2,pw,ph);if(S.peak)ctx.drawImage(pk,-pw/2,-ph/2,pw,ph);ctx.restore();
  const t=prev;prev=cur;cur=t;hasPrev=true;
}
function drawHist(g){
  const b=new Uint32Array(48);for(let i=0;i<g.length;i+=3)b[g[i]*48>>8]++;
  const m=Math.max(...b),w=96/48;hist.clearRect(0,0,96,40);hist.fillStyle='#fffc';
  for(let i=0;i<48;i++){const h=b[i]/m*38;hist.fillRect(i*w,40-h,w-0.5,h)}
}

/* ---------- Capture ---------- */
function encodeTIFF(img){ // TIFF RGB 8 bits non compressé (baseline)
  const w=img.width,h=img.height,n=w*h*3,pix=140,buf=new ArrayBuffer(pix+n),dv=new DataView(buf),u8=new Uint8Array(buf);
  dv.setUint16(0,0x4949,true);dv.setUint16(2,42,true);dv.setUint32(4,8,true);
  const E=[[256,4,w],[257,4,h],[258,3,134],[259,3,1],[262,3,2],[273,4,pix],[277,3,3],[278,4,h],[279,4,n],[284,3,1]];
  dv.setUint16(8,E.length,true);
  E.forEach((e,i)=>{const o=10+i*12;dv.setUint16(o,e[0],true);dv.setUint16(o+2,e[1],true);dv.setUint32(o+4,e[0]===258?3:1,true);
    if(e[1]===3&&e[0]!==258)dv.setUint16(o+8,e[2],true);else dv.setUint32(o+8,e[2],true)});
  dv.setUint32(130,0,true);dv.setUint16(134,8,true);dv.setUint16(136,8,true);dv.setUint16(138,8,true);
  const s=img.data;let o=pix;for(let i=0;i<s.length;i+=4){u8[o++]=s[i];u8[o++]=s[i+1];u8[o++]=s[i+2]}
  return new Blob([buf],{type:'image/tiff'});
}
const stamp=()=>new Date().toISOString().replace(/[-:T]/g,'').slice(0,14);
async function save(blob,name){
  const f=new File([blob],name,{type:blob.type});
  if(blob.type!=='image/tiff'&&navigator.canShare&&navigator.canShare({files:[f]})){
    try{await navigator.share({files:[f]});return}catch(e){if(e.name==='AbortError')return}}
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);
}
async function capture(){
  if(busy||!video.videoWidth)return;busy=true;$('#shutter').disabled=true;
  const fl=$('#flash');fl.style.transition='none';fl.style.opacity=.7;requestAnimationFrame(()=>{fl.style.transition='opacity .25s';fl.style.opacity=0});
  try{
    const vw=video.videoWidth,vh=video.videoHeight;let blob,name='IMG_'+stamp();
    if(S.fmt==='jpg'&&!S.stab&&'ImageCapture' in window){
      try{blob=await new ImageCapture(track).takePhoto()}catch(e){blob=null}   // pleine résolution capteur
    }
    if(!blob){
      const c=document.createElement('canvas');c.width=vw;c.height=vh;const x=c.getContext('2d',{willReadFrequently:S.fmt==='raw'});
      if(S.fmt==='raw'||!S.stab)x.drawImage(video,0,0);   // RAW : aucune correction ni recadrage
      else{const k=vw/AW,z=1+2*MARGIN;x.translate(vw/2+off.x*k,vh/2+off.y*k);x.scale(z,z);x.drawImage(video,-vw/2,-vh/2,vw,vh)}
      if(S.fmt==='raw'){blob=encodeTIFF(x.getImageData(0,0,vw,vh));name+='_RAW.tiff'}
      else if(S.fmt==='png'){blob=await new Promise(r=>c.toBlob(r,'image/png'));name+='.png'}
      else{blob=await new Promise(r=>c.toBlob(r,'image/jpeg',0.95));name+='.jpg'}
    }else name+='.jpg';
    const t=document.createElement('canvas');t.width=100;t.height=Math.round(100*vh/vw);t.getContext('2d').drawImage(video,0,0,t.width,t.height);
    $('#thumb').style.backgroundImage=`url(${t.toDataURL()})`;
    await save(blob,name);toast(`Enregistré · ${(blob.size/1048576).toFixed(1)} Mo`);
  }catch(e){toast('Échec de la capture : '+e.message,4000)}
  busy=false;$('#shutter').disabled=false;
}
$('#shutter').onclick=capture;
document.addEventListener('keydown',e=>{if(e.code==='Space'||e.key==='AudioVolumeUp'){e.preventDefault();capture()}});

if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
start();requestAnimationFrame(frame);
