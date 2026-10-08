const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});try{
 const page=await browser.newPage(),dir=path.join(__dirname,'..'),models=JSON.parse(fs.readFileSync(path.join(dir,'manufacturer-models.json'))),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>route.fulfill({status:200,contentType:'text/html',body:'<html></html>'}));await page.goto('https://stock.test');
 await page.setContent('<div id="editor"></div>');await page.addScriptTag({path:path.join(dir,'manufacturerColorEditor.js')});
 await page.evaluate(models=>{
  window.master={masters:{bodies:{b:{id:'b',managementName:'Organic'}},colors:{c:{id:'c',managementName:'Beige Grey',bodyId:'b'}}},manufacturer_color_links:{schemaVersion:1,revision:0,items:{},history:[]},purchase_item_mappings:{},inventory_v2:{b:{d:{c:{s:{qty:5}}}}}};
  window.writes=[];window.IcelollyManufacturerColorEditor.mount({panel:document.getElementById('editor'),getMaster:()=>window.master,models,save:async input=>{const patch=window.IcelollyManufacturerColorEditor.plan(window.master,input.baseline,input.rows,input.models,input.operationId,input.at);if(patch){window.writes.push(patch);window.master={...window.master,...patch};}}});
 },models);
 await page.locator('[data-model]').selectOption('OGB-910');await page.locator('[data-official]').selectOption('97');await page.locator('[data-pair] input').check();
 await page.getByRole('button',{name:'選んだ行の変更を確認'}).click();assert.equal(await page.evaluate(()=>writes.length),0);
 await page.getByRole('button',{name:'確認した行を一括保存'}).click();await page.waitForFunction(()=>document.getElementById('editor').textContent.includes('共通対応を保存しました'));
 assert.equal(await page.evaluate(()=>writes.length),1);assert.equal(await page.evaluate(()=>master.inventory_v2.b.d.c.s.qty),5);
 assert.deepEqual(await page.evaluate(()=>Object.keys(writes[0]).sort()),['manufacturer_color_links','purchase_item_mappings']);
 await page.locator('[data-official]').selectOption('60');await page.locator('[data-pair] input').check();await page.getByRole('button',{name:'選んだ行の変更を確認'}).click();
 await page.evaluate(()=>master.manufacturer_color_links.revision++);
 await page.getByRole('button',{name:'確認した行を一括保存'}).click();await page.waitForFunction(()=>document.getElementById('editor').textContent.includes('自動再送'));
 assert.equal(await page.locator('[data-official]').inputValue(),'60');assert.equal(await page.evaluate(()=>writes.length),1);
 assert.equal(await page.getByRole('button',{name:'確認した行を一括保存'}).isDisabled(),true);assert.deepEqual(errors,[]);
 console.log('Manufacturer batch UI checks passed');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
