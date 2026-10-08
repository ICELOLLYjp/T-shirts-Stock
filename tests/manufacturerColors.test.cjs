'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('Color settings display both names without writes or extra reads',()=>{
 const dir=path.join(__dirname,'..'), source=fs.readFileSync(path.join(dir,'index.html'),'utf8');
 const begin=source.indexOf('function renderColorSettings(){'),end=source.indexOf('\nfunction ',begin+20);
 assert.ok(begin>0&&end>begin);
 const list={innerHTML:'',querySelectorAll:()=>[]},warning={innerHTML:''};
 const master={masters:{bodies:{b:{id:'b',managementName:'MIJ'}},colors:{c:{id:'c',managementName:'Japan gray',pinkoiName:'Gray',bodyId:'b'}}},manufacturer_color_links:{schemaVersion:1,revision:1,items:{'b|c':{bodyId:'b',colorId:'c',supplierId:'felic',productCode:'JPC-001',colorCode:'04',officialName:'ヘザーグレー',colorSymbol:'',version:1,confirmedDate:'2026-10-08',sourceCheckedDate:'2026-10-08'}}}};
 const before=JSON.stringify(master),context=vm.createContext({document:{getElementById:id=>id==='color-master-list'?list:id==='color-mapping-warning'?warning:{}},masterReady:true,masterDocument:master,assignableBodies:()=>Object.values(master.masters.bodies),masterColors:()=>Object.values(master.masters.colors),colorMappingStats:()=>({unmapped:0}),colorUsageBodyIds:()=>['b'],escapeHtml:x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),saveMasterData:()=>{throw Error('no writes');}});
 vm.runInContext(fs.readFileSync(path.join(dir,'manufacturerColors.js'),'utf8'),context);
 vm.runInContext(source.slice(begin,end)+'\nrenderColorSettings();',context);
 assert.match(list.innerHTML,/Japan gray/);assert.match(list.innerHTML,/Gray/);assert.match(list.innerHTML,/ヘザーグレー \(04\)/);assert.match(list.innerHTML,/JPC-001/);assert.equal(JSON.stringify(master),before);
});
