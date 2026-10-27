// Run explicitly with METHOD_B_TEST_DIR pointing to the reviewed Sales-Manager
// isolated/method-b checkout. The runtime refuses real projects/credentials.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { createManualInventoryClient } from '../manual-inventory-client.mjs';
if(!process.env.METHOD_B_TEST_DIR)throw new Error('METHOD_B_TEST_DIR required');
const base=pathToFileURL(process.env.METHOD_B_TEST_DIR.replaceAll('\\','/')+'/');
const {runtime,UIDS}=await import(new URL('runtime.mjs',base));
const {server}=await import(new URL('http.mjs',base));
let rt,api,endpoint,token;const sku={bodyId:'b',designId:'d',colorId:'c',sizeId:'s'};
before(async()=>{
  rt=runtime();await rt.auth.createUser({uid:UIDS[0],email:'ui@example.test',emailVerified:true,password:'fixture-password-only'});
  const res=await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'ui@example.test',password:'fixture-password-only',returnSecureToken:true})});token=(await res.json()).idToken;
  await rt.db.doc('tshirtStock/master').set({inventoryRevision:0,inventoryReservations:{schema:'inventory-reservations-v1',complete:true,entries:[{id:'ec-fixture',kind:'ec',state:'held',sku,quantity:2}]},inventory_v2:{b:{d:{c:{s:{qty:5}}}}}});
  api=server(rt);api.listen(0,'127.0.0.1');await once(api,'listening');endpoint=`http://127.0.0.1:${api.address().port}/v1/inventory/manual-edit`;
});
after(async()=>{api?.closeAllConnections();if(api)await new Promise(r=>api.close(r));await rt?.close();});
test('E01 actual browser client to HTTP/Auth/Firestore: commit then lost reply recovery',async()=>{
  const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const client=createManualInventoryClient({endpoint,storage,getToken:async()=>token,fetchImpl:async(...args)=>{await fetch(...args);throw new Error('lost-response-after-commit');}});
  const input={sku,expectedRevision:0,expectedQuantity:5,quantity:3};await assert.rejects(client.submit(input));
  const recovered=createManualInventoryClient({endpoint,storage,getToken:async()=>token});
  assert.equal((await recovered.submit({...input,quantity:4})).status,'recovered');
  const data=(await rt.db.doc('tshirtStock/master').get()).data();assert.equal(data.inventoryRevision,1);assert.equal(data.inventory_v2.b.d.c.s.qty,3);
});
test('E02 HTTP conflict remains explicit and never reapplies a new count',async()=>{
  const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const client=createManualInventoryClient({endpoint,storage,getToken:async()=>token});
  assert.equal((await client.submit({sku,expectedRevision:0,expectedQuantity:5,quantity:4})).status,'conflict');
  assert.equal((await rt.db.doc('tshirtStock/master').get()).data().inventoryRevision,1);
});
test('E03 HTTP reservation floor rejection never shows saved',async()=>{
  const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const client=createManualInventoryClient({endpoint,storage,getToken:async()=>token});
  const result=await client.submit({sku,expectedRevision:1,expectedQuantity:3,quantity:1});assert.equal(result.status,'conflict');assert.equal(result.reason,'reserved-stock-floor');assert.equal(values.size,0);
});
