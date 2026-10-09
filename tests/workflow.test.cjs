const test=require('node:test'),assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const {start}=require('./laser-browser-server.cjs'),{sample,rates}=require('./laser-fixture.cjs');const root=path.resolve(__dirname,'..');
const A='10000000-0000-4000-8000-000000000001',U='20000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002';
test('drafts persist incomplete inputs, reject stale tabs/foreign sources, and protect status transitions',async()=>{
 const app=await start();try{async function request(action,body){const r=await fetch(app.url+'/api/laser-quotes?action='+action,{method:body?'POST':'GET',headers:{authorization:'Bearer test-token','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()}}
 assert.equal((await request('draft')).body.version,0);
 const payload={import_id:null,previous_id:null,values:{customer:'Incomplete client',sheetPrice:''}};
 const d=await request('draft',{version:0,payload});assert.equal(d.status,200);assert.equal(d.body.version,1);assert.equal((await request('draft')).body.payload.values.customer,'Incomplete client');
 assert.equal((await request('draft',{version:0,payload})).status,409);
 assert.equal((await request('draft',{version:1,payload:{...payload,import_id:B}})).status,404);
 assert.equal((await request('draft',{version:1,payload:null})).body.version,2);
 const imported=(await request('import',{name:'sample.xls',file:sample().toString('base64')})).body;
 const q=(await request('save',{import_id:imported.id,request_id:crypto.randomUUID(),rates:rates(),customer:'Test',reviewed:true})).body;
 assert.equal((await request('status',{id:q.id,status:'declined'})).status,409);
 assert.equal((await request('status',{id:q.id,status:'issued'})).status,200);
 assert.equal((await request('status',{id:q.id,status:'expired'})).status,409);
 assert.equal((await request('status',{id:q.id,status:'declined'})).body.status,'declined');
 const revision=(await request('save',{import_id:imported.id,request_id:crypto.randomUUID(),previous_id:q.id,rates:rates(),customer:'Test',reviewed:true})).body;assert.equal(revision.revision,2);
 const duplicate=(await request('save',{import_id:imported.id,request_id:crypto.randomUUID(),rates:rates(),customer:'Other',reviewed:true})).body;assert.equal(duplicate.revision,1);assert.notEqual(duplicate.family_id,q.family_id);
 await request('status',{id:revision.id,status:'issued'});await app.db.query("update billet_laser_quotes set issued_at=now()-interval '40 days' where id=$1",[revision.id]);
 assert.equal((await request('status',{id:revision.id,status:'accepted'})).status,409);assert.equal((await request('status',{id:revision.id,status:'expired'})).body.status,'expired');
 const permissions=(await app.db.query("select has_table_privilege('authenticated','ovrendi_quote_drafts','SELECT') as draft,has_table_privilege('anon','ovrendi_support_messages','SELECT') as support,has_function_privilege('authenticated','ovrendi_save_draft(uuid,uuid,integer,jsonb)','EXECUTE') as rpc")).rows[0];assert.deepEqual(permissions,{draft:false,support:false,rpc:false});
 }finally{await app.close()}
});
function supportFixture(owner=true){let sent=0;const calls=[];const report={id:A,user_id:U};const sb=async(m,p,b)=>{calls.push({m,p,b});if(p.startsWith('ovrendi_bug_reports'))return owner?[report]:[];if(m==='POST')return[{id:b.id}];return[]};const ctx={Buffer,Date,module:{exports:{}},require:n=>n==='./supabase'?{sb,authAdmin:async()=>({email:'fixture@example.com'})}:n==='./security'?require(root+'/api/_lib/security'):n==='./email'?{sendEmail:async()=>{sent++;return{ok:true}}}:require(n)};vm.runInNewContext(fs.readFileSync(root+'/api/_lib/support.js','utf8'),ctx);return{...ctx.module.exports,calls,sent:()=>sent}}
const res=()=>({code:200,status(n){this.code=n;return this},json(b){this.body=b;return this}});
test('support conversations reject another reporter and ignore submitted tenant or sender identity',async()=>{let f=supportFixture(false),r=res();await f.support({method:'GET',query:{id:A}},r,{account:{id:B},user:{id:U}});assert.equal(r.code,404);assert(f.calls[0].p.includes('account_id=eq.'+B));f=supportFixture();r=res();await f.support({method:'POST',query:{id:A},body:{request_id:B,body:'reply',sender:'staff',author_id:'evil'}},r,{account:{id:A},user:{id:U}});assert.equal(r.code,201);const saved=f.calls.find(c=>c.m==='POST').b;assert.equal(saved.sender,'customer');assert.equal(saved.author_id,U);assert.equal(f.sent(),0)});
test('screenshots reject HTML/SVG, invalid signatures and oversized images',()=>{const f=supportFixture();for(const s of ['data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,SGVsbG8=', 'data:image/jpeg;base64,'+'A'.repeat(560000)])assert.throws(()=>f.screenshot(s));assert.equal(f.screenshot(null),null)});
test('customer flags distinguish trial end, no activity and first quotation',()=>{const ctx={module:{exports:{}},require:n=>n==='./supabase'?{}:require(root+'/api/_lib/security')};vm.runInNewContext(fs.readFileSync(root+'/api/_lib/customer-success.js','utf8'),ctx);const a={id:A,plan:'trial',modules:['laser-quoting'],trial_ends_at:'2026-10-10'};const out=ctx.module.exports.signals(a,[],[],Date.parse('2026-10-09T12:00:00Z'));assert(out.flags.includes('Invite first user'));assert(out.flags.includes('Create first quotation'));assert.equal(out.trial_days_left,2)});
