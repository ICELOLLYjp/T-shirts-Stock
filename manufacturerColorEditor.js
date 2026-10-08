(function(root){
 'use strict';
 const copy=x=>JSON.parse(JSON.stringify(x)), key=r=>r.bodyId+'|'+r.colorId;
 const signature=master=>JSON.stringify([master.masters?.bodies,master.masters?.colors,master.manufacturer_color_links,master.purchase_item_mappings]);
 const aliases=r=>[r.colorCode,r.colorSymbol].filter(Boolean).map(code=>r.productCode+'|'+code);
 function plan(master,expected,rows,models,operationId,at){
  if(signature(master)!==expected)throw Error('マスターまたは対応が変わりました。読み直して確認してください。');
  if(!Array.isArray(rows)||!rows.length||rows.length>200||new Set(rows.map(key)).size!==rows.length)throw Error('確認する行を選んでください。');
  if(!/^[a-f0-9]{32}$/.test(operationId)||!Number.isFinite(Date.parse(at)))throw Error('操作情報を確認してください。');
  const old=master.manufacturer_color_links||{schemaVersion:1,revision:0,items:{},history:[]};
  if(old.schemaVersion!==1||!Number.isSafeInteger(old.revision)||old.revision<0||!old.items||Array.isArray(old.items)||!Array.isArray(old.history)||old.history.length>=1000)throw Error('共通対応の形式または履歴上限を確認してください。');
  const store=copy(old),purchase=copy(master.purchase_item_mappings||{}),changes=[];
  for(const input of rows){
   const body=master.masters?.bodies?.[input.bodyId],color=master.masters?.colors?.[input.colorId];
   if(!body||body.id!==input.bodyId||!color||color.id!==input.colorId)throw Error('固定IDを確認できません。');
   const model=models.find(m=>m.model===input.productCode),official=model?.colors.find(c=>c.code===input.colorCode);
   if(!official)throw Error('確認済みメーカー品番と正式カラーを選んでください。');
   const k=key(input),before=store.items[k]||null;
   if(before&&(!Number.isSafeInteger(before.version)||before.version<1||before.bodyId!==input.bodyId||before.colorId!==input.colorId))throw Error('保存済み固定IDが一致しません。');
   const next={bodyId:input.bodyId,colorId:input.colorId,supplierId:model.supplierId,productCode:model.model,colorCode:official.code,officialName:official.name,colorSymbol:official.symbol||'',sourceUrl:model.url,sourceCheckedDate:model.checked,confirmedDate:new Date(Date.parse(at)+9*3600000).toISOString().slice(0,10),updatedAt:at,version:(before?.version||0)+1};
   if(before&&['supplierId','productCode','colorCode','officialName','colorSymbol','sourceUrl','sourceCheckedDate'].every(f=>before[f]===next[f]))continue;
   store.items[k]=next;changes.push({key:k,before,after:next});
  }
  if(!changes.length)return null;
  for(const bodyId of new Set(changes.map(c=>c.after.bodyId))){
   if(new Set(Object.values(store.items).filter(r=>r.bodyId===bodyId).map(r=>r.supplierId+'|'+r.productCode)).size>1)throw Error('同じボディには同じメーカー品番を設定してください。変更する場合は対象色をまとめて選びます。');
  }
  // Remove obsolete compatibility keys only when owned by the changed row.
  for(const change of changes)for(const alias of change.before?aliases(change.before):[]){
   if(Object.values(store.items).some(r=>aliases(r).includes(alias)))continue;
   const p=purchase[alias];if(p?.bodyId===change.after.bodyId&&p?.colorId===change.after.colorId)delete purchase[alias];
  }
  for(const change of changes)for(const alias of aliases(change.after)){
   const candidates=Object.values(store.items).filter(r=>aliases(r).includes(alias));
   if(candidates.some(r=>key(r)!==change.key))throw Error('同じメーカー色に複数の内部IDがあります。仕入れ登録先を個別確認してください。');
   const p=purchase[alias];if(p&&(p.bodyId!==change.after.bodyId||p.colorId!==change.after.colorId))throw Error('仕入れ対応と競合しています。保存していません。');
   if(!p)purchase[alias]={product:change.after.productCode,supplierColor:alias.split('|')[1],supplierLabel:change.after.officialName,bodyId:change.after.bodyId,colorId:change.after.colorId,updatedAt:at};
  }
  store.revision++;store.history.push({operationId,revision:store.revision,updatedAt:at,changes});
  return {manufacturer_color_links:store,purchase_item_mappings:purchase};
 }
 function mount({panel,getMaster,save,models}){
  let baseline='',busy=false,dirty=false,blocked=false;
  const node=(tag,t)=>{const n=document.createElement(tag);if(t!==undefined)n.textContent=t;return n;};
  const status=node('p'),list=node('div'),review=node('div'),reload=node('button','最新の対応を読み直す'),preview=node('button','選んだ行の変更を確認'),commit=node('button','確認した行を一括保存');
  commit.disabled=true;for(const b of [reload,preview,commit])b.type='button';
  panel.append(node('h3','メーカー品番・正式カラーの一括確認'),node('p','現在の名前と固定IDを保持して対応だけを保存します。標準Body、在庫数量、SKUは変更しません。'),reload,list,preview,review,commit,status);
  const drafts=()=>[...list.querySelectorAll('[data-pair]')].filter(n=>n.querySelector('input').checked).map(n=>({bodyId:n.dataset.body,colorId:n.dataset.color,productCode:n.querySelector('[data-model]').value,colorCode:n.querySelector('[data-official]').value}));
  function render(){
   const master=getMaster();if(!master){status.textContent='マスターへ接続してください。';return;}
   baseline=signature(master);list.replaceChildren();review.replaceChildren();dirty=false;blocked=false;commit.disabled=true;
   const pairs=new Map();for(const color of Object.values(master.masters?.colors||{}))if(master.masters?.bodies?.[color.bodyId])pairs.set(color.bodyId+'|'+color.id,{bodyId:color.bodyId,colorId:color.id});
   for(const r of Object.values(master.manufacturer_color_links?.items||{}))pairs.set(key(r),r);
   for(const [bodyId,designs] of Object.entries(master.inventory_v2||{}))for(const colors of Object.values(designs))for(const colorId of Object.keys(colors))pairs.set(bodyId+'|'+colorId,{bodyId,colorId});
   for(const p of pairs.values()){
    if(!master.masters?.bodies?.[p.bodyId]||!master.masters?.colors?.[p.colorId])continue;
    const row=node('fieldset');row.dataset.pair=key(p);row.dataset.body=p.bodyId;row.dataset.color=p.colorId;
    const saved=master.manufacturer_color_links?.items?.[key(p)],label=node('label'),check=node('input');check.type='checkbox';label.append(check,document.createTextNode(' この行を確認・保存'));row.append(node('legend',(master.masters.bodies[p.bodyId].managementName||p.bodyId)+' / '+(master.masters.colors[p.colorId].managementName||p.colorId)),node('small',key(p)),label);
    const select=node('select');select.dataset.model='true';select.setAttribute('aria-label','メーカー品番');select.append(new Option('品番を選択',''));models.forEach(m=>select.append(new Option(m.model,m.model)));select.value=saved?.productCode||'';
    const official=node('select');official.dataset.official='true';official.setAttribute('aria-label','正式カラー');
    const colors=(value='')=>{official.replaceChildren(new Option('正式カラーを選択',''));models.find(m=>m.model===select.value)?.colors.forEach(c=>official.append(new Option(c.code+' '+c.name,c.code)));official.value=value;};colors(saved?.colorCode||'');
    select.addEventListener('change',()=>colors());row.append(select,official,node('p',saved?'確認済み '+saved.confirmedDate+' ／ 版 '+saved.version:'対応未確認'));
    row.addEventListener('change',()=>{dirty=true;commit.disabled=true;review.replaceChildren();});list.append(row);
   }
   status.textContent='保存したい行を選び、品番と正式カラーを確認してください。';
  }
  reload.addEventListener('click',()=>{if(busy||dirty&&!confirm('未保存の入力を破棄して読み直しますか？'))return;render();});
  preview.addEventListener('click',()=>{if(busy||blocked)return;try{const rows=drafts(),p=plan(getMaster(),baseline,rows,models,'0'.repeat(32),new Date().toISOString());review.replaceChildren();for(const r of rows)review.append(node('p',r.bodyId+' / '+r.colorId+' → '+r.productCode+' / '+r.colorCode));status.textContent=p?'この対応を各アプリで共有します。確認後に一括保存してください。':'すべて同じ対応です。変更はありません。';commit.disabled=!p;}catch(e){status.textContent=e.message;commit.disabled=true;}});
  commit.addEventListener('click',async()=>{if(busy||blocked||commit.disabled)return;busy=true;panel.querySelectorAll('input,select,button').forEach(n=>n.disabled=true);try{const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);const operationId=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');await save({baseline,rows:drafts(),models,operationId,at:new Date().toISOString()});render();status.textContent='共通対応を保存しました。各アプリで最新情報を読み直してください。';}catch(e){blocked=true;commit.disabled=true;status.textContent=e.message+' 入力は保持しています。自動再送せず、最新の対応を読み直してください。';}finally{busy=false;panel.querySelectorAll('input,select,button').forEach(n=>n.disabled=false);commit.disabled=true;}});
  window.addEventListener('beforeunload',e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}});render();
 }
 const api={signature,plan,mount};root.IcelollyManufacturerColorEditor=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
