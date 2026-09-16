import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, updateDoc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const firebaseConfig={apiKey:"AIzaSyA1AZlnCYr5cfHG3HDcyvG17jokBnr5lO8",authDomain:"t-shirtstock.firebaseapp.com",projectId:"t-shirtstock",storageBucket:"t-shirtstock.firebasestorage.app",messagingSenderId:"485805702075",appId:"1:485805702075:web:f9d8668ca57d9f58c4229e",measurementId:"G-TXEHB9FGSR"};
const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
const db=getFirestore(app);
const provider=new GoogleAuthProvider();
const SIZE_ORDER=["S","M","L","XL","XXL"];
const $=id=>document.getElementById(id);
let user=null,sessions=[],session=null,rows=[],values=new Map(),states=new Map(),touched=new Set(),searchText="";

function text(v){return String(v??"").trim()}
function n(v){const x=Number(v);return Number.isFinite(x)?Math.max(0,Math.floor(x)):0}
function esc(v){return text(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")}
function enc(v){return encodeURIComponent(text(v))}
function variantId(bodyId,designId,colorId,sizeId){return["tshirt",enc(bodyId),enc(designId),enc(colorId),enc(sizeId)].join("__")}
function inventoryKey(bodyId,designId,colorId,sizeId){return`tshirt:${enc(bodyId)}|${enc(designId)}|${enc(colorId)}|${enc(sizeId)}`}
function parseDetail(value){const p=text(value).split("/").map(x=>x.trim());return{body:p[0]||"",color:p[1]||"",size:p[2]||""}}
function displayName(map,id,fields){const item=map?.[id]||{};for(const field of fields){const value=text(item?.[field]);if(value)return value}return text(id)}
function timestampText(v){try{if(v?.toDate)return v.toDate().toLocaleString("ja-JP")}catch{}const d=new Date(v||"");return Number.isNaN(d.getTime())?"":d.toLocaleString("ja-JP")}
function setMessage(msg,type=""){const el=$("message");if(!el)return;el.textContent=msg;el.className=`status ${type}`.trim()}
function makeId(prefix){return globalThis.crypto?.randomUUID?`${prefix}_${globalThis.crypto.randomUUID()}`:`${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,10)}`}
function isKnown(id){return states.get(id)==="known"}
function setKnown(id,value){values.set(id,n(value));states.set(id,"known");touched.add(id)}
function setUnknown(id){states.set(id,"unknown");touched.add(id)}
function countSummary(){let knownCount=0,unknownCount=0,totalQty=0;rows.forEach(r=>{if(isKnown(r.variantId)){knownCount++;totalQty+=n(values.get(r.variantId))}else unknownCount++});return{knownCount,unknownCount,totalQty}}
function relevantFlowEntries(data){return(Array.isArray(data?.inventoryCount?.flowEntries)?data.inventoryCount.flowEntries:[]).filter(x=>["restock","opening_correction"].includes(text(x?.type)))}
function soldSnapshot(data){const src=data?.inventoryCount?.soldByVariant;return src&&typeof src==="object"&&!Array.isArray(src)?Object.fromEntries(Object.entries(src).map(([k,v])=>[text(k),n(v)]).filter(([k])=>k)):{} }

async function loadSessions(){
  const snap=await getDocs(collection(db,"salesSessions"));
  sessions=snap.docs.map(d=>({sessionId:d.id,...d.data()})).filter(s=>(s.status==="open"||s.status==="pending_allocation")&&Array.isArray(s?.inventoryCount?.opening?.items));
  sessions.sort((a,b)=>text(b.startDate).localeCompare(text(a.startDate)));
  $("sessionSelect").innerHTML='<option value="">イベントを選択</option>'+sessions.map(s=>`<option value="${esc(s.sessionId)}">${esc(s.eventName||s.sessionId)}${s.status==="pending_allocation"?"（仮終了中）":""}</option>`).join("");
  const requested=new URLSearchParams(location.search).get("session");
  if(requested&&sessions.some(s=>s.sessionId===requested)){$("sessionSelect").value=requested;await chooseSession(requested)}
}

function masterRows(master){
  const m=master?.masters||{},bodies=m.bodies||{},designs=m.designs||{},colors=m.colors||{},sizes=m.sizes||{},result=[];
  Object.entries(master?.inventory_v2||{}).forEach(([bodyId,designTree])=>{
    if(bodyId==="body_unassigned")return;
    Object.entries(designTree||{}).forEach(([designId,colorTree])=>Object.entries(colorTree||{}).forEach(([colorId,sizeTree])=>Object.entries(sizeTree||{}).forEach(([sizeId])=>result.push({variantId:variantId(bodyId,designId,colorId,sizeId),category:"tshirt",inventorySource:"tshirt",inventoryKey:inventoryKey(bodyId,designId,colorId,sizeId),sku:variantId(bodyId,designId,colorId,sizeId),bodyId,designId,colorId,sizeId,body:displayName(bodies,bodyId,["managementName","salesName"]),design:displayName(designs,designId,["managementName","legacyKey","salesName"]),color:displayName(colors,colorId,["managementName","legacyKey","pinkoiName"]),size:displayName(sizes,sizeId,["managementName","salesName"]),sizeOrder:Number(sizes?.[sizeId]?.order||999)}))));
  });
  return result;
}

function buildRows(data,master,variantDocs){
  const opening=(data?.inventoryCount?.opening?.items||[]).filter(x=>x.category==="tshirt"&&x.inventorySource==="tshirt");
  const openingMap=new Map(opening.map(x=>[x.variantId,x]));
  const closingMap=new Map((data?.inventoryCount?.closing?.items||[]).map(x=>[x.variantId,x]));
  const draftMap=new Map((data?.inventoryCount?.externalCounts?.tshirt?.draftItems||[]).map(x=>[x.variantId,x]));
  const variantMap=new Map(variantDocs.filter(v=>v.category==="tshirt"&&v.inventorySource==="tshirt"&&v.active!==false).map(v=>[v.variantId||v.id,v]));
  const all=new Map();
  masterRows(master).forEach(row=>all.set(row.variantId,row));
  variantMap.forEach((v,id)=>{
    if(all.has(id))return;
    const target=text(v.inventoryKey).startsWith("tshirt:")?text(v.inventoryKey).slice(7).split("|").map(x=>decodeURIComponent(x)):[];
    all.set(id,{variantId:id,category:"tshirt",inventorySource:"tshirt",inventoryKey:v.inventoryKey||"",sku:v.sku||id,bodyId:v.bodyId||target[0]||"",designId:v.designId||target[1]||"",colorId:v.colorId||target[2]||"",sizeId:v.sizeId||target[3]||"",body:v.body||"",design:v.design||v.displayName||"Tシャツ",color:v.color||"",size:v.size||"",sizeOrder:Number(v.sizeOrder||999)});
  });
  opening.forEach(item=>{if(all.has(item.variantId))return;const d=parseDetail(item.detail);all.set(item.variantId,{...item,body:d.body,color:d.color,size:d.size,design:item.label||"Tシャツ",sizeOrder:SIZE_ORDER.indexOf(d.size)})});
  rows=[...all.values()].map(base=>{const open=openingMap.get(base.variantId),d=open?parseDetail(open.detail):null,v=variantMap.get(base.variantId);return{...base,label:open?.label||base.design||v?.design||v?.displayName||"Tシャツ",body:open?d.body:(base.body||v?.body||""),color:open?d.color:(base.color||v?.color||""),size:open?d.size:(base.size||v?.size||""),detail:open?.detail||[base.body||v?.body,base.color||v?.color,base.size||v?.size].filter(Boolean).join(" / "),openingQty:n(open?.openingQty),registered:variantMap.has(base.variantId),inOpening:openingMap.has(base.variantId),closing:closingMap.get(base.variantId)||null,draft:draftMap.get(base.variantId)||null}});
  rows.sort((a,b)=>(n(b.openingQty)>0)-(n(a.openingQty)>0)||(b.registered?1:0)-(a.registered?1:0)||text(a.label).localeCompare(text(b.label),"ja")||text(a.body).localeCompare(text(b.body),"ja")||text(a.color).localeCompare(text(b.color),"ja")||SIZE_ORDER.indexOf(a.size)-SIZE_ORDER.indexOf(b.size));
  values=new Map();states=new Map();touched=new Set();
  rows.forEach(row=>{const source=row.draft||row.closing;const unknown=source?.countStatus==="unknown"||source?.closingQty===null||source?.closingQty===undefined||source?.closingQty==="";if(source&&!unknown){values.set(row.variantId,n(source.closingQty));states.set(row.variantId,"known")}else{values.set(row.variantId,0);states.set(row.variantId,"unknown")}});
}

function groups(){
  const map=new Map();
  rows.forEach(row=>{const key=[row.label,row.body,row.color].join("||");if(!map.has(key))map.set(key,{design:row.label||"Tシャツ",body:row.body,color:row.color,items:[],openingTotal:0,registered:false});const g=map.get(key);g.items.push(row);g.openingTotal+=n(row.openingQty);g.registered=g.registered||row.registered});
  return[...map.values()].sort((a,b)=>(b.openingTotal>0)-(a.openingTotal>0)||(b.registered?1:0)-(a.registered?1:0)||a.design.localeCompare(b.design,"ja")||a.body.localeCompare(b.body,"ja")||a.color.localeCompare(b.color,"ja"));
}

function render(){
  const q=searchText.toLocaleLowerCase("ja");
  const head=`<div class="mhead"><div class="name">Design / Body / Color</div>${SIZE_ORDER.map(s=>`<div class="sizeh">${s}</div>`).join("")}</div>`;
  const body=groups().map(g=>{const match=!q||`${g.design} ${g.body} ${g.color}`.toLocaleLowerCase("ja").includes(q);const badge=g.openingTotal>0?'<span class="badge stocked">開始在庫あり</span>':g.registered?'<span class="badge registered">登録SKU</span>':'<span class="badge">その他SKU</span>';return`<div class="mrow ${g.openingTotal>0?"stocked":""} ${match?"":"group-hidden"}"><div class="name"><div class="design">${esc(g.design)}</div><div class="detail">${esc([g.body,g.color].filter(Boolean).join(" / "))}</div>${badge}</div>${SIZE_ORDER.map(size=>{const item=g.items.find(x=>x.size===size);if(!item)return'<div class="cell missing">—</div>';const known=isKnown(item.variantId),value=known?String(n(values.get(item.variantId))):"";return`<div class="cell ${known?"known":"unknown"}" data-id="${esc(item.variantId)}"><div class="open">開始 ${n(item.openingQty)} / ${known?"確認済":"不明"}</div><input class="qty" data-id="${esc(item.variantId)}" type="number" inputmode="numeric" min="0" step="1" value="${value}" placeholder="不明"><div class="step"><button type="button" data-step="-1" data-id="${esc(item.variantId)}">−</button><button type="button" data-step="1" data-id="${esc(item.variantId)}">＋</button></div><div class="state-tools"><button type="button" class="state-btn ${!known?"active":""}" data-state="unknown" data-id="${esc(item.variantId)}">不明</button><button type="button" class="state-btn ${known&&n(values.get(item.variantId))===0?"active zero":""}" data-state="zero" data-id="${esc(item.variantId)}">0</button></div></div>`}).join("")}</div>`}).join("");
  $("matrix").innerHTML=head+body;bindInputs();updateSummary();
  const sum=countSummary();$("sortNote").textContent=`全 ${rows.length} SKU / 確認済 ${sum.knownCount} / 不明 ${sum.unknownCount}`;
  const ext=session?.inventoryCount?.externalCounts?.tshirt;$("draftInfo").textContent=ext?.status==="partial"?`一部確定: 確認済 ${ext.knownCount||0} / 不明 ${ext.unknownCount||0}`:ext?.status==="confirmed"?`前回確定: ${timestampText(ext.confirmedAt)||"保存済み"}`:ext?.status==="draft"?`途中保存あり: ${timestampText(ext.savedAt)||"保存済み"}`:"";
}

function bindInputs(){
  document.querySelectorAll(".qty").forEach(input=>input.addEventListener("input",()=>{const id=input.dataset.id;if(input.value===""){setUnknown(id)}else{setKnown(id,input.value)}updateSummary();refreshCell(id)}));
  document.querySelectorAll("[data-step]").forEach(btn=>btn.addEventListener("click",()=>{const id=btn.dataset.id,current=isKnown(id)?n(values.get(id)):0,next=Math.max(0,current+Number(btn.dataset.step));setKnown(id,next);render()}));
  document.querySelectorAll("[data-state]").forEach(btn=>btn.addEventListener("click",()=>{const id=btn.dataset.id;if(btn.dataset.state==="unknown")setUnknown(id);else setKnown(id,0);render()}));
}
function refreshCell(id){const cell=document.querySelector(`.cell[data-id="${CSS.escape(id)}"]`);if(!cell)return;const known=isKnown(id);cell.classList.toggle("known",known);cell.classList.toggle("unknown",!known);const open=cell.querySelector(".open"),row=rows.find(r=>r.variantId===id);if(open&&row)open.textContent=`開始 ${n(row.openingQty)} / ${known?"確認済":"不明"}`;cell.querySelectorAll(".state-btn").forEach(b=>{b.classList.toggle("active",b.dataset.state==="unknown"?!known:(known&&n(values.get(id))===0));b.classList.toggle("zero",b.dataset.state==="zero"&&known&&n(values.get(id))===0)})}
function updateSummary(){const s=countSummary();$("knownStat").textContent=s.knownCount;$("unknownStat").textContent=s.unknownCount;$("qtyStat").textContent=s.totalQty;$("openingStat").textContent=rows.reduce((sum,r)=>sum+n(r.openingQty),0)}
function closingItems(){return rows.map(r=>({variantId:r.variantId,closingQty:isKnown(r.variantId)?n(values.get(r.variantId)):null,countStatus:isKnown(r.variantId)?"known":"unknown"}))}
function checkpointItems(){return rows.filter(r=>touched.has(r.variantId)&&isKnown(r.variantId)).map(r=>({variantId:r.variantId,physicalQty:n(values.get(r.variantId)),countStatus:"known"}))}

async function chooseSession(id){
  setMessage("");
  const [snap,masterSnap,variantSnap]=await Promise.all([getDoc(doc(db,"salesSessions",id)),getDoc(doc(db,"tshirtStock","master")),getDocs(collection(db,"productVariants"))]);
  if(!snap.exists())throw new Error("イベントが見つかりません。");if(!masterSnap.exists())throw new Error("Tシャツ在庫マスターが見つかりません。");
  session={sessionId:id,...snap.data()};buildRows(session,masterSnap.data(),variantSnap.docs.map(d=>({id:d.id,...d.data()})));
  $("eventMeta").textContent=[session.eventName,session.city,session.country,session.startDate&&session.endDate?`${session.startDate}〜${session.endDate}`:""].filter(Boolean).join(" / ");
  $("countPanel").classList.toggle("hidden",!rows.length);render();
  const canCheckpoint=session.status==="open";$("saveCheckpointButton").disabled=!canCheckpoint;$("saveDailyButton").disabled=!canCheckpoint;
}

async function saveCheckpoint(type){
  if(!session)return;if(session.status!=="open")throw new Error("POS停止後は途中カウントを追加できません。");
  const items=checkpointItems(),unknownTouched=[...touched].filter(id=>!isKnown(id)).length;
  const ref=doc(db,"salesSessions",session.sessionId);let saved=null;
  await runTransaction(db,async tx=>{const snap=await tx.get(ref);if(!snap.exists())throw new Error("イベントが見つかりません。");const current=snap.data();if(current.status!=="open")throw new Error("販売中のイベントだけ保存できます。");const checkpoints=Array.isArray(current?.inventoryCount?.checkpoints)?current.inventoryCount.checkpoints:[];saved={id:makeId("count"),type:type==="daily_close"?"daily_close":"checkpoint",label:type==="daily_close"?new Date().toLocaleDateString("ja-JP"):"Tシャツ",capturedAtIso:new Date().toISOString(),capturedByEmail:user?.email||"",scope:"tshirt",source:"tshirt_stock_app",flowEntryCountAtCapture:relevantFlowEntries(current).length,soldByVariantSnapshot:soldSnapshot(current),items,skippedUnknownCount:unknownTouched};tx.update(ref,{"inventoryCount.checkpoints":[...checkpoints,saved],"inventoryCount.checkpointUpdatedAt":serverTimestamp(),"inventoryCount.updatedAt":serverTimestamp(),updatedAt:serverTimestamp()})});
  touched.clear();setMessage(`${type==="daily_close"?"日次締め":"途中カウント"}を保存しました。確認済 ${items.length} SKU、不明は不明のままです。`,"ok");render();
}

async function saveDraft(){
  if(!session)return;setMessage("保存中…");const items=closingItems(),s=countSummary();
  await updateDoc(doc(db,"salesSessions",session.sessionId),{"inventoryCount.externalCounts.tshirt":{status:"draft",source:"tshirt_stock_app",savedAt:serverTimestamp(),savedByEmail:user?.email||"",draftItems:items,totalSkuCount:items.length,knownCount:s.knownCount,unknownCount:s.unknownCount,totalQty:s.totalQty},"inventoryCount.updatedAt":serverTimestamp(),updatedAt:serverTimestamp()});
  setMessage(`途中保存しました。確認済 ${s.knownCount} SKU / 不明 ${s.unknownCount} SKU。`,"ok");await chooseSession(session.sessionId);
}

async function confirmCount(){
  if(!session)return;const items=closingItems(),s=countSummary();
  if(!confirm(`Tシャツ棚卸を確定します。\n\n確認済 ${s.knownCount} SKU / 不明 ${s.unknownCount} SKU\n確認済点数 ${s.totalQty}\n\n不明は0にせず、不明のまま保存します。`))return;
  setMessage("確定中…");const ref=doc(db,"salesSessions",session.sessionId);
  await runTransaction(db,async tx=>{const snap=await tx.get(ref);if(!snap.exists())throw new Error("イベントが見つかりません。");const current=snap.data();if(current.status!=="open"&&current.status!=="pending_allocation")throw new Error("正式終了済みイベントは変更できません。");const currentOpening=current?.inventoryCount?.opening?.items||[],openingIds=new Set(currentOpening.map(x=>x.variantId)),completedOpening=[...currentOpening];rows.forEach(row=>{if(openingIds.has(row.variantId))return;completedOpening.push({variantId:row.variantId,category:"tshirt",inventorySource:"tshirt",inventoryKey:row.inventoryKey||"",sku:row.sku||row.variantId,label:row.label||"Tシャツ",detail:row.detail||[row.body,row.color,row.size].filter(Boolean).join(" / "),openingQty:0});openingIds.add(row.variantId)});const ids=new Set(rows.map(r=>r.variantId)),existing=current?.inventoryCount?.closing?.items||[],existingMap=new Map(existing.map(x=>[x.variantId,x])),preserved=existing.filter(x=>!ids.has(x.variantId));const merged=items.map(x=>({...existingMap.get(x.variantId),variantId:x.variantId,closingQty:x.closingQty,countStatus:x.countStatus,loss:n(existingMap.get(x.variantId)?.loss),theft:n(existingMap.get(x.variantId)?.theft),damage:n(existingMap.get(x.variantId)?.damage),gift:n(existingMap.get(x.variantId)?.gift),sample:n(existingMap.get(x.variantId)?.sample),stockAdjustment:Number(existingMap.get(x.variantId)?.stockAdjustment||0)}));tx.update(ref,{"inventoryCount.opening.items":completedOpening,"inventoryCount.closing":{savedAt:serverTimestamp(),savedByEmail:user?.email||"",items:[...preserved,...merged]},"inventoryCount.externalCounts.tshirt":{status:s.unknownCount>0?"partial":"confirmed",source:"tshirt_stock_app",confirmedAt:serverTimestamp(),confirmedByEmail:user?.email||"",countedCount:s.knownCount,knownCount:s.knownCount,unknownCount:s.unknownCount,totalSkuCount:merged.length,totalQty:s.totalQty},"inventoryCount.updatedAt":serverTimestamp(),updatedAt:serverTimestamp()})});
  setMessage(s.unknownCount>0?`一部確定しました。不明 ${s.unknownCount} SKUは未確認のままです。`:"棚卸を確定しました。","ok");await chooseSession(session.sessionId);
}

$("loginButton").addEventListener("click",()=>signInWithPopup(auth,provider));
$("sessionSelect").addEventListener("change",e=>e.target.value?chooseSession(e.target.value):$("countPanel").classList.add("hidden"));
$("reloadButton").addEventListener("click",()=>session&&chooseSession(session.sessionId));
$("copyOpeningButton").addEventListener("click",()=>{rows.forEach(r=>setKnown(r.variantId,r.openingQty));render()});
$("zeroAllButton").addEventListener("click",()=>{rows.forEach(r=>setKnown(r.variantId,0));render()});
$("unknownAllButton").addEventListener("click",()=>{rows.forEach(r=>setUnknown(r.variantId));render()});
$("searchInput").addEventListener("input",e=>{searchText=text(e.target.value);render()});
$("saveCheckpointButton").addEventListener("click",()=>saveCheckpoint("checkpoint").catch(e=>setMessage(e.message||String(e),"err")));
$("saveDailyButton").addEventListener("click",()=>saveCheckpoint("daily_close").catch(e=>setMessage(e.message||String(e),"err")));
$("saveDraftButton").addEventListener("click",()=>saveDraft().catch(e=>setMessage(e.message||String(e),"err")));
$("confirmButton").addEventListener("click",()=>confirmCount().catch(e=>setMessage(e.message||String(e),"err")));

onAuthStateChanged(auth,async current=>{user=current;$("authText").textContent=current?`ログイン中: ${current.email||""}`:"イベント棚卸を使うにはログインしてください。";$("loginButton").classList.toggle("hidden",Boolean(current));$("mainPanel").classList.toggle("hidden",!current);if(current){try{await loadSessions()}catch(e){$("authText").textContent=`読込エラー: ${e.message||e}`}}});
