let rows=[],running=false,pagesDone=0;

const $=id=>document.getElementById(id);
const clean=s=>String(s??"").replace(/\s+/g," ").trim();

function numericValue(raw){
  let s=clean(raw).replace(/,/g,"").replace(/\s+/g,"").toUpperCase();
  if(!s)return null;
  // Accept values such as 512M, 35B, 26.8K, 199M, 0.
  const m=s.match(/^(-?\d+(?:\.\d+)?)([KMBT])?$/);
  if(!m)return null;
  const n=Number(m[1]);
  const mult={K:1e3,M:1e6,B:1e9,T:1e12}[m[2]]||1;
  return Number.isFinite(n)?Math.round(n*mult):null;
}

function metricAfter(text,label,nextLabels=[]){
  const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const stop=nextLabels.length?nextLabels.map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|"):"$";
  const re=new RegExp(escaped+"\\s*[:\\-]?\\s*([0-9][0-9,]*(?:\\.\\d+)?\\s*[KMBT]?)(?=\\s*(?:"+stop+")|\\s*$)","i");
  const m=text.match(re);
  return m?numericValue(m[1]):null;
}

function extractCountry(card){
  const imgs=[...card.querySelectorAll("img")];
  for(const img of imgs){
    const s=clean(img.getAttribute("alt")||img.getAttribute("title")||"");
    if(s && !/logo|avatar|profile|youtube/i.test(s))return s;
  }
  const flag=card.querySelector('[aria-label]');
  if(flag){
    const s=clean(flag.getAttribute("aria-label"));
    if(s)return s;
  }
  return "";
}

function cardFromAnchor(a){
  // Walk upward looking for a reasonably sized container containing metrics.
  let el=a;
  for(let i=0;i<7 && el;i++,el=el.parentElement){
    const t=clean(el.textContent);
    if(/Subscribers/i.test(t) && /Views/i.test(t) && /Videos/i.test(t) && t.length<2500)return el;
  }
  return a.parentElement;
}

function parsePage(html,baseUrl){
 const doc=new DOMParser().parseFromString(html,"text/html");
 const out=[],seen=new Set();
 const anchors=[...doc.querySelectorAll("a[href]")];

 for(const a of anchors){
   const text=clean(a.textContent);
   const rm=text.match(/#\s*(\d+)\s+(.+?)(?=\s+\d+(?:\.\d+)?\s*[KMBT]?\s*subs?\b|$)/i);
   if(!rm)continue;

   const rank=Number(rm[1]);
   let name=clean(rm[2]).replace(/\s+subs?\b.*$/i,"");
   if(!name)continue;

   const card=cardFromAnchor(a);
   const cardText=clean(card?.textContent||text);
   const key=name.toLowerCase();
   if(seen.has(key))continue;

   let subs=metricAfter(cardText,"Subscribers",["Views","Videos"]);
   let views=metricAfter(cardText,"Views",["Videos"]);
   let videos=metricAfter(cardText,"Videos",[]);

   // Ranking cards may contain only "512M subs". Preserve subscriber data.
   if(subs===null){
     const sm=text.match(/(\d+(?:\.\d+)?\s*[KMBT]?)\s*subs?/i);
     if(sm)subs=numericValue(sm[1]);
   }

   const href=a.getAttribute("href");
   let channelUrl="";
   try{channelUrl=href?new URL(href,baseUrl).href:""}catch{}

   const country=extractCountry(card||a);

   seen.add(key);
   out.push({rank,name,subscribers:subs??0,views:views??0,videos:videos??0,country,channelUrl});
 }
 return out;
}

function dedupe(){
 if($("dupes").value==="keep")return;
 const seen=new Set(),out=[];
 for(const r of rows){
   const key=(r.channelUrl||r.name).toLowerCase();
   if(seen.has(key))continue;
   seen.add(key);out.push(r);
 }
 rows=out;
}

function apply(){
 dedupe();
 const s=$("sort").value;
 if(s==="rank")rows.sort((a,b)=>a.rank-b.rank);
 if(s==="subs")rows.sort((a,b)=>b.subscribers-a.subscribers);
 if(s==="views")rows.sort((a,b)=>b.views-a.views);
 if(s==="videos")rows.sort((a,b)=>b.videos-a.videos);
 if(s==="name")rows.sort((a,b)=>a.name.localeCompare(b.name));
 render();
}

function render(){
 const tb=$("tbody");tb.innerHTML="";
 for(const r of rows){
   const tr=document.createElement("tr");
   [r.rank?"#"+r.rank:"",r.name,String(r.subscribers),String(r.views),String(r.videos),r.country,r.channelUrl].forEach(v=>{
     const td=document.createElement("td");td.textContent=v;tr.appendChild(td);
   });
   tb.appendChild(tr);
 }
 $("records").textContent=rows.length.toLocaleString("en-US");
 $("pagesDone").textContent=pagesDone.toLocaleString("en-US");
 $("subsTotal").textContent=Math.round(rows.reduce((a,r)=>a+r.subscribers,0)).toLocaleString("en-US");
 $("withViews").textContent=rows.filter(r=>r.views>0).length.toLocaleString("en-US");
}

function status(msg,state){
 $("status").textContent=msg;$("state").textContent=state;
}

function makePageUrl(input,page){
 const u=new URL(input);
 u.searchParams.set("page",page);
 u.searchParams.set("limit",$("limit").value||100);
 return u.href;
}

async function fetchPage(target){
 const api="/api/fetch?url="+encodeURIComponent(target);
 const res=await fetch(api);
 const type=res.headers.get("content-type")||"";
 if(!res.ok){
   let msg="HTTP "+res.status;
   try{const j=await res.json();msg=j.error+(j.detail?" — "+j.detail:"")}catch{}
   throw new Error(msg);
 }
 if(!type.includes("html"))throw new Error("Worker did not return HTML.");
 return await res.text();
}

async function collect(){
 if(running)return;
 running=true;rows=[];pagesDone=0;render();
 const input=$("url").value.trim();
 const total=Math.min(1000,Math.max(1,Number($("pages").value)||1));
 const delay=Math.max(1000,Number($("delay").value)||2000);

 for(let p=1;p<=total && running;p++){
   const target=makePageUrl(input,p);
   status("Fetching page "+p+" of "+total+"…\n"+target,"Running");
   try{
     const html=await fetchPage(target);
     const got=parsePage(html,target);
     if(!got.length)throw new Error("No ranking channel cards were detected on this page.");
     rows.push(...got);
     dedupe();
     pagesDone=p;
     $("bar").style.width=(p/total*100)+"%";
     render();
     status("Page "+p+" complete. Added "+got.length+" detected rows.\nUnique records: "+rows.length,"Running");
   }catch(e){
     running=false;
     status("Stopped on page "+p+".\n"+e.message+"\n\nIf the source blocks the Worker request, collection cannot continue until the source permits the request.","Error");
     return;
   }
   if(p<total)await new Promise(r=>setTimeout(r,delay));
 }
 running=false;apply();
 status("Finished. "+rows.length+" unique records collected.","Done");
}

function esc(v){return '"'+String(v??"").replace(/"/g,'""')+'"'}
function download(text,name,type){
 const blob=new Blob([text],{type}),a=document.createElement("a");
 a.href=URL.createObjectURL(blob);a.download=name;a.click();
 setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

$("start").onclick=collect;
$("stop").onclick=()=>{running=false;status("Stopped.","Stopped")};
$("clear").onclick=()=>{running=false;rows=[];pagesDone=0;$("bar").style.width="0%";render();status("Cleared.","Ready")};
$("apply").onclick=apply;

$("csv").onclick=()=>{
 if(!rows.length)return alert("No records to export.");
 const header="Rank,Channel,Subscribers,Views,Videos,Country,Channel URL\n";
 const body=rows.map(r=>[
   r.rank,r.name,r.subscribers,r.views,r.videos,r.country,r.channelUrl
 ].map(esc).join(",")).join("\n");
 download("\ufeff"+header+body,($("filename").value||"socialcounts-ranking")+".csv","text/csv;charset=utf-8");
};

$("json").onclick=()=>{
 if(!rows.length)return alert("No records to export.");
 download(JSON.stringify(rows,null,2),($("filename").value||"socialcounts-ranking")+".json","application/json;charset=utf-8");
};

render();
    
