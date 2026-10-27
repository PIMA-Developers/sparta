(function(){
const root = document.querySelector("[data-tapmk]"); if(!root || root.dataset.ready) return; root.dataset.ready="1";
const portal = document.createElement("div"); portal.className = root.className + " tapmk-portal"; portal.removeAttribute("data-tapmk");
document.body.appendChild(portal); root.querySelectorAll(".sheet,.toast").forEach(el=>portal.appendChild(el));

/* ================== CONFIG ================== */
// Número do WhatsApp da Tap com DDI e DDD, só dígitos (ex.: "5521999999999"). Vazio = o cliente escolhe o contato.
let TAP_WHATSAPP = "5521995888183";
// Nome do kimono fornecido pela Tap (mostrado na ferramenta, no resumo e no WhatsApp)
let KIMONO_NOME = "Kimono Xtralite 2.0";
// Modo loja (Shopify): produtos, variantes e preços vêm da seção do tema. Sem isso, a ferramenta só gera o mockup e manda no WhatsApp.
let SHOP = null;
// Upload dos arquivos (Cloudinary, upload não assinado): {cloud, preset, folder}. Sem isso, o pedido vai sem os links.
let UPLOAD = null;
const BASES = {"branco_front": {"w": 708, "h": 1548, "uri": ""}, "branco_back": {"w": 709, "h": 1584, "uri": ""}, "azul_front": {"w": 708, "h": 1548, "uri": ""}, "azul_back": {"w": 709, "h": 1584, "uri": ""}, "preto_front": {"w": 708, "h": 1548, "uri": ""}, "preto_back": {"w": 709, "h": 1584, "uri": ""}};
const LIB = [{"key": "sprt_wordmark", "label": "SPRT", "mode": "mono", "team": "Sparta SPRT", "tags": "sparta escola de artes marciais martial arts", "uri": ""}, {"key": "sprt_martial", "label": "SPRT Martial Arts", "mode": "mono", "team": "Sparta SPRT", "tags": "sparta escola de artes marciais martial arts", "uri": ""}, {"key": "sprt_escola", "label": "SPRT Escola de Artes Marciais", "mode": "mono", "team": "Sparta SPRT", "tags": "sparta escola de artes marciais martial arts", "uri": ""}, {"key": "sprt_badge", "label": "SPRT – escudo redondo", "mode": "mono", "team": "Sparta SPRT", "tags": "sparta escola de artes marciais martial arts", "uri": ""}, {"key": "sprt_helmet", "label": "SPRT – capacete", "mode": "mono", "team": "Sparta SPRT", "tags": "sparta escola de artes marciais martial arts", "uri": ""}, {"key": "thierry_reis", "label": "Thierry Reis", "mode": "rgba", "team": "Thierry Reis", "tags": "thierry reis tr", "uri": ""}, {"key": "thierry_tr", "label": "Thierry Reis – monograma", "mode": "rgba", "team": "Thierry Reis", "tags": "thierry reis tr", "uri": ""}];

// Tabela Tap (criação da arte + estampa, sem kimono). O nome nas costas está incluso em todas as faixas.
// Preços por kimono: [1 kimono, 2+ kimonos com a mesma arte]. Na loja, tudo vem das variantes dos produtos.
const PRECOS = {
  faixas: {
    basico:        {label:"Básico",        preco:[180,null], logos:1, adic:1},
    intermediario: {label:"Intermediário", preco:[250,null], logos:3, adic:2},
    completo:      {label:"Completo",      preco:[350,null], logos:6, adic:6}
  },
  adicional: {"1":[70,null], "2+":[45,null]},  // avulso, além do que a faixa inclui: 1 unidade / 2 ou mais (cada)
  desconto: 10,                                // % para 2+ kimonos com a mesma arte (faixa e adicionais; não vale no kimono nem no prazo)
  kimono: {adulto:550, infantil:390},
  prazo: {padrao:0, expresso:40, turbo:140},
  expressoGratisAcima: 850   // pedidos a partir deste valor (kimono + personalização) ganham o Expresso; 0 = desligado
};
const FAIXAS = ["basico","intermediario","completo"];
// Preço "2+ kimonos" que não veio da loja = preço de 1 kimono menos o desconto
function completaDesconto(){
  const d=r=>Math.round(r*(100-PRECOS.desconto))/100;
  for(const id of FAIXAS){ const f=PRECOS.faixas[id]; if(f && f.preco[0]!=null && f.preco[1]==null) f.preco[1]=d(f.preco[0]); }
  for(const k of ["1","2+"]){ const a=PRECOS.adicional[k]; if(a[0]!=null && a[1]==null) a[1]=d(a[0]); }
}
const PRAZOS = {padrao:"Padrão (até 14 dias úteis)", expresso:"Expresso (até 7 dias úteis)", turbo:"Turbo (até 48 horas)"};

// Configuração vinda da seção da Shopify: imagens, preços, produtos e upload
try{
  const C = JSON.parse(root.querySelector("script[data-tapmk-config]").textContent);
  if(C.whatsapp) TAP_WHATSAPP = String(C.whatsapp).replace(/\D/g,"");
  if(C.kimonoNome) KIMONO_NOME = String(C.kimonoNome);
  if(typeof C.expressoGratisAcima==="number" && isFinite(C.expressoGratisAcima)) PRECOS.expressoGratisAcima = C.expressoGratisAcima;
  if(C.bases) for(const k in C.bases) if(BASES[k]) BASES[k].uri=C.bases[k];
  if(C.lib) LIB.forEach(l=>{ if(C.lib[l.key]) l.uri=C.lib[l.key]; });
  if(C.shop) SHOP=C.shop;
  if(C.upload && C.upload.cloud && C.upload.preset) UPLOAD=C.upload;
  const num=v=>typeof v==="number" && isFinite(v);
  if(C.regras) for(const id in C.regras){ const f=PRECOS.faixas[id], r=C.regras[id]; if(!f) continue; if(num(r.logos)) f.logos=r.logos; if(num(r.adic)) f.adic=r.adic; }
  if(C.precos){ const P=C.precos;
    for(const id in (P.faixas||{})) if(PRECOS.faixas[id] && num(P.faixas[id])) PRECOS.faixas[id].preco=[P.faixas[id],null];
    if(P.adicional && P.adicional.every(num)){ PRECOS.adicional["1"]=[P.adicional[0],null]; PRECOS.adicional["2+"]=[P.adicional[1],null]; }
    if(num(P.desconto)) PRECOS.desconto=P.desconto;
    for(const k of ["adulto","infantil"]) if(num(P.kimono?.[k])) PRECOS.kimono[k]=P.kimono[k];
    for(const k of ["expresso","turbo"]) if(num(P.prazo?.[k])) PRECOS.prazo[k]=P.prazo[k];
  }
}catch(e){}
const W = 2400;
const PLACE = { front:{x:450,y:420}, back:{x:1250,y:421} };
const VIEWS = { todo:[330,330,1740], frente:[257,390,1100], costas:[1051,390,1100], export:[0,0,2400] };
const COLORS = {
  branco:{label:"Branco", ink:"#141414"},
  azul:{label:"Azul", ink:"#ffffff"},
  preto:{label:"Preto", ink:"#ffffff"}
};
// Posições: centro (x,y), caixa padrão (bw,bh) e rotação, em pixels do mockup 2400×2400.
const SLOTS = [
  {id:"peito_esq",  side:"front", label:"Peito esquerdo",              x:933, y:650,  bw:110, bh:110, rot:0},
  {id:"lapela",     side:"front", label:"Lapela (vertical)",           x:889, y:642,  bw:150, bh:46,  rot:-75},
  {id:"peito_dir",  side:"front", label:"Peito direito",               x:681, y:650,  bw:110, bh:110, rot:0},
  {id:"manga_esq",  side:"front", label:"Manga esquerda (abaixo do ombro)", x:1072,y:695, bw:80, bh:90, rot:-4},
  {id:"manga_dir",  side:"front", label:"Manga direita (abaixo do ombro)",  x:540, y:695, bw:80, bh:90, rot:4},
  {id:"calca_esq",  side:"front", label:"Calça frente · perna esquerda",x:936,y:1390, bw:120, bh:110, rot:0},
  {id:"calca_dir",  side:"front", label:"Calça frente · perna direita", x:670,y:1390, bw:120, bh:110, rot:0},
  {id:"costas_nome",side:"back",  label:"Costas · nome no topo",       x:1604,y:555,  bw:320, bh:52,  rot:0},
  {id:"costas_centro",side:"back",label:"Costas · centro",             x:1604,y:672,  bw:330, bh:150, rot:0},
  {id:"costas_grande",side:"back",label:"Costas · arte grande",        x:1604,y:690,  bw:300, bh:300, rot:0},
  {id:"costas_barra",side:"back", label:"Costas · barra do casaco",    x:1604,y:1155, bw:260, bh:44,  rot:0},
  {id:"calca_tras_esq",side:"back",label:"Calça atrás · perna esquerda",x:1469,y:1400,bw:120, bh:110, rot:0},
  {id:"calca_tras_dir",side:"back",label:"Calça atrás · perna direita", x:1737,y:1400,bw:120, bh:110, rot:0}
];
const SLOT = Object.fromEntries(SLOTS.map(s=>[s.id,s]));
const FONTS = [
  {id:"montserrat", label:"Montserrat", css:'700 {s}px "Montserrat", Arial, sans-serif', track:.04},
  {id:"barlow", label:"Barlow (estilo DIN)", css:'700 {s}px "Barlow", Arial, sans-serif', track:.03},
  {id:"barlowc", label:"Barlow Condensed", css:'600 {s}px "Barlow Condensed", "Arial Narrow", sans-serif', track:.03},
  {id:"bebas", label:"Bebas Neue", css:'400 {s}px "Bebas Neue", "Arial Narrow", sans-serif', track:.04},
  {id:"oswald", label:"Oswald", css:'600 {s}px "Oswald", "Arial Narrow", sans-serif', track:.02},
  {id:"graduate", label:"Graduate (colegial)", css:'400 {s}px "Graduate", Georgia, serif', track:.02},
  {id:"marker", label:"Permanent Marker", css:'400 {s}px "Permanent Marker", "Comic Sans MS", cursive', track:0}
];
const INKS = [
  {c:"#ffffff", n:"Branco"},{c:"#141414", n:"Preto"},{c:"#8b8f98", n:"Cinza"},
  {c:"#c9a23a", n:"Dourado"},{c:"#c8202b", n:"Vermelho"},{c:"#2424b4", n:"Azul"}
];

/* ================== STATE ================== */
const state = { color:"branco", view:"todo", tipo:"brazil", tamanho:"", qtd:1, modo:"um", pessoas:[], prazo:"padrao", dados:{nome:"",zap:"",equipe:"",obs:""}, items:[], sel:null, example:false };
let uid = 1;
const $ = s => root.querySelector(s) || portal.querySelector(s);
const $$ = s => [...root.querySelectorAll(s), ...portal.querySelectorAll(s)];
const mk = (w,h) => { const c=document.createElement("canvas"); c.width=Math.max(1,Math.round(w)); c.height=Math.max(1,Math.round(h)); return c; };
const esc = s => String(s).replace(/[&<>"']/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));

/* ================== BASES ================== */
const baseImg = {};
function loadImg(src){ return new Promise((res,rej)=>{ const i=new Image(); if(/^(https?:)?\/\//.test(src)) i.crossOrigin="anonymous"; i.onload=()=>res(i); i.onerror=rej; i.src=src; }); }
// Carrega só as fotos da cor pedida (frente e costas); as outras cores vêm quando o cliente troca.
const basePending = {};
function ensureColor(color){
  return basePending[color] ||= Promise.all(["front","back"].map(async s=>{ const k=color+"_"+s; baseImg[k]=await loadImg(BASES[k].uri); }))
    .catch(e=>{ delete basePending[color]; throw e; });
}
function drawBases(ctx,color){
  const f=baseImg[color+"_front"], b=baseImg[color+"_back"];
  if(f) ctx.drawImage(f,PLACE.front.x,PLACE.front.y,BASES[color+"_front"].w,BASES[color+"_front"].h);
  if(b) ctx.drawImage(b,PLACE.back.x,PLACE.back.y,BASES[color+"_back"].w,BASES[color+"_back"].h);
}
// Sombreamento do tecido (dobras), usado para a arte parecer impressa no kimono. Meia resolução.
const shadeCache = {};
function shadeFor(color){
  if(shadeCache[color]) return shadeCache[color];
  const S=1200, c=mk(S,S), x=c.getContext("2d",{willReadFrequently:true});
  x.scale(S/W,S/W); drawBases(x,color);
  const id=x.getImageData(0,0,S,S), d=id.data, hist=new Uint32Array(256); let n=0;
  for(let i=0;i<d.length;i+=8){ if(d[i+3]>200){ hist[(d[i]*.3+d[i+1]*.59+d[i+2]*.11)|0]++; n++; } }
  let acc=0, ref=255; for(let v=0;v<256;v++){ acc+=hist[v]; if(acc>=n*.9){ ref=Math.max(v,1); break; } }
  const k = color==="branco" ? .55 : .32;
  for(let i=0;i<d.length;i+=4){ if(!d[i+3]) continue; const L=d[i]*.3+d[i+1]*.59+d[i+2]*.11; const s=1-k*(1-Math.min(1,L/ref)); d[i]=d[i+1]=d[i+2]=s*255; }
  x.putImageData(id,0,0);
  return shadeCache[color]=c;
}

/* ================== IMAGE PROCESSING ================== */
const lum = (r,g,b)=> r*.299+g*.587+b*.114;
function fitCanvas(src,max){
  const sw=src.naturalWidth||src.width, sh=src.naturalHeight||src.height;
  const s=Math.min(1,max/Math.max(sw,sh)); const c=mk(sw*s,sh*s);
  c.getContext("2d").drawImage(src,0,0,c.width,c.height); return c;
}
function analyze(c){
  const x=c.getContext("2d",{willReadFrequently:true}), {width:w,height:h}=c, d=x.getImageData(0,0,w,h).data;
  let transp=0, tot=0; const br=[], bg=[], bb=[];
  const step=Math.max(1,Math.floor((w+h)/400));
  const edge=(px,py)=>{ const i=(py*w+px)*4; tot++; if(d[i+3]<200) transp++; else { br.push(d[i]); bg.push(d[i+1]); bb.push(d[i+2]); } };
  for(let px=0;px<w;px+=step){ edge(px,0); edge(px,h-1); }
  for(let py=0;py<h;py+=step){ edge(0,py); edge(w-1,py); }
  const med=a=>{ if(!a.length) return 255; a.sort((p,q)=>p-q); return a[a.length>>1]; };
  const hasAlpha = transp/tot>.5;
  const bgc=[med(br),med(bg),med(bb)];
  // saturação média da tinta (pixels diferentes do fundo)
  let satSum=0, inkN=0, inkL=0;
  for(let i=0;i<d.length;i+=16){
    const a=d[i+3]; if(a<128) continue;
    const r=d[i],g=d[i+1],b=d[i+2];
    if(!hasAlpha && Math.abs(r-bgc[0])+Math.abs(g-bgc[1])+Math.abs(b-bgc[2])<60) continue;
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b); satSum+= mx? (mx-mn)/mx : 0; inkL+=lum(r,g,b); inkN++;
  }
  const sat = inkN? satSum/inkN : 0;
  return { hasAlpha, bg:bgc, mono: inkN>0 && sat<.16, inkDark: inkN? inkL/inkN<128 : true };
}
function trim(c,pad=4){
  const x=c.getContext("2d",{willReadFrequently:true}), {width:w,height:h}=c, d=x.getImageData(0,0,w,h).data;
  let x0=w,y0=h,x1=-1,y1=-1;
  for(let y=0;y<h;y++) for(let xx=0;xx<w;xx++){ if(d[(y*w+xx)*4+3]>10){ if(xx<x0)x0=xx; if(xx>x1)x1=xx; if(y<y0)y0=y; if(y>y1)y1=y; } }
  if(x1<0) return c;
  x0=Math.max(0,x0-pad); y0=Math.max(0,y0-pad); x1=Math.min(w-1,x1+pad); y1=Math.min(h-1,y1+pad);
  const o=mk(x1-x0+1,y1-y0+1); o.getContext("2d").drawImage(c,x0,y0,o.width,o.height,0,0,o.width,o.height); return o;
}
function procSemFundo(src,info){
  const w=src.width,h=src.height, o=mk(w,h), x=o.getContext("2d",{willReadFrequently:true});
  x.drawImage(src,0,0); if(info.hasAlpha) return trim(o);
  const id=x.getImageData(0,0,w,h), d=id.data, [R,G,B]=info.bg, tol=58;
  const dist=i=> Math.abs(d[i]-R)+Math.abs(d[i+1]-G)+Math.abs(d[i+2]-B);
  const seen=new Uint8Array(w*h), st=[];
  const push=p=>{ if(!seen[p] && dist(p*4)<tol){ seen[p]=1; st.push(p); } };
  for(let i=0;i<w;i++){ push(i); push((h-1)*w+i); } for(let j=0;j<h;j++){ push(j*w); push(j*w+w-1); }
  while(st.length){ const p=st.pop(), px=p%w, py=(p/w)|0;
    if(px>0)push(p-1); if(px<w-1)push(p+1); if(py>0)push(p-w); if(py<h-1)push(p+w); }
  for(let p=0;p<w*h;p++){ if(seen[p]) d[p*4+3]=0; }
  // borda suave: pixels vizinhos do fundo ficam semi-transparentes
  for(let p=0;p<w*h;p++){ if(seen[p]) continue; const px=p%w, py=(p/w)|0;
    if((px>0&&seen[p-1])||(px<w-1&&seen[p+1])||(py>0&&seen[p-w])||(py<h-1&&seen[p+w])){
      const t=Math.min(1,dist(p*4)/(tol*2.2)); d[p*4+3]=Math.round(d[p*4+3]*t); } }
  x.putImageData(id,0,0); return trim(o);
}
function procUmaCor(src,info,hex){
  const w=src.width,h=src.height, o=mk(w,h), x=o.getContext("2d",{willReadFrequently:true});
  x.drawImage(src,0,0);
  const id=x.getImageData(0,0,w,h), d=id.data, n=w*h, dv=new Float32Array(n);
  const bgL = info.hasAlpha ? (info.inkDark?255:0) : lum(...info.bg);
  const hist=new Uint32Array(101);
  for(let p=0;p<n;p++){ const i=p*4, a=d[i+3]/255; const L=lum(d[i],d[i+1],d[i+2])*a + bgL*(1-a);
    const v=Math.abs(L-bgL)/255; dv[p]=v; hist[Math.min(100,(v*100)|0)]++; }
  // referência = percentil 98 do contraste (logos apagados ficam com cor cheia)
  let acc=0, ref=1; const lim=n*.98; for(let v=0;v<=100;v++){ acc+=hist[v]; if(acc>=lim){ ref=Math.max(.25,v/100); break; } }
  const lo=.07, hi=ref*.8, r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  for(let p=0;p<n;p++){ const i=p*4; const a=Math.max(0,Math.min(1,(dv[p]-lo)/(hi-lo)));
    d[i]=r; d[i+1]=g; d[i+2]=b; d[i+3]=a*255; }
  x.putImageData(id,0,0); return trim(o);
}
function tintSilhouette(src,hex){ const o=mk(src.width,src.height), x=o.getContext("2d"); x.drawImage(src,0,0); x.globalCompositeOperation="source-in"; x.fillStyle=hex; x.fillRect(0,0,o.width,o.height); return o; }

/* ================== TEXT ================== */
function textBitmap(it){
  const f=FONTS.find(f=>f.id===it.font)||FONTS[0], s=200, txt=(it.text||" ").trim()||" ";
  const m=mk(10,10).getContext("2d"); m.font=f.css.replace("{s}",s);
  const tr=f.track*s, chars=[...txt];
  const widths=chars.map(ch=>m.measureText(ch).width);
  const tw=widths.reduce((a,b)=>a+b,0)+tr*Math.max(0,chars.length-1);
  const padX=it.style==="tarja"? s*.42 : s*.08, lineH=s*1.18;
  const lineGap=s*.16, lineT=Math.max(6,s*.075);
  const H = it.style==="linha" ? lineH+lineGap+lineT : it.style==="tarja" ? s*1.42 : lineH;
  const c=mk(tw+padX*2,H), x=c.getContext("2d");
  x.font=f.css.replace("{s}",s); x.textBaseline="middle"; x.fillStyle=it.ink;
  const drawTxt=(cy)=>{ let cx=padX; chars.forEach((ch,i)=>{ x.fillText(ch,cx,cy); cx+=widths[i]+tr; }); };
  if(it.style==="tarja"){ x.fillRect(0,0,c.width,c.height); x.globalCompositeOperation="destination-out"; drawTxt(H/2+s*.04); }
  else if(it.style==="linha"){ drawTxt(lineH/2+s*.04); x.fillRect(padX,lineH+lineGap,tw,lineT); }
  else drawTxt(H/2+s*.04);
  return c;
}

/* ================== ITEMS ================== */
function inkFor(it){ return it.autoInk ? COLORS[state.color].ink : it.ink; }
// Equipe: um texto marcado como "nome de cada pessoa" mostra no mockup o nome da primeira pessoa da lista.
const isEquipe = () => state.modo==="equipe";
function perPersonOn(it){ return it.kind==="text" && it.perPerson && isEquipe(); }
// nomeOverride: nome da pessoa usado ao gerar o mockup de cada kimono da equipe
let nomeOverride=null;
function textOf(it){
  if(!perPersonOn(it)) return it.text;
  if(nomeOverride!=null) return nomeOverride.trim() || it.text;
  return (state.pessoas.find(p=>p.nome.trim())||{}).nome || it.text;
}
const temNomePorPessoa = () => isEquipe() && state.items.some(perPersonOn);
function bitmap(it){
  const ink=inkFor(it), text=it.kind==="text" ? textOf(it) : "";
  const key = it.kind==="text" ? [text,it.font,it.style,ink].join("|") : [it.mode,ink].join("|");
  if(it._bm && it._key===key) return it._bm;
  if(it.kind==="text"){ it.ink=ink; it._bm=textBitmap({...it,text,ink}); }
  else {
    if(!it._src) return null;
    if(it.mode==="umacor") it._bm=procUmaCor(it._src,it._info,ink);
    else if(it.mode==="semfundo") it._bm=procSemFundo(it._src,it._info);
    else it._bm= it._info.hasAlpha ? trim(it._src) : it._src;
  }
  it._key=key; return it._bm;
}
function fitToSlot(it,slotId,keepScale){
  const s=SLOT[slotId]; const bm=bitmap(it); if(!bm) return;
  const ar=bm.width/bm.height; const w0=Math.min(s.bw, s.bh*ar);
  it.slot=slotId; it.x=s.x; it.y=s.y; it.rot=s.rot; it.base=w0; it.w=w0*(keepScale? it.scale : (it.scale=1));
}
function itemSide(it){ return it.x>1200 ? "back" : "front"; }
function nextSlot(kind){
  const used=new Set(state.items.map(i=>i.slot));
  const order = kind==="text" ? ["costas_nome","costas_barra","peito_dir","calca_esq"] : ["costas_centro","peito_esq","manga_esq","manga_dir","calca_esq","costas_barra"];
  return order.find(s=>!used.has(s)) || order[0];
}
function addItem(it,slot){
  it.id=uid++; it.scale=1; state.items.push(it);
  fitToSlot(it, slot||nextSlot(it.kind));
  state.sel=it.id; state.example=false;
  if(window.innerWidth<860) setView(itemSide(it)==="back"?"costas":"frente");
  renderList(); dirty(); save();
}
function addText(text){
  addItem({kind:"text", text:text||"SEU NOME", font:"montserrat", style:"simples", ink:COLORS[state.color].ink, autoInk:true});
}
async function addImageFromCanvas(c,meta){
  const src=fitCanvas(c,1600), info=analyze(src);
  const mode = meta.mode || (info.mono ? "umacor" : (info.hasAlpha ? "original" : "semfundo"));
  addItem({kind:"img", name:meta.name, mode, ink:COLORS[state.color].ink, autoInk:true, _src:src, _info:info,
           lowres: !meta.vector && Math.max(meta.w,meta.h)<900, vector:!!meta.vector, lib:meta.lib||null, file:meta.file||null}, meta.slot);
}

/* ================== RENDER ================== */
const cv=$("#cv"), ctx=cv.getContext("2d");
let artA=null, artB=null;
function layers(size){
  if(!artA || artA.width!==size){ artA=mk(size,size); artB=mk(size,size); }
  return [artA,artB];
}
function compose(c, size, viewKey, withUi){
  const g=c.getContext("2d"), [vx,vy,vw]=VIEWS[viewKey], s=size/vw;
  const T=[s,0,0,s,-vx*s,-vy*s];
  g.setTransform(1,0,0,1,0,0); g.globalCompositeOperation="source-over"; g.fillStyle="#fff"; g.fillRect(0,0,size,size);
  g.setTransform(...T); drawBases(g,state.color);
  const [A,B]= withUi ? layers(size) : [mk(size,size),mk(size,size)];
  const a=A.getContext("2d"), b=B.getContext("2d"), shade=shadeFor(state.color);
  a.setTransform(1,0,0,1,0,0); a.globalCompositeOperation="source-over"; a.clearRect(0,0,size,size);
  a.setTransform(...T);
  for(const it of state.items){ const bm=bitmap(it); if(!bm) continue; const h=it.w*bm.height/bm.width;
    a.save(); a.translate(it.x,it.y); a.rotate(it.rot*Math.PI/180); a.drawImage(bm,-it.w/2,-h/2,it.w,h); a.restore(); }
  b.setTransform(1,0,0,1,0,0); b.globalCompositeOperation="copy"; b.drawImage(A,0,0);
  a.globalCompositeOperation="multiply"; a.drawImage(shade,0,0,W,W);
  a.setTransform(1,0,0,1,0,0); a.globalCompositeOperation="destination-in"; a.drawImage(B,0,0);
  a.setTransform(...T); a.drawImage(shade,0,0,W,W);
  a.setTransform(1,0,0,1,0,0); a.globalCompositeOperation="source-over";
  g.setTransform(1,0,0,1,0,0); g.drawImage(A,0,0);
  if(withUi){ const it=state.items.find(i=>i.id===state.sel); if(it) drawSelection(g,it,T,s); }
  return T;
}
function corners(it){
  const bm=bitmap(it); if(!bm) return null; const h=it.w*bm.height/bm.width, r=it.rot*Math.PI/180, co=Math.cos(r), si=Math.sin(r);
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([sx,sy])=>{ const px=sx*it.w/2, py=sy*h/2; return [it.x+px*co-py*si, it.y+px*si+py*co]; });
}
function drawSelection(g,it,T,s){
  const cs=corners(it); if(!cs) return; const pad=8/s;
  g.save(); g.setTransform(...T);
  g.translate(it.x,it.y); g.rotate(it.rot*Math.PI/180);
  const bm=bitmap(it), h=it.w*bm.height/bm.width;
  g.lineWidth=2/s*(window.devicePixelRatio||1); g.setLineDash([8/s,6/s]); g.strokeStyle="#0071e3";
  g.strokeRect(-it.w/2-pad,-h/2-pad,it.w+pad*2,h+pad*2);
  g.setLineDash([]); g.fillStyle="#0071e3"; g.strokeStyle="#fff"; g.lineWidth=3/s*(window.devicePixelRatio||1);
  const R=11/s*(window.devicePixelRatio||1);
  g.beginPath(); g.arc(it.w/2+pad,h/2+pad,R,0,Math.PI*2); g.fill(); g.stroke();
  g.restore();
}
let lastT=[1,0,0,1,0,0], raf=0;
function dirty(){ if(!raf) raf=requestAnimationFrame(()=>{ raf=0; draw(); }); }
function draw(){
  if(!baseImg[state.color+"_front"]) return;
  lastT=compose(cv, cv.width, state.view, true);
  $("#tagExample").hidden=!state.example;
}
function sizeCanvas(){
  const r=$("#cvWrap").getBoundingClientRect(), dpr=Math.min(2,window.devicePixelRatio||1);
  const px=Math.max(200,Math.min(1800,Math.round(r.width*dpr)));
  if(cv.width!==px){ cv.width=px; cv.height=px; }
  dirty();
}
new ResizeObserver(sizeCanvas).observe($("#cvWrap"));

/* ================== CANVAS INTERACTION ================== */
function toMock(e){
  const r=cv.getBoundingClientRect(), px=(e.clientX-r.left)*cv.width/r.width, py=(e.clientY-r.top)*cv.height/r.height;
  const [s,,,,tx,ty]=lastT; return {x:(px-tx)/s, y:(py-ty)/s, s};
}
function hit(it,p){
  const bm=bitmap(it); if(!bm) return false; const h=it.w*bm.height/bm.width, r=-it.rot*Math.PI/180;
  const dx=p.x-it.x, dy=p.y-it.y, lx=dx*Math.cos(r)-dy*Math.sin(r), ly=dx*Math.sin(r)+dy*Math.cos(r);
  const m=Math.max(10, 14/p.s); return Math.abs(lx)<=it.w/2+m && Math.abs(ly)<=h/2+m;
}
function handlePos(it,s){
  const bm=bitmap(it); const h=it.w*bm.height/bm.width, pad=8/s, r=it.rot*Math.PI/180;
  const px=it.w/2+pad, py=h/2+pad; return {x:it.x+px*Math.cos(r)-py*Math.sin(r), y:it.y+px*Math.sin(r)+py*Math.cos(r)};
}
let drag=null;
cv.addEventListener("pointerdown",e=>{
  const p=toMock(e), dpr=Math.min(2,window.devicePixelRatio||1);
  const sel=state.items.find(i=>i.id===state.sel);
  if(sel){ const hp=handlePos(sel,p.s); if(Math.hypot(hp.x-p.x,hp.y-p.y) < 26*dpr/p.s){
    drag={mode:"size", it:sel, d0:Math.hypot(p.x-sel.x,p.y-sel.y), w0:sel.w}; cv.setPointerCapture(e.pointerId); cv.classList.add("dragging"); return; } }
  const target=[...state.items].reverse().find(i=>hit(i,p));
  if(target){
    const changed = state.sel!==target.id; state.sel=target.id;
    drag={mode:"move", it:target, ox:p.x-target.x, oy:p.y-target.y};
    cv.setPointerCapture(e.pointerId); cv.classList.add("dragging");
    if(changed) renderList();
  } else if(state.sel){ state.sel=null; renderList(); }
  dirty();
});
cv.addEventListener("pointermove",e=>{
  if(!drag) return; const p=toMock(e);
  if(drag.mode==="move"){ drag.it.x=p.x-drag.ox; drag.it.y=p.y-drag.oy; drag.it.moved=true; }
  else { const d=Math.hypot(p.x-drag.it.x,p.y-drag.it.y); drag.it.w=Math.max(20,Math.min(1400,drag.w0*d/Math.max(1,drag.d0))); drag.it.scale=drag.it.w/drag.it.base; }
  dirty();
});
const endDrag=()=>{ if(!drag) return; drag=null; cv.classList.remove("dragging"); syncCard(); renderSummary(); save(); };
cv.addEventListener("pointerup",endDrag); cv.addEventListener("pointercancel",endDrag);

/* ================== VIEW / COLOR ================== */
function setView(v){ state.view=v; $$(".views button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.view===v)); dirty(); }
$$(".views button").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.view)));
function setColor(c){ state.color=c; $$(".sw").forEach(b=>b.setAttribute("aria-pressed",b.dataset.color===c));
  ensureColor(c).then(dirty).catch(()=>toast("Não consegui carregar a foto dessa cor. Confira a internet."));
  renderList(); renderSummary(); dirty(); save(); syncVariantUrl(); }
$$(".sw").forEach(b=>b.addEventListener("click",()=>setColor(b.dataset.color)));
$$('input[name=tipo]').forEach(r=>r.addEventListener("change",()=>{ state.tipo=r.value; syncForm(); renderSummary(); save(); syncVariantUrl(); }));
$("#tamanho").addEventListener("change",e=>{ state.tamanho=e.target.value; renderSummary(); save(); syncVariantUrl(); });

/* ================== EQUIPE (vários kimonos) ================== */
const MAX_PESSOAS = 40;
function setModo(m){
  state.modo=m;
  if(m==="equipe" && state.pessoas.length<2){
    const p0={nome:"",tamanho:state.tamanho==="ajuda"?"":state.tamanho};
    state.pessoas = state.pessoas.length ? state.pessoas : [p0];
    while(state.pessoas.length<2) state.pessoas.push({nome:"",tamanho:""});
    // o texto do topo das costas passa a ser o nome de cada pessoa
    const nome=state.items.find(i=>i.kind==="text" && i.slot==="costas_nome");
    if(nome && nome.perPerson===undefined) nome.perPerson=true;
  }
  syncQtd(); syncForm(); renderEquipe(); refitPerPerson(); renderList(); dirty(); save();
}
function syncQtd(){ state.qtd = isEquipe() ? Math.max(1,state.pessoas.length) : 1; }
$$("[data-modo]").forEach(b=>b.addEventListener("click",()=>setModo(b.dataset.modo)));
function renderEquipe(){
  const ol=$("#equipeList"), opts=$("#tamanho").innerHTML;
  ol.classList.toggle("sem-tamanho", state.tipo!=="brazil");
  ol.innerHTML=state.pessoas.map((p,i)=>`<li data-i="${i}">
    <input type="text" data-p="nome" value="${esc(p.nome)}" placeholder="Nome nas costas" aria-label="Nome da pessoa ${i+1}" maxlength="40" autocomplete="off">
    <select data-p="tamanho" aria-label="Tamanho da pessoa ${i+1}">${opts}</select>
    <button type="button" class="icon-btn" data-p="del" aria-label="Tirar a pessoa ${i+1} da lista">${ICON_TRASH}</button></li>`).join("");
  ol.querySelectorAll("li").forEach((li,i)=>{ li.querySelector("select").value=state.pessoas[i].tamanho; });
  $("#addPessoa").hidden = state.pessoas.length>=MAX_PESSOAS;
}
function refitPerPerson(){ state.items.forEach(it=>{ if(it.kind==="text" && it.perPerson) refit(it); }); }
$("#addPessoa").addEventListener("click",()=>{ if(state.pessoas.length>=MAX_PESSOAS) return; state.pessoas.push({nome:"",tamanho:""}); syncQtd(); renderEquipe(); renderSummary(); save();
  const ins=$("#equipeList").querySelectorAll('input[data-p="nome"]'); ins[ins.length-1]?.focus(); });
$("#equipeList").addEventListener("input",e=>{ const li=e.target.closest("li"); if(!li||e.target.dataset.p!=="nome") return; state.pessoas[+li.dataset.i].nome=e.target.value; refitPerPerson(); renderSummary(); dirty(); save(); });
$("#equipeList").addEventListener("change",e=>{ const li=e.target.closest("li"); if(!li||e.target.dataset.p!=="tamanho") return; state.pessoas[+li.dataset.i].tamanho=e.target.value; renderSummary(); save(); });
$("#equipeList").addEventListener("click",e=>{ const b=e.target.closest('[data-p="del"]'); if(!b) return; const i=+b.closest("li").dataset.i;
  state.pessoas.splice(i,1); if(state.pessoas.length<2){ state.tamanho=(state.pessoas[0]||{}).tamanho||state.tamanho; state.pessoas=[]; return setModo("um"); }
  syncQtd(); renderEquipe(); refitPerPerson(); renderSummary(); dirty(); save(); });
// Lista de kimonos do pedido: [{nome, tamanho}] (um item no modo "só um")
function kimonos(){ return isEquipe() ? state.pessoas : [{nome:"", tamanho:state.tamanho}]; }
$$('input[name=prazo]').forEach(r=>r.addEventListener("change",()=>{ state.prazo=r.value; state.prazoManual=true; renderSummary(); save(); }));
// Expresso grátis: enquanto o cliente não escolher o prazo, a ferramenta marca Expresso quando o pedido passa do valor e volta ao Padrão quando não passa
function autoPrazo(){
  if(state.prazoManual || !PRECOS.expressoGratisAcima) return;
  const want = calcPreco().expressoGratis ? "expresso" : "padrao";
  if(state.prazo!==want && (state.prazo==="padrao"||state.prazo==="expresso")){ state.prazo=want; $$("input[name=prazo]").forEach(r=>r.checked=r.value===want); }
}
$("#copyPix").addEventListener("click",async()=>{ try{ await navigator.clipboard.writeText("56151834000152"); toast("Chave Pix copiada"); }catch(e){ toast("Selecione a chave e copie"); } });
for(const [id,k] of [["dNome","nome"],["dZap","zap"],["dEquipe","equipe"],["dObs","obs"]]) $("#"+id).addEventListener("input",e=>{ state.dados[k]=e.target.value; renderSummary(); save(); });

/* ================== LIST UI ================== */
const ICON_TRASH='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
const ICON_UP='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
function slotOptions(cur){
  const grp=(side,lab)=>`<optgroup label="${lab}">`+SLOTS.filter(s=>s.side===side).map(s=>`<option value="${s.id}"${s.id===cur?" selected":""}>${esc(s.label)}</option>`).join("")+"</optgroup>";
  return grp("front","Frente")+grp("back","Costas");
}
function itemTitle(it){ return it.kind==="text" ? (perPersonOn(it) ? "Texto · nome de cada pessoa" : `Texto · ${it.text||""}`) : `Logo · ${it.name}`; }
function itemPos(it){ return SLOT[it.slot].label + (it.moved?" (ajustado)":""); }
function inkChips(it){
  const cur=inkFor(it).toLowerCase(); const auto=it.autoInk;
  return `<div class="chips" role="group" aria-label="Cor da estampa">
    <button type="button" class="chip auto" data-act="ink" data-ink="auto" aria-pressed="${auto}">Automática</button>
    ${INKS.map(k=>`<button type="button" class="chip" style="background:${k.c}" data-act="ink" data-ink="${k.c}" aria-pressed="${!auto&&cur===k.c}" aria-label="${k.n}" title="${k.n}"></button>`).join("")}
    <label class="chip custom" title="Outra cor" aria-label="Outra cor"><input type="color" data-act="inkc" value="${inkFor(it)}"></label>
  </div>`;
}
function renderList(){
  const box=$("#items");
  if(!state.items.length){ box.innerHTML=`<div class="empty">Nenhuma arte ainda. Comece enviando o logo da sua equipe ou escrevendo o seu nome.</div>`; renderSummary(); return; }
  box.innerHTML=state.items.map(it=>{
    const sel=it.id===state.sel;
    let body="";
    if(sel){
      body+=`<label class="field"><span class="lbl">Posição</span><select data-act="slot">${slotOptions(it.slot)}</select></label>`;
      if(it.kind==="text"){
        if(isEquipe()) body+=`<label class="check"><input type="checkbox" data-act="perPerson"${it.perPerson?" checked":""}><span>Trocar pelo nome de cada pessoa da equipe</span></label>`;
        if(!perPersonOn(it)) body+=`<label class="field"><span class="lbl">Texto</span><input type="text" data-act="text" value="${esc(it.text)}" maxlength="40"></label>`;
        body+=`
        <div class="row"><label class="field"><span class="lbl">Fonte</span><select data-act="font">${FONTS.map(f=>`<option value="${f.id}"${f.id===it.font?" selected":""}>${f.label}</option>`).join("")}</select></label></div>
        <div class="field"><span class="lbl">Estilo</span><div class="seg" role="group">${[["simples","Simples"],["linha","Com linha"],["tarja","Tarja"]].map(([v,l])=>`<button type="button" data-act="style" data-v="${v}" aria-pressed="${it.style===v}">${l}</button>`).join("")}</div></div>`;
      } else {
        body+=`<div class="field"><span class="lbl">Tratamento</span><div class="seg" role="group">${[["original","Original"],["semfundo","Sem fundo"],["umacor","1 cor"]].map(([v,l])=>`<button type="button" data-act="mode" data-v="${v}" aria-pressed="${it.mode===v}">${l}</button>`).join("")}</div></div>`;
      }
      if(it.kind==="text"||it.mode==="umacor") body+=`<div class="field"><span class="lbl">Cor da estampa</span>${inkChips(it)}</div>`;
      body+=`<label class="field"><span class="lbl">Tamanho</span><span class="range"><input type="range" data-act="scale" min="40" max="220" value="${Math.round(it.scale*100)}"><output>${Math.round(it.scale*100)}%</output></span></label>
      <label class="field"><span class="lbl">Girar</span><span class="range"><input type="range" data-act="rot" min="-90" max="90" value="${Math.round(it.rot)}"><output>${Math.round(it.rot)}°</output></span></label>`;
      if(it.lowres) body+=`<p class="warn">Arte em baixa resolução. Serve para o mockup; a Tap redesenha (vetoriza) antes de produzir.</p>`;
      if(it.lib) body+=`<p class="ok">Logo do banco da Tap, já pronto para produção.</p>`;
      body+=`<div class="row"><button type="button" class="btn" data-act="front" style="flex:1">${ICON_UP} Trazer para frente</button><button type="button" class="btn" data-act="del" style="flex:1">${ICON_TRASH} Remover</button></div>`;
    }
    return `<div class="item" data-id="${it.id}" data-sel="${sel}">
      <div class="item-h" data-act="select"><span class="thumb" data-thumb="${it.id}"></span><span class="item-t"><b>${esc(itemTitle(it))}</b><small>${esc(itemPos(it))}</small></span>
      <button type="button" class="icon-btn" data-act="del" aria-label="Remover">${ICON_TRASH}</button></div>
      ${sel?`<div class="item-b">${body}</div>`:""}</div>`;
  }).join("");
  state.items.forEach(paintThumb);
  renderSummary();
}
function paintThumb(it){
  const el=$(`[data-thumb="${it.id}"]`); if(!el) return; const bm=bitmap(it); if(!bm) return;
  const c=mk(96,96), x=c.getContext("2d"); const k=Math.min(80/bm.width,80/bm.height);
  x.fillStyle = state.color==="branco" ? "#e4e6ea" : state.color==="azul" ? "#25259c" : "#161616"; x.fillRect(0,0,96,96);
  x.drawImage(bm,(96-bm.width*k)/2,(96-bm.height*k)/2,bm.width*k,bm.height*k);
  el.replaceChildren(c);
}
function syncCard(){
  const it=state.items.find(i=>i.id===state.sel); if(!it) return;
  const card=$(`.item[data-id="${it.id}"]`); if(!card) return;
  const sc=card.querySelector('[data-act="scale"]'); if(sc){ sc.value=Math.round(it.scale*100); sc.nextElementSibling.textContent=Math.round(it.scale*100)+"%"; }
  const ro=card.querySelector('[data-act="rot"]'); if(ro){ ro.value=Math.round(it.rot); ro.nextElementSibling.textContent=Math.round(it.rot)+"°"; }
  const sm=card.querySelector(".item-t small"); if(sm) sm.textContent=itemPos(it);
}
const itemOf=el=>{ const c=el.closest(".item"); return c && state.items.find(i=>i.id===+c.dataset.id); };
$("#items").addEventListener("click",e=>{
  const el=e.target.closest("[data-act]"); if(!el) return; const it=itemOf(el); if(!it) return; const act=el.dataset.act;
  // Campos (texto, fonte, posição, tamanho, cor livre, caixinha) são tratados nos eventos input/change.
  // Redesenhar a lista no clique trocaria o campo antes de o teclado ou a lista abrir (acontecia no iPhone).
  if(!["select","del","front","style","mode","ink"].includes(act)) return;
  if(act==="select"){ if(e.target.closest('.icon-btn')) return; state.sel= state.sel===it.id? null : it.id; if(state.sel && window.innerWidth<860) setView(itemSide(it)==="back"?"costas":"frente"); renderList(); dirty(); return; }
  if(act==="del"){ state.items=state.items.filter(i=>i!==it); if(state.sel===it.id) state.sel=null; renderList(); dirty(); save(); return; }
  if(act==="front"){ state.items=state.items.filter(i=>i!==it); state.items.push(it); renderList(); dirty(); save(); return; }
  if(act==="style"){ it.style=el.dataset.v; refit(it); }
  if(act==="mode"){ it.mode=el.dataset.v; refit(it); }
  if(act==="ink"){ if(el.dataset.ink==="auto"){ it.autoInk=true; } else { it.autoInk=false; it.ink=el.dataset.ink; } }
  renderList(); dirty(); save();
});
function refit(it){ const keep={x:it.x,y:it.y,rot:it.rot,moved:it.moved}; it._bm=null; fitToSlot(it,it.slot,true); if(keep.moved) Object.assign(it,keep); }
$("#items").addEventListener("input",e=>{
  const el=e.target; const it=itemOf(el); if(!it) return; const act=el.dataset.act;
  if(act==="scale"){ it.scale=el.value/100; it.w=it.base*it.scale; el.nextElementSibling.textContent=el.value+"%"; }
  else if(act==="rot"){ it.rot=+el.value; el.nextElementSibling.textContent=el.value+"°"; }
  else if(act==="text"){ it.text=el.value; refit(it); const b=el.closest(".item").querySelector(".item-t b"); b.textContent=itemTitle(it); paintThumb(it); renderSummary(); }
  else if(act==="inkc"){ it.autoInk=false; it.ink=el.value; paintThumb(it); }
  dirty();
});
$("#items").addEventListener("change",e=>{
  const el=e.target; const it=itemOf(el); if(!it) return; const act=el.dataset.act;
  if(act==="slot"){ it.moved=false; fitToSlot(it,el.value,true); setViewForNarrow(it); renderList(); dirty(); }
  if(act==="font"){ it.font=el.value; refit(it); renderList(); dirty(); }
  if(act==="perPerson"){ it.perPerson=el.checked; refit(it); renderList(); dirty(); }
  if(act==="inkc"){ renderList(); }
  save();
});
function setViewForNarrow(it){ if(window.innerWidth<860 || state.view!=="todo") setView(itemSide(it)==="back"?"costas":"frente"); }

/* ================== ADD: TEXT / FILE / LIB ================== */
let primeiraArte=false;
function marcaPrimeiraArte(tipo){ if(primeiraArte) return; primeiraArte=true; track("primeira_arte",{tipo}); }
$("#addText").addEventListener("click",()=>{ addText("SEU NOME"); marcaPrimeiraArte("texto"); });
$("#addLogo").addEventListener("click",()=>$("#fileIn").click());
$("#fileIn").addEventListener("change",async e=>{
  const f=e.target.files[0]; e.target.value=""; if(!f) return;
  try{
    if(f.type==="application/pdf"||/\.pdf$/i.test(f.name)) return openPdf(f);
    const url=URL.createObjectURL(f); const img=await loadImg(url);
    const isSvg=f.type.includes("svg")||/\.svg$/i.test(f.name);
    let src=img;
    if(isSvg){ const nw=img.naturalWidth||1000, nh=img.naturalHeight||1000, k=2000/Math.max(nw,nh); const c=mk(nw*k,nh*k); c.getContext("2d").drawImage(img,0,0,c.width,c.height); src=c; }
    await addImageFromCanvas(src,{name:f.name, w:img.naturalWidth, h:img.naturalHeight, vector:isSvg, file:f}); marcaPrimeiraArte("upload");
    URL.revokeObjectURL(url);
  }catch(err){ toast("Não consegui abrir esse arquivo. Tente PNG, JPG, SVG ou PDF."); }
});
$("#openLib").addEventListener("click",()=>{ const b=$("#libBox"); b.hidden=!b.hidden; if(!b.hidden) $("#libQ").focus(); });
const norm=s=>s.normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
$("#libQ").addEventListener("input",e=>{
  const q=norm(e.target.value.trim()), res=$("#libRes"), msg=$("#libMsg");
  if(q.length<2){ res.innerHTML=""; msg.textContent='Digite pelo menos 2 letras. Se a sua equipe não aparecer, use "Enviar logo".'; return; }
  const hits=LIB.filter(l=>norm(l.team+" "+l.label+" "+(l.tags||"")).includes(q));
  res.innerHTML=hits.map(l=>`<button type="button" data-key="${l.key}"><img src="${l.uri}" alt="">${esc(l.label)}</button>`).join("");
  msg.textContent= hits.length? "Toque no logo para colocar no kimono." : 'Não achei essa equipe no banco da Tap. Use "Enviar logo".';
});
$("#libRes").addEventListener("click",async e=>{
  const b=e.target.closest("button[data-key]"); if(!b) return; const l=LIB.find(x=>x.key===b.dataset.key);
  const img=await loadImg(l.uri); await addImageFromCanvas(img,{name:l.label, w:img.naturalWidth, h:img.naturalHeight, vector:true, lib:l.key, mode: l.mode==="mono" ? "umacor" : "original"});
  toast("Logo adicionado"); marcaPrimeiraArte("banco");
});

/* ================== PDF ================== */
let pdfjsReady=null;
function loadScript(src){ return new Promise((res,rej)=>{ const s=document.createElement("script"); s.src=src; s.onload=res; s.onerror=rej; document.head.appendChild(s); }); }
function ensurePdfjs(){
  if(!pdfjsReady) pdfjsReady=(async()=>{
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js");
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
    return window.pdfjsLib;
  })();
  return pdfjsReady;
}
async function openPdf(file){
  const sh=$("#pdfSheet"), pages=$("#pdfPages"), msg=$("#pdfMsg");
  pages.innerHTML=""; msg.textContent="Carregando o PDF…"; sh.hidden=false;
  try{
    const lib=await ensurePdfjs(); const buf=await file.arrayBuffer();
    const doc=await lib.getDocument({data:buf, isEvalSupported:false}).promise;
    msg.textContent = doc.numPages>1 ? `O arquivo tem ${doc.numPages} páginas. Toque na que tem o logo que você quer.` : "Toque na página para usar o logo.";
    if(doc.numPages===1){ sh.hidden=true; return usePdfPage(doc,1,file); }
    for(let n=1;n<=Math.min(doc.numPages,40);n++){
      const pg=await doc.getPage(n), vp=pg.getViewport({scale:1}), k=180/Math.max(vp.width,vp.height), v=pg.getViewport({scale:k});
      const c=mk(v.width,v.height); await pg.render({canvasContext:c.getContext("2d"), viewport:v}).promise;
      const b=document.createElement("button"); b.type="button"; b.append(c, Object.assign(document.createElement("span"),{textContent:"Página "+n}));
      b.addEventListener("click",()=>{ sh.hidden=true; usePdfPage(doc,n,file); }); pages.append(b);
    }
  }catch(err){ msg.textContent="Não consegui abrir esse PDF aqui. Exporte o logo como PNG ou mande o PDF direto para a Tap."; }
}
async function usePdfPage(doc,n,file){
  const pg=await doc.getPage(n), vp=pg.getViewport({scale:1}), k=2000/Math.max(vp.width,vp.height), v=pg.getViewport({scale:k});
  const c=mk(v.width,v.height); await pg.render({canvasContext:c.getContext("2d"), viewport:v, background:"rgba(0,0,0,0)"}).promise;
  await addImageFromCanvas(c,{name:`${file.name} · pág. ${n}`, w:c.width, h:c.height, vector:true, file}); marcaPrimeiraArte("pdf");
}

/* ================== SUMMARY / EXPORT ================== */
function corLabel(){ return COLORS[state.color].label; }
function tamTxt(t){ return !t ? "tamanho a escolher" : t==="ajuda" ? "quero ajuda com o tamanho" : "tamanho "+t; }
function summaryLines(){
  const L=[]; const c=corLabel().toLowerCase(), N=state.qtd;
  if(state.tipo==="brazil") L.push(isEquipe() ? `${N} × ${KIMONO_NOME} ${c}, com personalização` : `${KIMONO_NOME} ${c}, ${tamTxt(state.tamanho)}, com personalização`);
  else L.push(`Só a personalização${N>1?` em ${N} kimonos`:""}, no meu kimono ${c}`);
  return L;
}
function itemLine(it,nomePessoa){
  const pos=SLOT[it.slot].label; const ink = (it.kind==="text"||it.mode==="umacor") ? " · "+inkName(inkFor(it)) : "";
  if(it.kind==="text"){
    const t = perPersonOn(it) ? (nomePessoa!=null ? `texto "${nomePessoa||"(sem nome)"}"` : "nome de cada pessoa") : `texto "${it.text}"`;
    return `${pos}: ${t} (${(FONTS.find(f=>f.id===it.font)||FONTS[0]).label}${it.style!=="simples"?", "+(it.style==="linha"?"com linha":"em tarja"):""})${ink}`;
  }
  return `${pos}: logo ${it.lib? `"${it.name}" (banco da Tap)` : `"${it.name}"`}${ink}`;
}
function itemLineSummary(it){ return itemLine(it) + (it===nomeGratis() ? " · nome incluso" : ""); }
function inkName(hex){ const k=INKS.find(k=>k.c===hex.toLowerCase()); return k? k.n.toLowerCase() : `cor ${hex}`; }
const brl=v=>v.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
// Costas do casaco (acima da barra) entram no pacote de costas; o resto é adicional por posição.
function isBack(it){ return it.x>1200 && it.y<1100; }
const isInfantil = t => /^M/.test(t||"");
// Preço de 1 kimono (R$). Na loja vem da variante (cor × tamanho); sem tamanho, usa o adulto como estimativa.
function kimonoPreco(tam){
  if(SHOP && SHOP.kimono){ const v=SHOP.kimono.variantes[corLabel()+"|"+tam]; if(v) return v.preco/100; }
  return isInfantil(tam) ? PRECOS.kimono.infantil : PRECOS.kimono.adulto;
}
// Pedido só com nome (sem logo nem adicional) não tem preço público: é combinado pelo WhatsApp.
// O nome nas costas é grátis: o texto com o nome de cada pessoa, ou o do topo das costas, ou o primeiro texto das costas.
function nomeGratis(){
  const t=state.items.filter(it=>it.kind==="text" && isBack(it));
  return t.find(perPersonOn) || t.find(it=>it.slot==="costas_nome") || t[0] || null;
}
const plural=(n,um,varios)=>`${n} ${n===1?um:varios}`;
// Escolhe a faixa de menor total para L logos nas costas e A adicionais (por kimono)
function escolherFaixa(L,A,N){
  const k=N>1?1:0; let best=null;
  for(const id of FAIXAS){ const f=PRECOS.faixas[id]; if(!f || f.preco[k]==null || L>f.logos) continue;
    const extra=Math.max(0,A-f.adic), tier=extra===1?"1":"2+", av=extra ? PRECOS.adicional[tier][k] : 0;
    if(extra && av==null) continue;
    const unit=f.preco[k]+av*extra; if(!best || unit<best.unit-0.001) best={id,f,extra,tier,av,unit}; }
  return best;
}
function calcPreco(){
  const N=state.qtd, k=N>1?1:0, gratis=nomeGratis(), L=[]; let total=0, consulta=false, soNome=false, porque="", cabe="";
  const logos=state.items.filter(it=>isBack(it) && it!==gratis).length, add=state.items.filter(it=>!isBack(it)).length;
  const cobr={faixa:null, adicional:null, prazo:null};
  if(state.items.length && !logos && !add){
    soNome=true; L.push({t:"Personalização só com o nome", s:"Esse pedido é combinado pelo WhatsApp", v:null, vt:"a combinar"});
  } else if(state.items.length){
    const b=escolherFaixa(logos,add,N);
    if(!b){ consulta=true; L.push({t:`Personalização (${plural(logos,"logo","logos")} nas costas)`, s:"7 ou mais logos nas costas: a Tap faz o orçamento pelo WhatsApp", v:null, vt:"a orçar"}); }
    else {
      const f=b.f, p=f.preco[k], pct=N>1 ? Math.round((1-f.preco[1]/f.preco[0])*100) : 0, incAdd=Math.min(add,f.adic);
      const inc=[]; if(gratis) inc.push("nome"); if(logos) inc.push(plural(logos,"logo","logos")+" nas costas"); if(incAdd) inc.push(plural(incAdd,"adicional incluso","adicionais inclusos"));
      L.push({t:`Personalização · faixa ${f.label}`, s:[inc.join(" + "), N>1?`${N} × ${brl(p)}${pct>0?` (${pct}% de desconto)`:""}`:""].filter(Boolean).join(" · "), v:p*N});
      total+=p*N; cobr.faixa={id:b.id, k:N>1?"2+":"1", qty:N};
      if(b.extra){ const units=b.extra*N, v=b.av*units; total+=v; cobr.adicional={tier:b.tier, k:N>1?"2+":"1", qty:units};
        L.push({t:`${plural(b.extra,"adicional avulso","adicionais avulsos")}${N>1?` × ${N} kimonos`:""}`, s: units>1? `${units} × ${brl(b.av)}` : "", v}); }
      // Por que essa faixa
      const pq=[]; if(gratis) pq.push("nome"); if(logos) pq.push(plural(logos,"logo nas costas","logos nas costas")); if(incAdd) pq.push(plural(incAdd,"adicional incluso","adicionais inclusos")); if(b.extra) pq.push(plural(b.extra,"avulso","avulsos"));
      porque=`${f.label}: ${pq.join(" + ")}.`;
      const minId=FAIXAS.find(id=>PRECOS.faixas[id] && PRECOS.faixas[id].preco[k]!=null && logos<=PRECOS.faixas[id].logos);
      if(minId && minId!==b.id){ const m=PRECOS.faixas[minId], ex=Math.max(0,add-m.adic), alt=m.preco[k]+(ex? PRECOS.adicional[ex===1?"1":"2+"][k]*ex : 0);
        porque+=` Sai mais barato do que ${m.label} + ${plural(ex,"adicional avulso","adicionais avulsos")} (${brl(alt*N)}).`; }
      if(N>1 && pct>0) porque+=` ${N} kimonos com a mesma arte: ${pct}% de desconto na personalização.`;
      // Quanto ainda cabe na faixa sem custo
      const sl=f.logos-logos, sa=Math.max(0,f.adic-add), c=[];
      if(sl>0) c.push(plural(sl,"logo nas costas","logos nas costas")); if(sa>0) c.push(plural(sa,"adicional","adicionais"));
      if(c.length) cabe=`Você ainda pode adicionar ${c.join(" e ")} sem custo.`;
    }
  }
  if(state.tipo==="brazil"){
    const grupos={};
    kimonos().forEach(k=>{ const cat=isInfantil(k.tamanho)?"infantil":"adulto", g=grupos[cat] ||= {n:0,v:0,units:new Set(),semTam:0};
      const u=kimonoPreco(k.tamanho); g.n++; g.v+=u; g.units.add(u); if(!k.tamanho||k.tamanho==="ajuda") g.semTam++; });
    for(const cat of ["adulto","infantil"]){ const g=grupos[cat]; if(!g) continue; total+=g.v;
      const parts=[]; if(g.n>1) parts.push(g.units.size===1 ? `${g.n} × ${brl([...g.units][0])}` : `${g.n} kimonos`); if(g.semTam) parts.push("Escolha o tamanho");
      L.push({t:`${KIMONO_NOME} ${cat}`, s:parts.join(" · "), v:g.v}); }
  }
  // Expresso grátis a partir de um valor (kimono + personalização, sem a taxa de prazo)
  const lim=PRECOS.expressoGratisAcima, expressoGratis = !!lim && !consulta && !soNome && state.items.length>0 && total>=lim;
  if(state.prazo==="expresso" && expressoGratis){ cobr.prazo="expresso-gratis"; L.push({t:"Prazo expresso", s:`Grátis em pedidos a partir de ${brl(lim)}`, v:0, vt:"grátis"}); }
  else { const pz=PRECOS.prazo[state.prazo]; if(pz){ total+=pz; cobr.prazo=state.prazo; L.push({t:"Prazo "+PRAZOS[state.prazo].split(" (")[0].toLowerCase(), s:"", v:pz}); } }
  total=Math.round(total*100)/100;
  return {L,total,consulta,soNome,cobr,porque,cabe,expressoGratis};
}
function renderSummary(){
  autoPrazo();
  const n=state.items.length;
  $("#summary").innerHTML=`<b>${esc(summaryLines()[0])}</b><span>${n? n+(n>1?" elementos de personalização:":" elemento de personalização:") : "Nenhuma arte adicionada ainda."}</span>${n?`<ul>${state.items.map(it=>`<li>${esc(itemLineSummary(it))}</li>`).join("")}</ul>`:""}`;
  const {L,total,consulta,soNome,porque,cabe}=calcPreco(), aberto=consulta||soNome;
  $("#price").innerHTML = L.map(l=>`<div class="ln"><span>${esc(l.t)}${l.s?`<small>${esc(l.s)}</small>`:""}</span><span>${l.vt||(l.v==null?"a orçar":brl(l.v))}</span></div>`).join("")
    + (porque||cabe ? `<div class="ln faixa-info"><span>${esc(porque)}${cabe?`<b class="cabe">${esc(cabe)}</b>`:""}</span></div>` : "")
    + `<div class="ln tot"><span>${SHOP&&!aberto?"Total":"Total estimado"}${aberto?" (sem a personalização)":""}</span><span>${brl(total)}</span></div>`
    + (aberto ? `<div class="ln sinal"><span>${soNome?"Pedido só com nome: o valor da personalização é combinado pelo WhatsApp.":"Com 7 ou mais logos nas costas, a Tap faz o orçamento pelo WhatsApp."} <button type="button" class="linkbtn" data-whats>Falar com a gente no WhatsApp</button></span><span></span></div>`
       : SHOP ? `<div class="ln sinal"><span>Pagamento integral no site, no checkout</span><span></span></div>`
              : `<div class="ln sinal"><span>Sinal de 50% para começar</span><span>${brl(total/2)}</span></div>`);
  if(SHOP){ const issue=cartIssue(true); $("#cartWarn").hidden=!issue; $("#cartWarn").textContent=issue||""; }
}
function orderText(){
  const d=state.dados; const parts=["Olá, Tap! Montei meu kimono no site:", "", "• "+summaryLines()[0]];
  if(isEquipe()){ parts.push(`• Kimonos (${state.pessoas.length}):`); state.pessoas.forEach((p,i)=>parts.push(`   ${i+1}. ${p.nome||"(sem nome)"}${state.tipo==="brazil"?" · "+tamTxt(p.tamanho):""}`)); }
  parts.push(`• Personalização (${state.items.length} ${state.items.length===1?"elemento":"elementos"}):`);
  state.items.forEach(it=>parts.push("   – "+itemLine(it)));
  if(d.nome) parts.push("• Nome: "+d.nome); if(d.zap) parts.push("• WhatsApp: "+d.zap); if(d.equipe) parts.push("• Equipe: "+d.equipe);
  if(d.obs) parts.push("• Obs.: "+d.obs);
  parts.push("• Prazo: "+PRAZOS[state.prazo]);
  const {L,total,consulta}=calcPreco();
  const {porque,soNome}=calcPreco();
  parts.push("", "Valor estimado pela tabela:"); L.forEach(l=>parts.push(`   – ${l.t}${l.s?` (${l.s})`:""}: ${l.vt||(l.v==null?"a orçar":brl(l.v))}`));
  if(porque) parts.push("   "+porque);
  parts.push(consulta||soNome ? `   Total sem a personalização: ${brl(total)} (a personalização a gente combina aqui)` : `   Total: ${brl(total)} · sinal de 50%: ${brl(total/2)}`);
  parts.push("", "Vou mandar o mockup e os arquivos das artes aqui na conversa.");
  return parts.join("\n");
}
let lastBlob=null;
// Mockup em PNG. "nome" = gera com o nome dessa pessoa da equipe; "legenda" = nome e tamanho no rodapé.
async function mockupBlob(nome=null, legenda=""){
  await ensureColor(state.color);
  const S=2400, c=mk(S,S);
  nomeOverride=nome; try{ compose(c,S,"export",false); } finally{ nomeOverride=null; }
  const g=c.getContext("2d"); g.setTransform(1,0,0,1,0,0); g.textAlign="center";
  if(legenda){ g.fillStyle="#12131b"; g.font='700 56px "Barlow", Arial, sans-serif'; g.fillText(legenda, S/2, 200); }
  g.fillStyle="#9aa0ab"; g.font='500 30px "Barlow", Arial, sans-serif';
  g.fillText("Mockup ilustrativo · Tap · cores e tamanhos finais confirmados na produção", S/2, S-90);
  return new Promise(r=>c.toBlob(r,"image/png"));
}
function legendaPessoa(p,i){ return `${i+1}. ${p.nome.trim()||"(sem nome)"}${state.tipo==="brazil" && p.tamanho && p.tamanho!=="ajuda" ? " · "+p.tamanho : ""}`; }
// Um mockup por pessoa da equipe (só quando há texto com o nome de cada pessoa)
let teamBlobs=[];
async function mockupsEquipe(say){
  const out=[];
  for(const [i,p] of state.pessoas.entries()){ say && say(`Gerando os mockups (${i+1} de ${state.pessoas.length})…`); out.push({pessoa:p, legenda:legendaPessoa(p,i), blob:await mockupBlob(p.nome, legendaPessoa(p,i))}); }
  return out;
}
let teamUrls=[];
function renderTeamMocks(){
  const box=$("#teamMocks"); teamUrls.forEach(u=>URL.revokeObjectURL(u)); teamUrls=[];
  if(!teamBlobs.length){ box.hidden=true; box.innerHTML=""; return; }
  box.hidden=false;
  box.innerHTML=`<p class="lbl">Kimonos da equipe (${teamBlobs.length})</p><div class="team-mocks-grid">`+teamBlobs.map((t,i)=>{ const u=URL.createObjectURL(t.blob); teamUrls.push(u);
    return `<button type="button" data-i="${i}" aria-pressed="${i===0}"><span class="th"><img src="${u}" alt="Mockup de ${esc(t.legenda)}"></span><span>${esc(t.legenda)}</span></button>`; }).join("")+`</div>`;
}
$("#teamMocks").addEventListener("click",e=>{ const b=e.target.closest("button[data-i]"); if(!b) return; const i=+b.dataset.i;
  $("#resImg").src=teamUrls[i]; $("#resImg").alt="Mockup de "+teamBlobs[i].legenda; $("#resSel").textContent="Mostrando: "+teamBlobs[i].legenda;
  $("#teamMocks").querySelectorAll("button[data-i]").forEach(x=>x.setAttribute("aria-pressed",x===b)); $("#resImg").scrollIntoView({behavior:"smooth",block:"nearest"}); });
$("#goWhats").addEventListener("click",()=>$("#generate").click());
$("#price").addEventListener("click",e=>{ if(e.target.closest("[data-whats]")) $("#generate").click(); });
$("#generate").addEventListener("click",async()=>{
  if(!state.items.length){ toast("Adicione pelo menos uma arte antes de gerar o mockup."); return; }
  const btn=$("#generate"), label=btn.textContent; btn.disabled=true;
  try{
    if(temNomePorPessoa()){ teamBlobs=await mockupsEquipe(t=>btn.textContent=t); lastBlob=teamBlobs[0].blob; }
    else { teamBlobs=[]; lastBlob=await mockupBlob(); }
  } finally{ btn.disabled=false; btn.textContent=label; }
  track("mockup_gerado",{elementos:state.items.length, kimonos:state.qtd});
  renderTeamMocks();
  $("#resSel").textContent = teamBlobs.length ? "Mostrando: "+teamBlobs[0].legenda : (isEquipe() ? `Os ${state.qtd} kimonos ficam iguais a este.` : "");
  $("#resSel").hidden = !$("#resSel").textContent;
  $("#resTitle").textContent = teamBlobs.length ? "Os mockups da equipe estão prontos" : "Seu mockup está pronto";
  const url=URL.createObjectURL(lastBlob); $("#resImg").src=url;
  const txt=orderText(); $("#resText").value=txt;
  $("#waLink").href=`https://wa.me/${TAP_WHATSAPP}?text=${encodeURIComponent(txt)}`;
  const files=shareFiles();
  const canShare = !isViewer() && navigator.canShare && navigator.canShare({files});
  $("#shareBtn").hidden=!canShare;
  $("#resHint").textContent = canShare ? "Toque em enviar e escolha a conversa com a Tap no WhatsApp. O mockup e os arquivos das suas artes vão juntos." : "Salve a imagem e mande no WhatsApp da Tap junto com os arquivos dos logos. No celular, você também pode segurar a imagem para salvar.";
  $("#resSheet").hidden=false;
});
function fileName(){ const n=(state.dados.nome||"kimono").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/gi,"-").replace(/^-|-$/g,"").toLowerCase(); return `mockup-tap-${n||"kimono"}-${state.color}.png`; }
const slug=s=>String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/gi,"-").replace(/^-|-$/g,"").toLowerCase();
function shareFiles(){
  const out=[];
  if(teamBlobs.length) teamBlobs.forEach((t,i)=>out.push(new File([t.blob],`mockup-tap-${i+1}-${slug(t.pessoa.nome)||"kimono"}-${state.color}.png`,{type:"image/png"})));
  else if(lastBlob) out.push(new File([lastBlob],fileName(),{type:"image/png"}));
  state.items.forEach(it=>{ if(it.file) out.push(it.file); }); return out;
}
$("#shareBtn").addEventListener("click",async()=>{
  try{ await navigator.share({files:shareFiles(), text:orderText()}); }catch(err){ if(err && err.name!=="AbortError") toast("Não deu para compartilhar. Use Salvar imagem."); }
});
$("#saveBtn").addEventListener("click",async()=>{
  if(!lastBlob) return;
  if(isViewer()){
    const dl = await window.claude.use("downloads");
    if(dl){ try{ await dl.save({filename:fileName(), data:lastBlob}); toast("Imagem salva"); }catch(err){ if(err?.code!=="declined") toast("Segure a imagem acima para salvar."); } return; }
    toast("Segure a imagem acima para salvar."); return;
  }
  const a=document.createElement("a"); a.href=URL.createObjectURL(lastBlob); a.download=fileName(); document.body.append(a); a.click(); a.remove();
});
$("#copyBtn").addEventListener("click",async()=>{
  const t=$("#resText"); try{ await navigator.clipboard.writeText(t.value); toast("Resumo copiado"); }catch(e){ t.focus(); t.select(); toast("Texto selecionado. Copie e cole no WhatsApp."); }
});
$$("[data-close]").forEach(b=>b.addEventListener("click",()=>{ $("#"+b.dataset.close).hidden=true; }));
$$(".sheet").forEach(s=>s.addEventListener("click",e=>{ if(e.target===s) s.hidden=true; }));
document.addEventListener("keydown",e=>{ if(e.key==="Escape") $$(".sheet").forEach(s=>s.hidden=true); });
let toastT=0; function toast(m){ const t=$("#toast"); t.textContent=m; t.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>t.hidden=true,2600); }
const isViewer = () => !!(window.claude && typeof window.claude.use==="function");

/* ================== LOJA: CARRINHO DA SHOPIFY ================== */
// Eventos de análise: Google Tag Manager (dataLayer), eventos de cliente da Shopify e Meta Pixel, se existirem na página.
function track(ev,p={}){
  try{ (window.dataLayer=window.dataLayer||[]).push({event:"tapmk_"+ev, ...p}); }catch(e){}
  try{ if(window.Shopify?.analytics?.publish) window.Shopify.analytics.publish("tapmk_"+ev, p); }catch(e){}
  try{ if(typeof window.fbq==="function"){
    if(ev==="adicionar_carrinho") window.fbq("track","AddToCart",{value:p.value, currency:"BRL", content_name:"Kimono personalizado"});
    else window.fbq("trackCustom","Tapmk_"+ev, p); } }catch(e){}
}
const getPath=(o,path)=>path.split(".").reduce((a,k)=>a==null?a:a[k],o);
function applyPriceTexts(){
  $$("[data-kimono-nome]").forEach(el=>el.textContent=KIMONO_NOME);
  $$("[data-expresso-gratis]").forEach(el=>el.textContent = PRECOS.expressoGratisAcima ? ` Grátis em pedidos a partir de ${brl(PRECOS.expressoGratisAcima)}.` : "");
  $$("[data-preco]").forEach(el=>{ const v=getPath(PRECOS,el.dataset.preco); if(typeof v==="number") el.textContent=brl(v); });
  $$("[data-preco-label]").forEach(el=>{ const v=getPath(PRECOS,el.dataset.precoLabel), base=el.label.split(" · ")[0]; el.label= typeof v==="number" ? `${base} · ${brl(v)}` : base; });
}
// Preços e variantes da loja substituem a tabela padrão. Se faltar uma variante, aquela faixa fica "a orçar".
function applyShop(){
  const P=v=>v ? v.preco/100 : null;
  // Faixas e adicionais: variantes "1 kimono" e "2+ kimonos" (já com o desconto), reconhecidas pelo SKU
  for(const id of FAIXAS){ const v=SHOP.faixas?.variantes||{}; PRECOS.faixas[id].preco=[P(v[id+"|1"]),P(v[id+"|2+"])]; }
  for(const t of ["1","2+"]){ const v=SHOP.adicional?.variantes||{}; PRECOS.adicional[t]=[P(v[t+"|1"]),P(v[t+"|2+"])]; }
  if(SHOP.prazo) for(const k of ["expresso","turbo"]){ const v=P(SHOP.prazo.variantes[k]); if(v!=null) PRECOS.prazo[k]=v; }
  if(SHOP.kimono){ const vs=Object.entries(SHOP.kimono.variantes);
    const first=re=>{ const e=vs.find(([k])=>re.test(k.split("|")[1]||"")); return e ? e[1].preco/100 : null; };
    const a=first(/^A/), i=first(/^M/); if(a!=null) PRECOS.kimono.adulto=a; if(i!=null) PRECOS.kimono.infantil=i; }
  if(SHOP.atual && SHOP.proprio && SHOP.atual===SHOP.proprio.handle) state.tipo="proprio";
  if(SHOP.atual && SHOP.kimono && SHOP.atual===SHOP.kimono.handle) state.tipo="brazil";
  $$("[data-shop]").forEach(e=>e.hidden=false);
  $$("[data-solo]").forEach(e=>e.hidden=true);
  $("#step4Title").textContent="Finalizar pedido";
  $("#generate").textContent="Ver o mockup";
  [$("#addCart"),$("#addCart2")].forEach(b=>b.addEventListener("click",()=>addToCart()));
}
function syncVariantUrl(){
  if(!SHOP) return;
  try{ const prod = state.tipo==="brazil" ? SHOP.kimono : SHOP.proprio; if(!prod || prod.handle!==SHOP.atual) return;
    const v=varKimono(state.tipo==="brazil" ? (isEquipe() ? (state.pessoas[0]||{}).tamanho : state.tamanho) : ""); if(!v) return;
    const u=new URL(location.href); u.searchParams.set("variant",v.id); history.replaceState(history.state,"",u); }catch(e){}
}
function varKimono(tam){ return state.tipo==="brazil" ? SHOP.kimono?.variantes[corLabel()+"|"+tam] : SHOP.proprio?.variantes[corLabel()]; }
function linhasCobranca(c){
  const out=[];
  if(c.faixa) out.push({v:SHOP.faixas?.variantes[c.faixa.id+"|"+c.faixa.k], qty:c.faixa.qty});
  if(c.adicional) out.push({v:SHOP.adicional?.variantes[c.adicional.tier+"|"+c.adicional.k], qty:c.adicional.qty});
  if(c.prazo) out.push({v:SHOP.prazo?.variantes[c.prazo], qty:1});   // "expresso-gratis" = variante de R$ 0
  return out;
}
const zapOk = z => String(z||"").replace(/\D/g,"").length>=10;
// O que impede a compra. "soft" = só problemas que não dependem do cliente terminar de preencher.
function cartIssue(soft){
  const {consulta,soNome,cobr}=calcPreco();
  if(consulta) return "Com 7 ou mais logos nas costas, a Tap faz o orçamento. Feche o pedido pelo WhatsApp.";
  if(soNome) return "Pedido só com o nome nas costas é combinado pelo WhatsApp. Toque em \"Falar com a gente no WhatsApp\".";
  if(isEquipe() && state.pessoas.length>MAX_PESSOAS) return `Pelo site dá para pedir até ${MAX_PESSOAS} kimonos. Para mais, fale com a gente no WhatsApp.`;
  if(linhasCobranca(cobr).some(l=>!l.v || !l.v.ok)) return "Essa combinação ainda não está disponível no site. Feche o pedido pelo WhatsApp.";
  if(state.tipo!=="brazil" && !varKimono("")) return "A personalização no seu kimono ainda não está disponível no site. Feche o pedido pelo WhatsApp.";
  for(const k of kimonos()){ if(state.tipo==="brazil" && k.tamanho && k.tamanho!=="ajuda"){ const v=varKimono(k.tamanho);
    if(!v || !v.ok) return `O kimono ${corLabel().toLowerCase()} tamanho ${k.tamanho} está indisponível no site agora. Escolha outro tamanho ou fale com a gente no WhatsApp.`; } }
  if(soft) return null;
  if(!state.items.length) return "Adicione pelo menos uma arte (logo ou nome).";
  if(state.tipo==="brazil" && kimonos().some(k=>!k.tamanho)) return isEquipe() ? "Escolha o tamanho de cada pessoa da equipe." : "Escolha o tamanho do kimono.";
  if(state.tipo==="brazil" && kimonos().some(k=>k.tamanho==="ajuda")) return "Para comprar no site, escolha o tamanho. Se tiver dúvida, fale com a gente no WhatsApp.";
  if(state.items.some(perPersonOn) && state.pessoas.some(p=>!p.nome.trim())) return "Coloque o nome de cada pessoa da equipe.";
  if(!state.dados.nome.trim() || !zapOk(state.dados.zap)) return "Preencha seu nome e WhatsApp (passo 3) para a Tap mandar a arte para aprovação.";
  return null;
}
function focusIssue(){
  const target = !state.items.length ? "#stepArtes" : (state.tipo==="brazil" && kimonos().some(k=>!k.tamanho||k.tamanho==="ajuda")) ? "#stepKimono"
    : (state.items.some(perPersonOn) && state.pessoas.some(p=>!p.nome.trim())) ? "#stepKimono" : (!state.dados.nome.trim()||!zapOk(state.dados.zap)) ? "#stepDados" : null;
  if(!target) return; $("#resSheet").hidden=true; const el=$(target); el.scrollIntoView({behavior:"smooth",block:"start"});
  const f = target==="#stepDados" ? (!state.dados.nome.trim() ? $("#dNome") : $("#dZap")) : null; if(f) setTimeout(()=>f.focus({preventScroll:true}),400);
}
async function uploadFile(file,name,grupo){
  const fd=new FormData(); fd.append("file",file,name); fd.append("upload_preset",UPLOAD.preset);
  fd.append("folder",(UPLOAD.folder||"pedidos")+"/"+grupo); fd.append("tags","tap-pedido,"+grupo);
  const r=await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(UPLOAD.cloud)}/auto/upload`,{method:"POST",body:fd});
  const j=await r.json().catch(()=>({})); if(!r.ok || !j.secure_url) throw new Error(j.error?.message||"upload"); return j.secure_url;
}
// Sobe o mockup e as artes originais. Logos do banco da Tap não precisam subir (a Tap já tem).
async function enviarArquivos(blob,grupo,say,equipe){
  const out={mockup:"", porPessoa:[], arquivos:[], falhou:false};
  if(!UPLOAD || !UPLOAD.cloud || !UPLOAD.preset){ out.falhou=true; return out; }
  try{
    if(equipe && equipe.length){
      for(const [i,t] of equipe.entries()){ say(`Enviando os mockups (${i+1} de ${equipe.length})…`);
        out.porPessoa.push(await uploadFile(t.blob,`mockup-${grupo}-${i+1}-${slug(t.pessoa.nome)||"kimono"}.png`,grupo)); }
      out.mockup=out.porPessoa[0];
    } else { say("Enviando o mockup…"); out.mockup=await uploadFile(blob,`mockup-${grupo}.png`,grupo); }
    const arts=state.items.filter(it=>it.kind==="img" && !it.lib);
    for(const [i,it] of arts.entries()){
      say(`Enviando as artes (${i+1} de ${arts.length})…`);
      const f = it.file || await new Promise(r=>it._src.toBlob(r,"image/png"));
      const nome = it.file ? it.file.name : (it.name||"arte").replace(/\.\w+$/,"")+".png";
      out.arquivos.push({nome, url:await uploadFile(f,nome,grupo)});
    }
  }catch(e){ out.falhou=true; }
  return out;
}
function novoGrupo(){ const a="ABCDEFGHJKMNPQRSTUVWXYZ23456789"; let s=""; const r=crypto.getRandomValues(new Uint8Array(6)); r.forEach(b=>s+=a[b%a.length]); return s; }
function montarLinhas(grupo,links,cobr){
  const d=state.dados, cod="#"+grupo, N=state.qtd;
  const comum={"Prazo":PRAZOS[state.prazo]};
  if(links.mockup && !links.porPessoa.length) comum["Mockup"]=links.mockup;
  links.arquivos.forEach((a,i)=>comum[`Arquivo ${i+1}`]=a.url);
  if(links.falhou) comum["Arquivos"]="Não foram enviados pelo site. A Tap pede no WhatsApp.";
  comum["Contato"]=[d.nome.trim(),d.zap.trim()].filter(Boolean).join(" · ");
  if(d.equipe.trim()) comum["Equipe"]=d.equipe.trim();
  if(d.obs.trim()) comum["Observações"]=d.obs.trim();
  comum["Pedido Tap"]=cod;
  const linhas=kimonos().map((k,i)=>{
    const props={"Cor":corLabel()};
    if(links.porPessoa[i]) props["Mockup"]=links.porPessoa[i];
    if(state.tipo==="brazil") props["Tamanho"]=k.tamanho;
    if(isEquipe() && k.nome.trim()) props["Nome"]=k.nome.trim();
    state.items.forEach((it,i)=>props[`Arte ${i+1}`]=itemLine(it, isEquipe()? k.nome.trim() : null));
    return {id:varKimono(k.tamanho).id, quantity:1, properties:{...props, ...comum, _grupo:grupo, _tap:"kimono"}};
  });
  const para=`${N>1?N+" kimonos":"Kimono"} ${corLabel().toLowerCase()} · Pedido Tap ${cod}`;
  linhasCobranca(cobr).forEach(l=>linhas.push({id:l.v.id, quantity:l.qty, properties:{"Para":para, _grupo:grupo, _tap:"cobranca"}}));
  // Plano do grupo (variante → quantidade): o carrinho confere e desfaz o grupo se alguém mexer nas linhas
  const plano={}; linhas.forEach(l=>plano[l.id]=(plano[l.id]||0)+l.quantity);
  linhas.forEach(l=>{ if(l.properties._tap==="kimono") l.properties._tap_plano=JSON.stringify(plano); });
  return linhas;
}
let adding=false;
async function addToCart(){
  if(adding) return;
  const issue=cartIssue(false);
  if(issue){ $("#cartWarn").hidden=false; $("#cartWarn").textContent=issue; toast(issue); focusIssue(); return; }
  adding=true; const btns=[$("#addCart"),$("#addCart2")], labels=btns.map(b=>b.textContent);
  const say=t=>btns.forEach(b=>b.textContent=t); btns.forEach(b=>b.disabled=true);
  const grupo=novoGrupo();
  try{
    say("Gerando o mockup…");
    const equipe = temNomePorPessoa() && UPLOAD ? await mockupsEquipe(say) : null;
    const blob = equipe ? equipe[0].blob : await mockupBlob();
    const links=await enviarArquivos(blob,grupo,say,equipe);
    say("Adicionando ao carrinho…");
    const {total,cobr}=calcPreco(), items=montarLinhas(grupo,links,cobr);
    // A Shopify mostra no topo o último item adicionado: invertendo, o kimono aparece antes das linhas de cobrança
    const r=await fetch(SHOP.rotas.add,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({items:[...items].reverse()})});
    const j=await r.json().catch(()=>({})); if(!r.ok) throw new Error(j.description||j.message||"");
    // Confere se o total do carrinho bate com o valor mostrado na ferramenta
    const cart=await (await fetch(SHOP.rotas.cart+".js",{headers:{Accept:"application/json"}})).json();
    const doGrupo=cart.items.filter(i=>i.properties && i.properties._grupo===grupo);
    const soma=doGrupo.reduce((a,i)=>a+i.original_line_price,0);
    if(soma!==Math.round(total*100)){
      const updates={}; doGrupo.forEach(i=>updates[i.key]=0);
      await fetch(SHOP.rotas.cart+"/update.js",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({updates})});
      throw new Error("Os preços da loja mudaram. Recarregue a página e tente de novo.");
    }
    track("adicionar_carrinho",{value:total, currency:"BRL", grupo, kimonos:state.qtd, elementos:state.items.length});
    say("Indo para o carrinho…"); location.href=SHOP.rotas.cart;
  }catch(e){
    toast("Não deu para adicionar ao carrinho. "+(e.message||"Tente de novo.")); btns.forEach((b,i)=>{ b.disabled=false; b.textContent=labels[i]; });
  }finally{ adding=false; }
}

/* ================== DRAFT (só neste navegador) ================== */
const KEY="tap-mockup-rascunho-v1";
let saveT=0;
function save(){ clearTimeout(saveT); saveT=setTimeout(()=>{ try{
  const items=state.items.map(it=>{ const o={}; for(const k in it){ if(k[0]!=="_" && k!=="file") o[k]=it[k]; }
    if(it.kind==="img" && !it.lib){ const c=fitCanvas(it._src,1200); o.src=c.toDataURL("image/png"); } return o; });
  localStorage.setItem(KEY, JSON.stringify({color:state.color,tipo:state.tipo,tamanho:state.tamanho,modo:state.modo,pessoas:state.pessoas,prazo:state.prazo,prazoManual:!!state.prazoManual,dados:state.dados,items}));
}catch(e){} },400); }
async function restore(){
  let d=null; try{ d=JSON.parse(localStorage.getItem(KEY)||"null"); }catch(e){}
  if(!d || !d.items) return false;
  state.color=COLORS[d.color]?d.color:"branco"; state.tipo=d.tipo||"brazil"; state.tamanho=d.tamanho||""; state.prazo=d.prazo||"padrao"; state.prazoManual=!!d.prazoManual; Object.assign(state.dados,d.dados||{});
  if(d.modo==="equipe" && Array.isArray(d.pessoas) && d.pessoas.length>1){ state.modo="equipe"; state.pessoas=d.pessoas.slice(0,MAX_PESSOAS).map(p=>({nome:String(p.nome||""),tamanho:String(p.tamanho||"")})); }
  syncQtd();
  for(const o of d.items){
    const it={...o}; delete it.src;
    if(it.kind==="img"){ const uri = it.lib ? (LIB.find(l=>l.key===it.lib)||{}).uri : o.src; if(!uri) continue;
      const img=await loadImg(uri); it._src=fitCanvas(img,1600); it._info=analyze(it._src); }
    it.id=uid++; state.items.push(it);
  }
  return true;
}
function syncForm(){
  $$(".sw").forEach(b=>b.setAttribute("aria-pressed",b.dataset.color===state.color));
  $("#tipoBC").checked=state.tipo==="brazil"; $("#tipoProprio").checked=state.tipo!=="brazil"; $("#sizeField").hidden=state.tipo!=="brazil";
  $$("[data-modo]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.modo===state.modo));
  $("#generate").textContent = isEquipe() ? "Ver os mockups da equipe" : (SHOP ? "Ver o mockup" : "Gerar mockup");
  $("#sizeField").hidden = state.tipo!=="brazil" || isEquipe(); $("#equipeBox").hidden=!isEquipe(); if(isEquipe()) renderEquipe();
  $("#tamanho").value=state.tamanho; $$("input[name=prazo]").forEach(r=>r.checked=r.value===state.prazo); $("#dNome").value=state.dados.nome; $("#dZap").value=state.dados.zap; $("#dEquipe").value=state.dados.equipe; $("#dObs").value=state.dados.obs;
}

/* ================== EXEMPLO ================== */
async function loadExample(){
  state.items=[]; state.sel=null; state.color="branco"; state.modo="um"; state.pessoas=[]; syncQtd(); syncForm(); await ensureColor("branco");
  const lib=k=>LIB.find(l=>l.key===k);
  const wm=await loadImg(lib("sprt_wordmark").uri);
  await addImageFromCanvas(wm,{name:"SPRT", w:wm.naturalWidth,h:wm.naturalHeight,vector:true,lib:"sprt_wordmark",slot:"lapela"});
  addItem({kind:"text",text:"SEU NOME",font:"montserrat",style:"tarja",ink:"#333333",autoInk:false},"costas_nome");
  const t=state.items[state.items.length-1]; t.scale=1.3; t.w=t.base*t.scale; t.y=604; t.moved=true;
  await addImageFromCanvas(wm,{name:"SPRT", w:wm.naturalWidth,h:wm.naturalHeight,vector:true,lib:"sprt_wordmark",slot:"costas_centro"});
  const s=state.items[state.items.length-1]; s.scale=.42; s.w=s.base*s.scale; s.y=668; s.moved=true;
  state.sel=null; state.example=true; setView("todo"); renderList(); dirty();
}
$("#loadExample").addEventListener("click",loadExample);
$("#resetAll").addEventListener("click",()=>{ state.items=[]; state.sel=null; state.example=false; try{localStorage.removeItem(KEY);}catch(e){} addText("SEU NOME"); state.sel=null; renderList(); dirty(); });

/* ================== START ================== */
(async function start(){
  const restored = location.hash==="#exemplo" ? false : await restore();
  if(SHOP) applyShop();
  completaDesconto(); applyPriceTexts(); syncForm(); syncVariantUrl();
  try{ await ensureColor(state.color); }catch(e){ toast("Não consegui carregar a foto do kimono. Confira a internet e recarregue a página."); }
  if(location.hash==="#exemplo") await loadExample();
  else if(!restored){ addText("SEU NOME"); state.sel=null; }
  renderList(); sizeCanvas(); track("abrir",{loja:!!SHOP});
  // Fontes do Google: quando chegarem, refaz os textos
  if(document.fonts){ Promise.all(FONTS.map(f=>document.fonts.load(f.css.replace("{s}",40),"SEU NOME"))).then(()=>{ state.items.forEach(i=>{ if(i.kind==="text") i._bm=null; }); renderList(); dirty(); }).catch(()=>{}); }
})();

})();
