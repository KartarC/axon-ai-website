
const test=require('node:test'),assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path'),{PGlite}=require('@electric-sql/pglite');const root=path.resolve(__dirname,'..');
const A='10000000-0000-4000-8000-000000000001',E='20000000-0000-4000-8000-000000000001',S='30000000-0000-4000-8000-000000000001';
test('sales conversion, stale edits, onboarding deduplication, attribution and database permissions',async()=>{const db=new PGlite();try{
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create table accounts(id uuid primary key,name text,plan text,modules text[],status text);create table ovrendi_website_enquiries(id uuid primary key,company text,name text,email text);grant usage on schema public to service_role;grant all on all tables in schema public to service_role;");
 await db.exec(fs.readFileSync(root+'/supabase/migrations/20261005061542_ovrendi_internal_crm.sql','utf8'));await db.exec(fs.readFileSync(root+'/supabase/migrations/20261009210758_sales_pipeline.sql','utf8'));
 await db.query('insert into accounts(id) values($1)',[A]);await db.query('insert into ovrendi_website_enquiries values($1,$2,$3,$4)',[E,'Test shop','Customer','test@example.com']);await db.exec('set role service_role');
 const base={company:'Manual shop',contact_name:'Customer',email:'test@example.com',stage:'lead',owner_name:'Staff',next_action:'Discuss needs',due_date:'2026-11-01',estimated_monthly_usd:49,notes:'',lost_reason:'',enquiry_id:E};
 const save=async(id,version,data)=>(await db.query('select ovrendi_save_sale($1,$2,$3,$4) as r',[id,version,data,'staff@example.com'])).rows[0].r;
 let s=await save(S,0,base);assert.equal(s.company,'Test shop');assert.equal(s.version,1);assert.equal((await save(crypto.randomUUID(),0,base)).id,S);assert.equal((await save(S,0,base)).version,1);
 assert((await save(S,1,{...base,stage:'lost'})).error);assert((await save(S,1,{...base,stage:'trial'})).error);assert((await save(S,1,{...base,stage:'qualified',owner_name:''})).error);
 s=await save(S,1,{...base,stage:'trial',account_id:A});assert.equal(s.version,2);assert((await save(S,1,base)).error);assert.equal((await db.query('select count(*)::int n from ovrendi_sales_history where sales_id=$1',[S])).rows[0].n,2);
 const h=(await db.query('select * from ovrendi_sales_history where sales_id=$1 order by created_at desc',[S])).rows;assert(h.every(x=>x.actor_email==='staff@example.com'));
 const onboard=async date=>(await db.query('select ovrendi_sales_onboarding($1,$2) as r',[S,date])).rows[0].r;
 assert.equal((await onboard('2026-11-01')).created,4);assert.equal((await onboard('2026-12-01')).created,0);const tasks=(await db.query('select due_date::text as due_date from ovrendi_crm_tasks where sales_id=$1 order by due_date',[S])).rows;assert.equal(tasks[0].due_date,'2026-11-01');assert.equal(tasks[3].due_date,'2026-11-15');
 await db.query("update ovrendi_crm_workflows set stage='pilot' where account_id=$1",[A]);await onboard('2026-12-01');assert.equal((await db.query('select stage from ovrendi_crm_workflows where account_id=$1',[A])).rows[0].stage,'pilot');assert((await save(S,2,{...base,account_id:null})).error);
 assert.equal((await db.query('select count(*)::int n from ovrendi_sales')).rows[0].n,1);
 const grants=(await db.query("select has_table_privilege('anon','ovrendi_sales','SELECT') a,has_table_privilege('authenticated','ovrendi_sales_history','INSERT') b,has_function_privilege('authenticated','ovrendi_sales_onboarding(uuid,date)','EXECUTE') c")).rows[0];assert.deepEqual(grants,{a:false,b:false,c:false});
 }finally{await db.close()}});
function fixture(){const calls=[];const c={module:{exports:{}},require:n=>n==='./supabase'?{sb:async(...args)=>{calls.push(args);return {id:S}}}:require(root+'/api/_lib/security'),Date};vm.runInNewContext(fs.readFileSync(root+'/api/_lib/sales.js','utf8'),c);return{...c.module.exports,calls}}
test('sales API rejects bad fields and ignores forged audit identity',async()=>{const f=fixture(),response=()=>({status(n){this.code=n;return this},json(v){this.body=v;return this}});const base={id:S,version:0,operation:'save',company:'Shop',stage:'lead'};
 for(const change of [{stage:'admin'},{company:''},{due_date:'2026-02-30'},{estimated_monthly_usd:-1},{account_id:'bad'},{version:-1},{email:'bad'},{notes:'x'.repeat(6001)}]){const r=response();await f.sales({method:'POST',body:{...base,...change}},r,{email:'staff@example.com'});assert.equal(r.code,400)}assert.equal(f.calls.length,0);
 const r=response();await f.sales({method:'POST',body:{...base,actor_email:'forged',modules:['suite']}},r,{email:'real@example.com'});assert.equal(r.code,200);assert.equal(f.calls[0][2].p_actor,'real@example.com');assert.equal(f.calls[0][2].p_data.modules,undefined);
 const code=fs.readFileSync(root+'/api/axon-admin.js','utf8');assert(code.indexOf("if(resource==='sales')")>code.indexOf('if (!staff) return'));
});

