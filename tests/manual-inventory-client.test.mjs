import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createManualInventoryClient } from '../manual-inventory-client.mjs';
const input={sku:{bodyId:'b',designId:'d',colorId:'c',sizeId:'s'},expectedRevision:0,expectedQuantity:5,quantity:3};
function fixture(responses=[]) {
  const store=new Map(),requests=[];let ids=0;
  const storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
  const factory=()=>createManualInventoryClient({endpoint:'/v1/inventory/manual-edit',storage,getToken:async()=>'token',newId:()=>`op-${++ids}`,fetchImpl:async(url,options)=>{
    const op=JSON.parse(options.body);requests.push({url,op});const next=responses.shift();if(next instanceof Error)throw next;
    return {status:next?.status||200,ok:!(next?.status>=400),json:async()=>next?.body||{operationId:op.operationId,path:'tshirtStock/master',quantity:op.quantity,beforeQuantity:op.expectedQuantity,revision:op.expectedRevision+1,replayed:false,fingerprint:'a'.repeat(64)}};
  }});
  return {factory,storage,requests,store};
}
test('U01 lost reply and reload lookup same operation, never silently sends new intent',async()=>{
  const f=fixture([new Error('lost')]);await assert.rejects(f.factory().submit(input));
  assert.equal((await f.factory().submit({...input,quantity:1})).status,'recovered');
  assert.equal(f.requests[1].url,'/v1/inventory/manual-edit/result');assert.deepEqual(f.requests[1].op,f.requests[0].op);assert.equal(f.store.size,0);
});
test('U02 unknown result retains ID; explicit retry uses identical payload',async()=>{
  const f=fixture([new Error('lost'),{body:{status:'unknown',operationId:'op-1'}}]);const c=f.factory();await assert.rejects(c.submit(input));
  assert.equal((await c.submit(input)).status,'unknown');await c.retryPending();assert.deepEqual(f.requests[0].op,f.requests[2].op);
});
test('U03 conflict clears rejected intent, no automatic retry',async()=>{
  for(const error of ['inventory-conflict','reserved-stock-floor','reservation-evidence-required']) {
    const f=fixture([{status:409,body:{error}}]);assert.equal((await f.factory().submit(input)).status,'conflict');assert.equal(f.requests.length,1);assert.equal(f.store.size,0);
  }
});
test('U04 forged receipt conflict and invalid success keep pending',async()=>{
  for(const response of [{status:409,body:{error:'operation-id-conflict'}},{body:{operationId:'wrong'}},{status:401,body:{error:'unauthenticated'}}]) {
    const f=fixture([response]);await assert.rejects(f.factory().submit(input));assert.equal(f.store.size,1);
  }
});
test('U05 storage failure prevents request',async()=>{
  const f=fixture();f.storage.setItem=()=>{throw new Error('full');};await assert.rejects(f.factory().submit(input));assert.equal(f.requests.length,0);
});
test('U06 actual quantity UI entry selects API and never calls full-map fallback',async()=>{
  const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');
  const start=html.indexOf('async function setFinishedInventoryAbsolute('),end=html.indexOf('\nfunction renderFinishedBodySelector',start);
  const calls=[];const context=vm.createContext({inventoryAuthorityActive:()=>true,methodBRequired:()=>true,saveFinishedViaMethodB:async(sku,q)=>{calls.push({sku,q});return false;}});
  vm.runInContext(html.slice(start,end),context);
  assert.equal(await context.setFinishedInventoryAbsolute('b','d','c','s',0),false);assert.equal(calls[0].q,0);assert.equal(calls[0].sku.bodyId,'b');
});
test('U07 actual legacy save entry refuses in method B mode before direct transaction',async()=>{
  const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');
  const start=html.indexOf('async function saveMasterData('),end=html.indexOf('\nfunction renderDesignSettings',start);let alerted=false;
  const context=vm.createContext({methodBRequired:()=>true,alert:()=>alerted=true});vm.runInContext(html.slice(start,end),context);
  assert.equal(await context.saveMasterData({inventory_v2:{}}),false);assert.equal(alerted,true);
});
test('U08 shipped configuration is disabled',async()=>{
  const {manualInventoryEndpoint}=await import('../manual-inventory-config.mjs');assert.equal(manualInventoryEndpoint,null);
});
