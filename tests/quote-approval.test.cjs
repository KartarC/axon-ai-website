
const test=require('node:test'),assert=require('node:assert/strict');
const {start}=require('./laser-browser-server.cjs'),{sample,rates}=require('./laser-fixture.cjs');
const B='10000000-0000-4000-8000-000000000002';
test('customer approvals isolate tenants, redact costs, reject stale links and record responses exactly once',async()=>{
 const app=await start();let checks=0;try{
  async function request(action,body,auth=true){const r=await fetch(app.url+'/api/laser-quotes?action='+action,{method:body?'POST':'GET',headers:{...(auth?{authorization:'Bearer test-token'}:{}),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()}}
  async function publicCall(token,extra={}){const r=await fetch(app.url+'/api/quote-review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token,action:'read',...extra})});return {status:r.status,body:await r.json()}}
  const imported=(await request('import',{name:'sample.xls',file:sample().toString('base64')})).body;
  const make=async previous=>(await request('save',{import_id:imported.id,request_id:crypto.randomUUID(),previous_id:previous,rates:rates(),customer:'Test <img src=x onerror=alert(1)>',reviewed:true,reference:'RFQ-1',terms:'Delivery after approval.'})).body;
  const link=async id=>request('approval',{id,operation:'create'});
  const issue=async id=>request('status',{id,status:'issued'});
  const token=r=>r.body.url.split('#')[1];
  let q=await make();assert.equal((await link(q.id)).status,409);checks++;
  assert.equal((await request('approval',{id:q.id,operation:'create'},false)).status,401);checks++;
  assert.equal((await link(B)).status,409);checks++;
  await issue(q.id);const l=await link(q.id);assert.equal(l.status,200);assert.equal(token(l).length,64);assert(!('token_hash' in l.body));checks+=3;
  let read=await publicCall(token(l));assert.equal(read.status,200);assert.equal(read.body.customer,q.customer);assert.equal(read.body.price,q.result.price);checks+=3;
  for(const key of ['source','result','account_id','rates','components','margin','basis','charges','usage'])assert(!(key in read.body));checks+=9;
  const stored=(await app.db.query('select token_hash from ovrendi_quote_links where quote_id=$1',[q.id])).rows[0];assert.notEqual(stored.token_hash,token(l));checks++;
  const bad=await publicCall('0'.repeat(64));assert.equal(bad.status,409);checks++;
  assert.equal((await publicCall(token(l),{action:'respond',decision:'accepted'})).status,400);checks++;
  const data={action:'respond',decision:'accepted',name:'Test Customer',email:'test@example.com',purchase_order:'PO-27',message:'Approved',confirmed:true,request_id:crypto.randomUUID()};
  read=await publicCall(token(l),data);assert.equal(read.status,200);assert.equal(read.body.response,'accepted');assert.equal(read.body.status,'accepted');checks+=3;
  assert.equal((await publicCall(token(l),data)).status,200);assert.equal((await publicCall(token(l),{...data,decision:'declined',request_id:crypto.randomUUID()})).status,409);checks+=2;
  assert.equal((await make(q.id)).error,'Open the latest unaccepted revision before revising.');checks++;
  const history=(await request('approval&id='+q.id)).body;assert.equal(history.length,1);assert.equal(history[0].purchase_order,'PO-27');assert(!('token_hash' in history[0]));checks+=3;
  q=await make();await issue(q.id);let original=await link(q.id),replacement=await link(q.id);assert.equal((await publicCall(token(original))).status,409);checks++;
  await request('approval',{id:q.id,operation:'revoke'});assert.equal((await publicCall(token(replacement))).status,409);checks++;
  original=await link(q.id);const revised=await make(q.id);assert.equal(revised.revision,2);assert.equal((await publicCall(token(original),data)).status,409);checks+=2;
  await issue(revised.id);original=await link(revised.id);assert.equal((await publicCall(token(original),{...data,decision:'changes_requested',message:''})).status,400);checks++;
  assert.equal((await publicCall(token(original),{...data,decision:'changes_requested',message:'Please change quantity'})).body.response,'changes_requested');assert.equal((await publicCall(token(original))).body.can_respond,false);checks+=2;
  assert.equal((await request('quotes&id='+revised.id)).body.status,'issued');checks++;
  replacement=await link(revised.id);await app.db.query("update ovrendi_quote_links set expires_at=now()-interval '1 minute' where quote_id=$1",[revised.id]);assert.equal((await publicCall(token(replacement),data)).status,409);checks++;
  const permissions=(await app.db.query("select has_table_privilege('anon','ovrendi_quote_links','SELECT') a,has_table_privilege('authenticated','ovrendi_quote_links','UPDATE') b,has_function_privilege('anon','ovrendi_public_quote(text,text,jsonb)','EXECUTE') c")).rows[0];assert.deepEqual(permissions,{a:false,b:false,c:false});checks++;
  // Foreign tenant cannot list or revoke the first tenant's links even with a valid staff role.
  await app.db.exec('reset role');await app.db.query('insert into accounts values($1)',[B]);await app.db.query("insert into account_users values($1,$2,'owner')",[B,app.user.id]);await app.db.exec('set role service_role');
  for(const action of ['list','revoke','create']){const r=(await app.db.query('select ovrendi_manage_quote_link($1,$2,$3,$4,$5) as r',[B,app.user.id,q.id,action,'a'.repeat(64)])).rows[0].r;assert.equal(r.error,'Quote not found.');checks++}
  // Two submissions cannot produce conflicting accepted/declined states.
  q=await make();await issue(q.id);original=await link(q.id);const outcomes=await Promise.all([publicCall(token(original),{...data,request_id:crypto.randomUUID()}),publicCall(token(original),{...data,decision:'declined',request_id:crypto.randomUUID()})]);assert.deepEqual(outcomes.map(x=>x.status).sort(),[200,409]);checks++;
  console.log(checks+' approval safety and lifecycle checks passed');
 }finally{await app.close()}
});
