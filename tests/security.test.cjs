const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const crypto = require('node:crypto')
const root = path.resolve(__dirname, '..')
const security = require('../api/_lib/security')
const A='10000000-0000-4000-8000-000000000001', U='10000000-0000-4000-8000-000000000002'
const J='10000000-0000-4000-8000-000000000003', E='10000000-0000-4000-8000-000000000004'
const T='a'.repeat(64)
function response() {return {code:200,status(n){this.code=n;return this},json(v){this.body=v;return this},setHeader(){},end(){}}}
function request(method='GET',query={},body={}) {return {method,query,body,headers:{},async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify(body))}}}
function setup(file,{role='viewer',sb=async()=>[],extra={},env={}}={}) {
 const ctx={user:{id:U,email:'member@example.invalid'},role,account:{id:A,status:'active',plan:'suite',modules:['production-board','shop-traveler','job-costing'],stripe_customer_id:'cus_test'}}
 const deps={sb,requireAuth:async(req,res)=>security.validateIds(req,res)?ctx:null,requireModule:()=>true,cors(){},
   requireRole:(c,roles,res)=>{if(roles.includes(c.role))return true;res.status(403).json({error:'Forbidden'});return false},
   requireRecord:async(c,t,id,res)=>{const rows=await sb('GET',`${t}?id=eq.${id}&account_id=eq.${c.account.id}`);if(!rows.length){res.status(404).json({error:'Not found'});return null}return rows[0]},
   authAdmin:async()=>{throw Error('Unexpected auth mutation')},validateToken:async()=>null,...extra.helpers}
 const sandbox={Buffer,URLSearchParams,console,process:{env:{STRIPE_SECRET_KEY:'test-key',STRIPE_WEBHOOK_SECRET:'test-webhook',...env}},
   fetch:async()=>{throw Error('Unexpected network request')},...extra,
   require:n=>n==='./_lib/supabase'?deps:n==='./_lib/security'?security:n==='./_lib/email'?{}:require(n)}
 let source=fs.readFileSync(path.join(root,file),'utf8').replace('export default async function handler','async function handler').replace('export const config','const config')
 vm.createContext(sandbox);vm.runInContext(source+'\nthis.handler=handler',sandbox)
 return sandbox
}
test('viewer cannot read invite tokens or create a billing portal session',async()=>{
 for(const [file,req] of [['api/settings.js',request('GET',{resource:'team'})],['api/billing.js',request('POST',{action:'portal'})]]) {
  const app=setup(file,{sb:async()=>{throw Error('Unexpected database access')}}),res=response();await app.handler(req,res);assert.equal(res.code,403)
 }
})
test('owner can create a billing portal session',async()=>{
 let called=false;const app=setup('api/billing.js',{role:'owner',extra:{fetch:async()=>{called=true;return {ok:true,json:async()=>({url:'https://example.invalid'})}}}})
 const res=response();await app.handler(request('POST',{action:'portal'}),res);assert.equal(res.code,200);assert(called)
})
test('viewers cannot write board progress, drag cards, or edit traveler steps',async()=>{
 for(const [file,req] of [['api/board.js',request('PATCH',{id:E},{status:'complete'})],['api/board.js',request('POST',{action:'move'},{id:E,board_col:'complete'})],['api/traveler.js',request('PATCH',{id:E},{instructions:'change'})]]) {
  const app=setup(file,{sb:async()=>{throw Error('Unexpected database access')}}),res=response();await app.handler(req,res);assert.equal(res.code,403)
 }
})
test('operators may change progress but not machine assignments or instructions',async()=>{
 for(const file of ['api/board.js','api/traveler.js']) {
  const app=setup(file,{role:'operator'}),res=response();await app.handler(request('PATCH',{id:E},{instructions:'change',machine_id:J}),res);assert.equal(res.code,403)
 }
 let written=false;const app=setup('api/board.js',{role:'operator',sb:async(m)=>{if(m==='PATCH')written=true;return [{id:E}]}}),res=response()
 await app.handler(request('PATCH',{id:E},{status:'running'}),res);assert.equal(res.code,200);assert(written)
})
test('foreign templates and jobs cannot receive traveler steps',async()=>{
 for(const [action,body] of [['apply',{job_id:J,template_id:E}],['',{job_id:J,title:'step'}]]) {
  let written=false;const app=setup('api/traveler.js',{role:'manager',sb:async(m,p)=>{if(m==='POST')written=true;return action==='apply'&&p.startsWith('jobs?')?[{id:J}]:[]}}),res=response()
  await app.handler(request('POST',action?{action}:{},body),res);assert.equal(res.code,404);assert(!written)
 }
})
test('foreign machine and customer references cannot be saved',async()=>{
 for(const [file,body] of [['api/board.js',{job_id:J,machine_id:E}],['api/jobs.js',{job_number:'J1',part_name:'part',customer_id:E}]]) {
  let written=false;const app=setup(file,{role:'manager',sb:async(m,p)=>{if(m==='POST')written=true;return p.startsWith('jobs?')?[{id:J}]:[]}}),res=response()
  await app.handler(request('POST',{},body),res);assert.equal(res.code,404);assert(!written)
 }
})
test('filter syntax in IDs and tokens is rejected before database access',async()=>{
 for(const [file,req] of [['api/jobs.js',request('GET',{id:J+'&select=*'})],['api/operator.js',request('GET',{token:'a'.repeat(32)+'&limit=1'})],['api/auth.js',request('GET',{action:'accept-invite',token:T+'&select=*'})]]) {
  const app=setup(file,{sb:async()=>{throw Error('Unexpected database access')}}),res=response();await app.handler(req,res);assert.equal(res.code,400)
 }
})
test('viewer API responses omit QR write capabilities',async()=>{
 for(const file of ['api/jobs.js','api/board.js','api/traveler.js']) {
  const app=setup(file,{sb:async()=>[{id:J,public_token:'private',jobs:{public_token:'private'}}]}),res=response()
  await app.handler(request('GET',file.includes('traveler')?{job_id:J}:{}),res)
  const job=file.includes('traveler')?res.body.job:file.includes('board')?res.body[0].jobs:res.body[0]
  assert.equal(job.public_token,undefined)
 }
})
function inviteSetup(extra={}) {
 const calls=[];const app=setup('api/auth.js',{sb:async(m,p,b)=>{calls.push({m,p,b});return p.startsWith('account_invites')?[{email:'member@example.invalid',expires_at:'2099-01-01'}]:{ok:true}},extra})
 return {app,calls}
}
test('wrong existing password never triggers an admin password reset or invitation consumption',async()=>{
 const adminCalls=[];const {app,calls}=inviteSetup({fetch:async()=>({ok:false}),helpers:{authAdmin:async(...args)=>{adminCalls.push(args);throw Error('Already registered')}}})
 const res=response();await app.handler(request('POST',{action:'accept-invite'},{token:T,password:'wrong-password'}),res)
 assert.equal(res.code,403);assert(adminCalls.every(c=>c[0]==='POST'&&c[1]==='users'));assert(!calls.some(c=>c.p.startsWith('rpc/')))
})
test('existing password authenticates the user and consumes invite through atomic RPC',async()=>{
 const {app,calls}=inviteSetup({fetch:async()=>({ok:true,json:async()=>({user:{id:U,email:'member@example.invalid'},access_token:'test-session'})})})
 const res=response();await app.handler(request('POST',{action:'accept-invite'},{token:T,password:'right-password'}),res)
 assert.equal(res.code,200);assert.equal(calls.find(c=>c.p==='rpc/billet_accept_invite').b.p_user_id,U)
})
test('new invite identity is created without modifying any existing user',async()=>{
 let attempts=0,created=false;const {app}=inviteSetup({fetch:async()=>++attempts===1?{ok:false}:{ok:true,json:async()=>({user:{id:U,email:'member@example.invalid'},access_token:'test-session'})},helpers:{authAdmin:async(m,p)=>{assert.equal(m,'POST');assert.equal(p,'users');created=true}}})
 const res=response();await app.handler(request('POST',{action:'accept-invite'},{token:T,password:'new-password'}),res);assert.equal(res.code,200);assert(created)
})
test('an authenticated user cannot accept an invite for another email',async()=>{
 const {app,calls}=inviteSetup({helpers:{validateToken:async()=>({id:U,email:'other@example.invalid'})}}),req=request('POST',{action:'accept-invite'},{token:T});req.headers.authorization='Bearer test-session'
 const res=response();await app.handler(req,res);assert.equal(res.code,403);assert(!calls.some(c=>c.p.startsWith('rpc/')))
})
test('cron refuses absent and incorrect secrets before database work',async()=>{
 for(const [secret,expected] of [[undefined,503],['configured',401]]) {
  const app=setup('api/billing.js',{env:{CRON_SECRET:secret},sb:async()=>{throw Error('Unexpected database access')}}),res=response()
  await app.handler(request('GET',{action:'cron'}),res);assert.equal(res.code,expected)
 }
})
test('webhooks reject stale signatures and accept any valid current v1 during rotation',async()=>{
 for(const [age,expected] of [[600,400],[0,200]]) {
  let writes=0;const app=setup('api/billing.js',{sb:async()=>{writes++;return {ok:true}}}),body={id:'evt_test',created:Math.floor(Date.now()/1000),type:'checkout.session.completed',data:{object:{}}}
  const req=request('POST',{action:'webhook'},body),t=Math.floor(Date.now()/1000)-age
  const sig=crypto.createHmac('sha256','test-webhook').update(`${t}.${JSON.stringify(body)}`).digest('hex')
  req.headers['stripe-signature']=`t=${t},v1=${sig},v1=${'0'.repeat(64)}`
  const res=response();await app.handler(req,res);assert.equal(res.code,expected);assert.equal(writes,expected===200?1:0)
 }
})
test('oversized billing request is rejected',async()=>{
 const app=setup('api/billing.js'),req=request('POST',{action:'webhook'},{payload:'x'.repeat(1024*1024)}),res=response()
 await app.handler(req,res);assert.equal(res.code,413)
})
test('QR cannot modify a different job entry or bypass required sign-off',async()=>{
 for(const body of [{action:'complete',entry_id:U},{action:'complete_step',step_id:E,dimension_value:'0'}]) {
  let writes=0;const app=setup('api/operator.js',{sb:async(m,p)=>{
   if(m!=='GET'){writes++;return []}
   if(p.startsWith('jobs?'))return [{id:J,account_id:A}]
   if(p.startsWith('accounts?'))return [{status:'active',plan:'suite',modules:['production-board','shop-traveler']}]
   if(p.startsWith('board_entries?'))return [{id:E,status:'running'}]
   return [{id:E,requires_sign_off:true}]
  }}),res=response();await app.handler(request('POST',{token:'a'.repeat(32)},body),res)
  assert([400,404].includes(res.code));assert.equal(writes,0)
 }
})
test('required dimensions and signoffs enforced, including zero measurements',()=>{
 assert(security.completionError({requires_dimension:true},{status:'complete'},true))
 assert.equal(security.completionError({requires_dimension:true},{status:'complete',dimension_value:0},true),null)
 assert(security.completionError({requires_sign_off:true},{status:'complete'},true))
 assert.equal(security.completionError({requires_sign_off:true},{status:'complete',sign_off:true},true),null)
})
test('admin query-string secret is rejected and header works',async()=>{
 const app=setup('api/leads.js',{env:{ADMIN_SECRET:'test-admin'},extra:{fetch:async()=>({ok:true,json:async()=>[]})}})
 let res=response();await app.handler(request('GET',{secret:'test-admin'}),res);assert.equal(res.code,401)
 const req=request();req.headers['x-admin-secret']='test-admin';res=response();await app.handler(req,res);assert.equal(res.code,200)
})
test('refresh uses shared configuration without login-page globals',async()=>{
 let requested;const values={axon_access_token:'old',axon_refresh_token:'refresh',axon_account:'{}'}
 const ctx={SUPABASE_URL:'https://auth.example.invalid',SUPABASE_ANON:'public-test-key',window:{},sessionStorage:{getItem:k=>values[k],setItem:(k,v)=>values[k]=v,removeItem:k=>delete values[k]},fetch:async(url,opts)=>{requested={url,opts};return {ok:true,json:async()=>({access_token:'new',refresh_token:'new-refresh'})}}}
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'app/_shared/auth.js'),'utf8').replace(/^import .*$/mg,'').replace(/export /g,''),ctx)
 assert.equal(await ctx.refreshToken(),'new');assert.equal(requested.url,'https://auth.example.invalid/auth/v1/token?grant_type=refresh_token');assert.equal(requested.opts.headers.apikey,'public-test-key')
})
test('concurrent failed refresh rejects all waiters and retry is bounded',async()=>{
 for(const refreshWorks of [false,true]) {
  let refreshes=0;const ctx={getSession:()=>({token:'test'}),clearSession(){},refreshToken:async()=>{refreshes++;await new Promise(r=>setTimeout(r,5));return refreshWorks?'new':null},fetch:async()=>({status:401}),window:{location:{}},location:{pathname:'/app/jobs/'}}
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'app/_shared/api.js'),'utf8').replace(/^import .*$/mg,'').replace(/export /g,''),ctx)
  const results=await Promise.allSettled([ctx.apiGet('/api/jobs'),ctx.apiGet('/api/board')]);assert(results.every(r=>r.status==='rejected'));assert.equal(refreshes,1)
 }
})
