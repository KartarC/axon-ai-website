const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path')
const {parseHans,duration}=require('../api/_lib/laser-import'),{calculate}=require('../api/_lib/laser-cost')
const {sample,files,zip,rates}=require('./laser-fixture.cjs')
const source=()=>parseHans(sample(),'fixture.xls')
test('Han’s XLSX content with .xls extension reproduces source quantities, times and charges',async()=>{const s=await source();assert.equal(s.parts.reduce((n,p)=>n+p.nested,0),187);assert.equal(s.pierces,403);assert.equal(s.totalSeconds,2128.986);assert.equal(s.charges.total,505.87);assert.match(s.warnings[0],/27.43 kg.*28.43 kg/);assert.equal(s.hash.length,64)})
test('source durations preserve milliseconds and allow hours',()=>{assert.equal(duration('01:02:03:004'),3723.004);assert.throws(()=>duration('00:60:00:000'));assert.throws(()=>duration('35:28'))})
test('charge comparison reproduces 505.87 using rounded source lines',async()=>{const r=calculate(await source(),rates({method:'hans',pricing:'markup',percentage:'0',gasMode:'included',gasReason:'Already in Han’s charge',electricityMode:'included',electricityReason:'Already in Han’s charge'}));assert.equal(r.basis,505.87);assert.equal(r.price,505.87)})
test('full-sheet mass, gas-pack volume, electrical usage and margin reconcile independently',async()=>{const r=calculate(await source(),rates({materialMode:'kg',pricePerKg:'2',density:'7.8'}));assert.equal(r.complete,true);assert.equal(r.usage.sheetKg,108.696557);assert.equal(r.usage.packUsableM3,100);assert.equal(r.usage.gasPerM3,1);assert.equal(r.usage.gasM3,2.952835);assert.equal(r.usage.energyKwh,5.91385);assert.equal(r.basis,256.41);assert.equal(r.price,320.51)})
test('missing gas and power values stay incomplete, not zero',async()=>{const r=calculate(await source(),rates({gasFlowLmin:'',powerKw:''}));assert(!r.complete);assert.equal(r.price,null);assert.equal(r.components.find(c=>c.name==='Gas').amount,null);assert(r.missing.length>=2)})
test('pack losses and purge use the entered basis, no travel gas assumption',async()=>{const r=calculate(await source(),rates({usablePct:'50',purgeSeconds:'60'}));assert.equal(r.usage.packUsableM3,50);assert.equal(r.usage.gasPerM3,2);assert.equal(r.usage.gasM3,3.052835)})
test('setup electricity included once, zero setup needs no hourly setup rate',async()=>{const r=calculate(await source(),rates({setupMinutes:'60',setupHourly:'30'}));assert.equal(r.usage.energyKwh,15.91385);assert.equal(r.components.find(c=>c.name==='Setup').amount,30);assert(calculate(await source(),rates()).complete)})
test('margin and markup differ, minimum charge and explicit zero are preserved',async()=>{const s=await source();const base=rates({gasMode:'manual',gasManualCost:'0',electricityMode:'manual',electricityManualCost:'0',machineHourly:'0',percentage:'20'});assert.equal(calculate(s,base).price,250);assert.equal(calculate(s,{...base,pricing:'markup'}).price,240);assert.equal(calculate(s,{...base,minimumCharge:'300'}).price,300)})
test('invalid percentages, negative costs, invalid gas denominator and excessive credit are rejected',async()=>{const s=await source();for(const r of [{percentage:'100'},{packPrice:'-1'},{usablePct:'0'},{bottles:'1.5'},{remnantCredit:'201'},{powerKw:'Infinity'},{currency:'XXX'}])assert.throws(()=>calculate(s,rates(r)));assert(!calculate(s,rates({volumePerBottle:'0'})).complete)})
test('excluding gas or electricity requires an explicit reason',async()=>{const r=calculate(await source(),rates({gasMode:'included',electricityMode:'included'}));assert(!r.complete);assert(r.missing.some(x=>x.includes('Reason gas')))})
test('malformed, oversized, multi-run, multi-sheet, formula and entity payloads fail safely',async()=>{
 await assert.rejects(()=>parseHans(Buffer.alloc(2),'bad.xls'))
 await assert.rejects(()=>parseHans(Buffer.alloc(3*1024*1024),'large.xls'))
 for(const transform of [f=>({...f,'xl/worksheets/sheet1.xml':f['xl/worksheets/sheet1.xml'].replace('r="K4" t="inlineStr"><is><t>1','r="K4" t="inlineStr"><is><t>2')}),f=>({...f,'xl/workbook.xml':f['xl/workbook.xml'].replace('</sheets>','<sheet name="Other"/></sheets>')}),f=>({...f,'xl/worksheets/sheet1.xml':f['xl/worksheets/sheet1.xml'].replace('<is>','<f>1+1</f><is>')}),f=>({...f,'xl/workbook.xml':'<!DOCTYPE foo>'+f['xl/workbook.xml']})])await assert.rejects(()=>parseHans(zip(transform(files())),'bad.xls'))
})
const A='10000000-0000-4000-8000-000000000001',I='20000000-0000-4000-8000-000000000001'
function handler(role='manager',sb=async()=>[],modules=['job-costing']){const helpers={sb,cors(){},requireAuth:async()=>({user:{id:I},role,account:{id:A,modules}}),requireRole:(ctx,roles,res)=>{if(roles.includes(role))return true;res.status(403).json({error:'Forbidden'});return false}}
 const src=fs.readFileSync(path.join(__dirname,'../api/laser-quotes.js'),'utf8').replace('export const config','const config').replace('export default async function handler','async function handler')
 const context={Buffer,console,require:n=>n==='./_lib/supabase'?helpers:require(path.resolve(__dirname,'../api',n))};vm.createContext(context);vm.runInContext(src+';this.handler=handler',context);return context.handler}
async function call(h,action='quotes',body={},method='POST'){const res={code:200,status(n){this.code=n;return this},json(v){this.body=v;return this},setHeader(){}};await h({method,headers:{},query:{action},body},res);return res}
test('viewer/operator and unentitled shop cannot reach quote data',async()=>{for(const role of ['viewer','operator'])assert.equal((await call(handler(role,()=>{throw Error('Unexpected DB')}))).code,403);assert.equal((await call(handler('owner',()=>{throw Error('Unexpected DB')},[]))).code,403)})
test('managers cannot change shared rate profiles',async()=>{assert.equal((await call(handler(),'profiles',{name:'attempt',rates:rates()})).code,403)})
test('foreign import and injected IDs are denied before saving',async()=>{let calls=[];const h=handler('manager',async(m,p)=>{calls.push(p);return []});assert.equal((await call(h,'calculate',{import_id:I,rates:rates()})).code,404);assert(calls[0].includes('account_id=eq.'+A));calls=[];assert.equal((await call(h,'calculate',{import_id:I+'&select=*',rates:rates()})).code,400);assert.equal(calls.length,0)})
test('server ignores client totals and recalculates its own canonical source',async()=>{const s=await source();let saved;const h=handler('manager',async(m,p,b)=>{if(p.startsWith('billet_laser_imports'))return[{id:I,source:s}];saved=b;return{id:I}});const r=await call(h,'save',{import_id:I,request_id:I,reviewed:true,customer:'Test',rates:rates(),result:{price:.01}});assert.equal(r.code,201);assert(saved.p_result.price>200);assert.equal(saved.p_account,A)})
test('unchecked review and incomplete calculations cannot save',async()=>{const s=await source();let writes=0;const h=handler('manager',async(m)=>{if(m==='POST')writes++;return[{id:I,source:s}]});assert.equal((await call(h,'save',{import_id:I,rates:rates(),reviewed:false})).code,400);assert.equal((await call(h,'save',{import_id:I,rates:rates({energyPrice:''}),reviewed:true})).code,400);assert.equal(writes,0)})

test('profile associations cannot reference another shop or the wrong profile type',async()=>{
 let writes=0;const h=handler('owner',async(m,p)=>{if(m==='POST')writes++;assert(p.includes('account_id=eq.'+A));return []})
 assert.equal((await call(h,'profiles',{name:'Gas',rates:rates(),profile:{kind:'gas',customer_id:I}})).code,404);assert.equal(writes,0)
 const wrong=handler('owner',async()=>[{id:I,rates:{_profile:{kind:'gas'}}}])
 assert.equal((await call(wrong,'profiles',{name:'Gas',rates:rates(),profile:{kind:'gas',machine_id:I}})).code,400)
})
test('customer defaults and scoped standards retain validated metadata',async()=>{
 let saved;const h=handler('owner',async(m,p,b)=>{saved=b;return[b]})
 const r=await call(h,'profiles',{name:'Customer A',rates:rates(),profile:{kind:'customer',customer:'Customer A',terms:'Net 30',valid_days:14}})
 assert.equal(r.code,201);assert.equal(saved.rates._profile.terms,'Net 30');assert.equal(saved.rates._profile.valid_days,14)
 assert.equal((await call(h,'profiles',{name:'Bad',rates:rates(),profile:{kind:'unknown'}})).code,400)
})
