(function(root){
 'use strict';
 const token=v=>String(v||'').trim().toUpperCase();
 function resolve(master,product,color,legacy){
  const rows=root.IcelollyManufacturerColors.list(master),p=token(product),c=token(color);
  const store=master?.manufacturer_color_links;
  if(store&&(store.schemaVersion!==1||!Number.isSafeInteger(store.revision)||store.revision<1||!store.items||Object.keys(store.items).length!==rows.length))return {state:'blocked',row:null};
  const matches=rows.filter(r=>token(r.productCode)===p&&[r.colorCode,r.colorSymbol].filter(Boolean).some(v=>token(v)===c));
  if(matches.length>1)return {state:'blocked',row:null};
  if(matches.length===1){const row=matches[0];if(legacy&&(legacy.bodyId!==row.bodyId||legacy.colorId!==row.colorId))return {state:'blocked',row:null};return {state:'shared',row};}
  if(legacy&&rows.some(r=>r.bodyId===legacy.bodyId&&r.colorId===legacy.colorId))return {state:'blocked',row:null};
  return {state:'legacy',row:null};
 }
 const api={resolve};root.IcelollyManufacturerPurchase=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
