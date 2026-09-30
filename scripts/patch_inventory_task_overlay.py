from pathlib import Path

path = Path('index.html')
text = path.read_text(encoding='utf-8')

read_markers = ('getDoc(', 'getDocs(', 'getDocFromServer(', 'getDocsFromServer(')
reads_before = {marker: text.count(marker) for marker in read_markers}

css_anchor = """  .review-table td:has(.review-stock-input) { padding: 4px 3px; }
  .management-tools {
"""
css_replacement = """  .review-table td:has(.review-stock-input) { padding: 4px 3px; }
  .review-stock-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-width: 48px;
  }
  .review-stock-total {
    display: block;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .review-task-overlay {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 2px;
    min-height: 12px;
    margin-top: 2px;
  }
  .review-task-stock,
  .review-task-order {
    display: inline-block;
    padding: 1px 4px;
    border-radius: 999px;
    font-size: 9px;
    font-weight: 750;
    line-height: 1.25;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .review-task-stock {
    background: var(--accent-bg);
    color: var(--accent);
  }
  .review-task-order {
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text-secondary);
  }
  .review-design-row td,
  .review-table td:last-child {
    font-variant-numeric: tabular-nums;
  }
  .management-tools {
"""
if text.count(css_anchor) != 1:
    raise SystemExit(f'CSS anchor count mismatch: {text.count(css_anchor)}')
text = text.replace(css_anchor, css_replacement, 1)

start_marker = 'function allInventoryReviewRows(){'
end_marker = 'function renderFinishedDisplayMode(){'
start = text.find(start_marker)
end = text.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit('Inventory review function block not found')

new_block = r'''function buildInventoryTaskOverlay(){
  const byCell = new Map();
  Object.values(masterDocument?.production_tasks || {}).forEach(task => {
    const qty = Math.max(0, Number(task?.qty || 0));
    const designId = String(task?.designId || '');
    const colorId = String(task?.colorId || '');
    const sizeId = String(task?.sizeId || '');
    const bodyId = String(task?.bodyId || masterDocument?.masters?.colors?.[colorId]?.bodyId || '');
    if(!qty || !bodyId || !designId || !colorId || !sizeId) return;
    const key = `${bodyId}|${designId}|${colorId}|${sizeId}`;
    const current = byCell.get(key) || { stock:0, order:0, total:0 };
    if(task?.purpose === 'order') current.order += qty;
    else current.stock += qty;
    current.total += qty;
    byCell.set(key, current);
  });
  return byCell;
}

function allInventoryReviewRows(taskOverlay = null){
  const rows=[];
  const inventory=masterDocument?.inventory_v2 || {};
  const bodies=masterDocument?.masters?.bodies || {}, designs=masterDocument?.masters?.designs || {};
  const colors=masterDocument?.masters?.colors || {}, sizes=masterSizes();
  const taskMap = taskOverlay || buildInventoryTaskOverlay();
  const pairs=new Set();
  Object.entries(inventory).forEach(([bodyId,designsTree])=>{
    if(bodyId===LEGACY_BODY_ID)return;
    Object.entries(designsTree||{}).forEach(([designId,colorsTree])=>{
      Object.keys(colorsTree||{}).forEach(colorId=>pairs.add([bodyId,designId,colorId].join('|')));
    });
  });
  // 制作タスクだけが存在し、完成品在庫が0の組み合わせも一覧に出す。
  taskMap.forEach((_,cellKey)=>{
    const [bodyId,designId,colorId] = String(cellKey).split('|');
    if(bodyId && designId && colorId) pairs.add([bodyId,designId,colorId].join('|'));
  });
  if(reviewIncludeZero)Object.entries(masterDocument?.display_preferences||{}).forEach(([designId,config])=>{
    (config?.pairs||[]).forEach(pair=>pairs.add(`${pair.split('|')[0]}|${designId}|${pair.split('|')[1]}`));
  });
  pairs.forEach(pair=>{
    const [bodyId,designId,colorId]=pair.split('|');
    if(!bodies[bodyId] || !designs[designId] || !colors[colorId])return;
    if(state.finishedBodyId && state.finishedBodyId!==bodyId)return;
    const sizeValues=sizes.map(size=>Math.max(0,Number(inventory?.[bodyId]?.[designId]?.[colorId]?.[size.id]?.qty||0)));
    const taskStockSizes=sizes.map(size=>Math.max(0,Number(taskMap.get(`${pair}|${size.id}`)?.stock||0)));
    const taskOrderSizes=sizes.map(size=>Math.max(0,Number(taskMap.get(`${pair}|${size.id}`)?.order||0)));
    const total=sizeValues.reduce((a,b)=>a+b,0);
    const taskStockTotal=taskStockSizes.reduce((a,b)=>a+b,0);
    const taskOrderTotal=taskOrderSizes.reduce((a,b)=>a+b,0);
    const taskTotal=taskStockTotal+taskOrderTotal;
    if(!reviewIncludeZero && total===0 && taskTotal===0)return;
    const meta = latestInventoryColorMeta(designId, colorId, bodyId);
    rows.push({
      pair,
      body:bodies[bodyId].managementName||bodyId,
      design:designs[designId].managementName||designId,
      color:colors[colorId].managementName||colorId,
      sizes:sizeValues,
      taskStockSizes,
      taskOrderSizes,
      total,
      taskStockTotal,
      taskOrderTotal,
      taskTotal,
      updatedAt:meta?.updatedAt||null,
      updateSource:meta?.source||''
    });
  });
  return rows.sort((a,b)=>a.design.localeCompare(b.design,'ja')||a.body.localeCompare(b.body,'ja')||a.color.localeCompare(b.color,'ja'));
}
function renderInventoryOverview(){
  const box=document.getElementById('inventory-overview');
  if(!box)return;
  if(!inventoryAuthorityActive()){box.innerHTML='<div class="inventory-review">実在庫マスターへの接続後に使用できます。</div>';return;}
  // Firestoreの追加読込は行わず、すでに読み込まれている production_tasks を1回だけ集計する。
  const taskOverlay=buildInventoryTaskOverlay();
  const rows=allInventoryReviewRows(taskOverlay);
  const sizes=masterSizes();
  // The vertical axis is Design; each Design gets a size-by-size subtotal followed
  // by its Body / Color variants. This is presentation only, not a stock mutation.
  const groups=new Map();
  rows.forEach(row=>{
    const designId=row.pair.split('|')[1];
    if(!groups.has(designId))groups.set(designId,{designId,name:row.design,rows:[]});
    groups.get(designId).rows.push(row);
  });
  const taskBadgeHtml=(stockTask=0,orderTask=0)=>{
    const stock=Math.max(0,Number(stockTask||0));
    const order=Math.max(0,Number(orderTask||0));
    if(!stock && !order)return '';
    return `<span class="review-task-overlay">${stock?`<span class="review-task-stock" title="在庫用制作タスク">＋${stock}</span>`:''}${order?`<span class="review-task-order" title="オーダー制作タスク">注${order}</span>`:''}</span>`;
  };
  const summaryCell=(stock,stockTask=0,orderTask=0)=>`<td class="${stock===0?'review-zero':''}"><span class="review-stock-total">${stock}</span>${taskBadgeHtml(stockTask,orderTask)}</td>`;
  const editableCell=(row,size,index)=>`<td data-task-stock="${row.taskStockSizes[index]}" data-task-order="${row.taskOrderSizes[index]}"><div class="review-stock-cell"><input class="review-stock-input ${row.sizes[index]===0?'is-zero':''}" type="number" min="0" step="1" inputmode="numeric" value="${row.sizes[index]}" data-review-stock="${escapeHtml(row.pair)}" data-review-size="${escapeHtml(size.id)}" aria-label="${escapeHtml(`${row.design} ${row.body} ${row.color} ${size.managementName||size.id} 在庫`)}">${taskBadgeHtml(row.taskStockSizes[index],row.taskOrderSizes[index])}</div></td>`;
  box.innerHTML=`<div class="inventory-review"><strong>完成品の在庫一覧</strong><p class="section-note">Designを縦に、Sizeを横に並べました。入力欄が現在の完成品在庫です。青い「＋」は在庫用の制作タスク、「注」はオーダー制作タスクです。制作タスクがある組み合わせは在庫0でも表示します。</p>
    <input class="review-search" id="review-search" type="search" placeholder="Design・Body・Colorで検索" aria-label="在庫一覧を検索">
    <div class="review-actions"><label><input id="review-include-zero" type="checkbox" ${reviewIncludeZero?'checked':''}> 定番の在庫0も表示</label><button type="button" id="review-reset">確認チェックをリセット</button></div>
    <p class="section-note">サイズが収まらない場合は表を左右にスクロールできます。左端のDesign / Body・Colorは固定です。制作タスクは表示だけで、在庫数は変更しません。</p>
    <div class="review-stats" id="review-stats"><span id="review-summary"></span> · 確認済 <span id="review-checked-count">0</span>件</div>
    <div class="review-table-wrap"><table class="review-table" aria-label="Design別・Size別の完成品在庫と制作タスク"><thead><tr><th scope="col">Design<br>Body / Color</th>${sizes.map(x=>`<th scope="col">${escapeHtml(x.managementName||x.id)}</th>`).join('')}<th scope="col">計</th></tr></thead>${Array.from(groups.values()).map(group=>{
      const sumBySize=sizes.map((_,i)=>group.rows.reduce((sum,row)=>sum+row.sizes[i],0));
      const taskStockBySize=sizes.map((_,i)=>group.rows.reduce((sum,row)=>sum+row.taskStockSizes[i],0));
      const taskOrderBySize=sizes.map((_,i)=>group.rows.reduce((sum,row)=>sum+row.taskOrderSizes[i],0));
      const sum=sumBySize.reduce((a,b)=>a+b,0);
      const taskStockSum=taskStockBySize.reduce((a,b)=>a+b,0);
      const taskOrderSum=taskOrderBySize.reduce((a,b)=>a+b,0);
      const count=group.rows.filter(row=>inventoryReviewChecked.has(row.pair)).length;
      return `<tbody data-review-design="${escapeHtml(group.designId)}"><tr class="review-design-row"><th scope="row"><span class="review-design-name">${escapeHtml(group.name)}</span><span class="review-design-count" data-review-design-count>${group.rows.length}組・確認済 ${count}組</span></th>${sumBySize.map((n,i)=>summaryCell(n,taskStockBySize[i],taskOrderBySize[i])).join('')}${summaryCell(sum,taskStockSum,taskOrderSum)}</tr>${group.rows.map(row=>`<tr data-review-row="${escapeHtml(row.pair)}" data-search="${escapeHtml(`${row.design} ${row.body} ${row.color}`.toLowerCase())}" class="${inventoryReviewChecked.has(row.pair)?'is-checked':''}"><th scope="row"><label class="review-variant-label"><input type="checkbox" aria-label="${escapeHtml(`${row.design} ${row.body} ${row.color}`)} 確認済" data-review-check="${escapeHtml(row.pair)}" ${inventoryReviewChecked.has(row.pair)?'checked':''}><span>${escapeHtml(row.body)}<small>${escapeHtml(row.color)}</small><small class="inventory-update-meta">${escapeHtml(row.updatedAt ? `更新 ${formatTimestamp(row.updatedAt)} · ${inventoryUpdateSourceLabel(row.updateSource)}` : '更新 未記録 · 更新元未記録')}</small></span></label></th>${sizes.map((size,index)=>editableCell(row,size,index)).join('')}${summaryCell(row.total,row.taskStockTotal,row.taskOrderTotal)}</tr>`).join('')}</tbody>`;
    }).join('')}</table></div><p class="review-no-match" id="review-no-match" hidden>該当する組み合わせはありません。</p></div>`;
  const updateReviewDisplay=()=>{
    const q=box.querySelector('#review-search')?.value.toLowerCase().trim()||'';
    let visibleCount=0,visibleTotal=0,visibleTaskStock=0,visibleTaskOrder=0,checkedCount=0;
    box.querySelectorAll('[data-review-design]').forEach(tbody=>{
      const visible=[];
      tbody.querySelectorAll('[data-review-row]').forEach(tr=>{
        const match=!q||tr.getAttribute('data-search').includes(q);
        tr.hidden=!match;
        if(match)visible.push(tr);
      });
      tbody.hidden=!visible.length;
      if(!visible.length)return;
      const totals=sizes.map((_,i)=>visible.reduce((sum,tr)=>{
        const cell=tr.children[i+1];
        const field=cell?.querySelector('[data-review-stock]');
        return sum+Number(field?.value ?? cell?.textContent ?? 0);
      },0));
      const taskStockTotals=sizes.map((_,i)=>visible.reduce((sum,tr)=>sum+Number(tr.children[i+1]?.dataset?.taskStock||0),0));
      const taskOrderTotals=sizes.map((_,i)=>visible.reduce((sum,tr)=>sum+Number(tr.children[i+1]?.dataset?.taskOrder||0),0));
      const grandTotal=totals.reduce((a,b)=>a+b,0);
      const grandTaskStock=taskStockTotals.reduce((a,b)=>a+b,0);
      const grandTaskOrder=taskOrderTotals.reduce((a,b)=>a+b,0);
      const confirmed=visible.filter(tr=>tr.querySelector('[data-review-check]')?.checked).length;
      const header=tbody.querySelector('.review-design-row');
      header.querySelector('[data-review-design-count]').textContent=`${visible.length}組・確認済 ${confirmed}組`;
      totals.forEach((n,i)=>{
        const td=header.children[i+1];
        td.classList.toggle('review-zero',n===0);
        td.innerHTML=`<span class="review-stock-total">${n}</span>${taskBadgeHtml(taskStockTotals[i],taskOrderTotals[i])}`;
      });
      header.lastElementChild.classList.toggle('review-zero',grandTotal===0);
      header.lastElementChild.innerHTML=`<span class="review-stock-total">${grandTotal}</span>${taskBadgeHtml(grandTaskStock,grandTaskOrder)}`;
      visibleCount+=visible.length;
      visibleTotal+=grandTotal;
      visibleTaskStock+=grandTaskStock;
      visibleTaskOrder+=grandTaskOrder;
      checkedCount+=confirmed;
    });
    const selectedBody=masterDocument?.masters?.bodies?.[state.finishedBodyId]?.managementName;
    const scope=selectedBody?`${selectedBody} / `:'全Body / ';
    const taskTotal=visibleTaskStock+visibleTaskOrder;
    const orderText=visibleTaskOrder?`（注文 ${visibleTaskOrder}）`:'';
    box.querySelector('#review-summary').textContent=`${scope}${visibleCount}組 / 在庫 ${visibleTotal}枚 / 制作 ${taskTotal}枚${orderText}`;
    box.querySelector('#review-checked-count').textContent=String(checkedCount);
    box.querySelector('#review-no-match').hidden=visibleCount>0;
  };
  box.querySelector('#review-search')?.addEventListener('input',updateReviewDisplay);
  box.querySelector('#review-include-zero')?.addEventListener('change',e=>{reviewIncludeZero=e.target.checked;renderInventoryOverview();});
  box.querySelector('#review-reset')?.addEventListener('click',()=>{inventoryReviewChecked.clear();renderInventoryOverview();});
  box.querySelectorAll('[data-review-check]').forEach(input=>input.addEventListener('change',()=>{
    const key=input.getAttribute('data-review-check');
    if(input.checked)inventoryReviewChecked.add(key);else inventoryReviewChecked.delete(key);
    input.closest('tr')?.classList.toggle('is-checked',input.checked);
    updateReviewDisplay();
  }));
  box.querySelectorAll('[data-review-stock]').forEach(input=>{
    input.addEventListener('focus',()=>input.select());
    input.addEventListener('keydown',event=>{
      if(event.key==='Enter'){event.preventDefault();input.blur();}
    });
    input.addEventListener('input',()=>{
      input.classList.toggle('is-zero',Number(input.value||0)===0);
      updateReviewDisplay();
    });
    input.addEventListener('change',async()=>{
      const pair=String(input.getAttribute('data-review-stock')||'');
      const [bodyId,designId,colorId]=pair.split('|');
      const sizeId=input.getAttribute('data-review-size')||'';
      const before=masterInventoryQty(bodyId,designId,colorId,sizeId);
      const qty=Number(input.value);
      if(!bodyId||!designId||!colorId||!sizeId||!Number.isInteger(qty)||qty<0){
        input.value=String(before);
        input.classList.toggle('is-zero',before===0);
        updateReviewDisplay();
        alert('在庫数は0以上の整数で入力してください。');
        return;
      }
      if(qty===before)return;
      input.disabled=true;
      inventoryDirectSaveQueue=inventoryDirectSaveQueue
        .then(()=>setFinishedInventoryAbsolute(bodyId,designId,colorId,sizeId,qty))
        .catch(error=>{console.error('direct inventory save failed',error);return false;});
      const saved=await inventoryDirectSaveQueue;
      if(saved===false){
        input.disabled=false;
        input.value=String(before);
        updateReviewDisplay();
        return;
      }
      renderStockSummary();
      renderInventoryOverview();
    });
  });
  updateReviewDisplay();
}
'''

text = text[:start] + new_block + text[end:]

reads_after = {marker: text.count(marker) for marker in read_markers}
if reads_after != reads_before:
    raise SystemExit(f'Unexpected Firestore read-call count change: before={reads_before}, after={reads_after}')

required = [
    'function buildInventoryTaskOverlay()',
    "masterDocument?.production_tasks || {}",
    'review-task-stock',
    'review-task-order',
    '制作タスクがある組み合わせは在庫0でも表示します。',
    'data-task-stock',
    'data-task-order',
    'function renderFinishedDisplayMode()'
]
for marker in required:
    if marker not in text:
        raise SystemExit(f'Missing marker after patch: {marker}')

path.write_text(text, encoding='utf-8')
