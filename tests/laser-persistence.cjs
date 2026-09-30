const assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {start}=require('./laser-browser-server.cjs'),{sample,rates}=require('./laser-fixture.cjs');
;(async()=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'billet-persistence-'));let app=await start({dataDir});
 const request=async(action,body)=>{const response=await fetch(app.url+'/api/laser-quotes?action='+action,{method:body?'POST':'GET',headers:{authorization:'Bearer test-token','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const value=await response.json();assert(response.ok,JSON.stringify(value));return value};
 try{
  await request('identity',{kind:'company',details:{name:'Original Company',email:'quotes@example.com'}});await request('identity',{kind:'user',details:{name:'Original Estimator'}});
  const customer=await request('profiles',{name:'Customer restart test',rates:rates(),profile:{kind:'customer',customer:'Restart customer',terms:'Net 30',valid_days:14}});
  const machine=await request('profiles',{name:'Machine restart test',rates:rates(),profile:{kind:'machine',customer_id:customer.id}});
  const gas=await request('profiles',{name:'Gas restart test',rates:rates(),profile:{kind:'gas',customer_id:customer.id,machine_id:machine.id}});
  await request('profiles',{name:'Electricity restart test',rates:rates(),profile:{kind:'electricity',customer_id:customer.id,machine_id:machine.id}});
  const imported=await request('import',{name:'restart.xls',file:sample().toString('base64')});
  const quote=await request('save',{import_id:imported.id,request_id:crypto.randomUUID(),rates:rates(),customer:'Restart customer',customer_id:customer.id,machine_id:machine.id,reviewed:true});
  await request('identity',{kind:'company',details:{name:'Renamed Company'}});
  await app.close();app=await start({dataDir});
  const identities=await request('identity');assert.equal(identities.company.name,'Renamed Company');assert.equal(identities.user.name,'Original Estimator');
  const saved=await request('quotes&id='+quote.id);assert.equal(saved.result.identity.company.name,'Original Company');assert.equal(saved.result.identity.user.name,'Original Estimator');const pdf=await request('pdf&id='+quote.id);assert(Buffer.from(pdf.base64,'base64').subarray(0,4).equals(Buffer.from('%PDF')));assert.equal(saved.result.price,quote.result.price);assert.equal(saved.result.profiles.customer_id.id,customer.id);assert.equal(saved.result.profiles.machine_id.id,machine.id);
  const profiles=await request('profiles');assert.equal(profiles.length,4);assert.equal(profiles.find(p=>p.id===gas.id).rates._profile.machine_id,machine.id);assert.equal(profiles.find(p=>p.id===customer.id).rates._profile.terms,'Net 30');
  console.log('Persistence passed: quote snapshot, customer, machine, gas and electricity profiles survived database close and reopen.');
 }finally{await app.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
