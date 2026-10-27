// No direct Firestore fallback. The full unresolved intent survives reloads.
export function createManualInventoryClient({endpoint,storage,getToken,fetchImpl=fetch,newId=()=>crypto.randomUUID(),key='icelolly-manual-method-b-v1'}) {
  let busy=false;
  const pending=()=>{const value=storage.getItem(key);return value?JSON.parse(value):null;};
  async function request(operation,lookup) {
    const response=await fetchImpl(endpoint+(lookup?'/result':''),{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${await getToken()}`},body:JSON.stringify(operation),signal:AbortSignal.timeout(15000)});
    const body=await response.json();
    if(response.status===409 && ['inventory-conflict','reserved-stock-floor','reservation-evidence-required','reservation-authority-required','invalid-stored-revision'].includes(body.error)) {
      storage.removeItem(key);return {status:'conflict',reason:body.error};
    }
    if(!response.ok) throw new Error(body.error||'保存結果を確認できません');
    if(lookup && body.status==='unknown' && body.operationId===operation.operationId) return {status:'unknown'};
    if(body.operationId!==operation.operationId || body.path!=='tshirtStock/master' || body.quantity!==operation.quantity
      || body.beforeQuantity!==operation.expectedQuantity || body.revision!==operation.expectedRevision+1
      || typeof body.replayed!=='boolean' || !/^[0-9a-f]{64}$/.test(body.fingerprint||'')) throw new Error('保存結果が一致しません');
    storage.removeItem(key);return {status:'saved',result:body};
  }
  return {
    pending,
    async submit(input) {
      if(busy) return {status:'busy'};busy=true;
      try {
        const previous=pending();
        if(previous) {const result=await request(previous,true);return {...result,status:result.status==='saved'?'recovered':result.status};}
        const operation={version:1,operationId:newId(),stock:'tshirt',...input};
        // Persist before any request; storage failure must prevent transmission.
        storage.setItem(key,JSON.stringify(operation));
        return await request(operation,false);
      } finally {busy=false;}
    },
    async retryPending() {
      if(busy) return {status:'busy'};busy=true;
      try {const operation=pending();if(!operation)return {status:'none'};return await request(operation,false);}finally {busy=false;}
    }
  };
}
