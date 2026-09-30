const {PGlite}=require('@electric-sql/pglite')
const fs=require('fs'),assert=require('node:assert/strict')
const base=require('path').resolve(__dirname,'..')+'/'
const migration=fs.readFileSync(base+'supabase/migrations/20260930193827_billet_security_hardening.sql','utf8')
const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002'
const U='20000000-0000-4000-8000-000000000001',V='20000000-0000-4000-8000-000000000002'
const J='30000000-0000-4000-8000-000000000001',K='30000000-0000-4000-8000-000000000002'
const C='40000000-0000-4000-8000-000000000001'
;(async()=>{
 const db=new PGlite();let count=0
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as 'select null::uuid';
 create function public.gen_random_bytes(n integer) returns bytea language sql as 'select decode(left(repeat(md5(random()::text),n),n*2),''hex'')';
 grant usage on schema public,auth to anon,authenticated,service_role;grant all on auth.users to service_role;`)
 await db.exec(fs.readFileSync(base+'db/phase1_migration.sql','utf8').replace('CREATE EXTENSION IF NOT EXISTS "pgcrypto";',''))
 await db.exec(fs.readFileSync(base+'db/phase4b_migration.sql','utf8'))
 await db.exec(fs.readFileSync(base+'db/phase6_billing_migration.sql','utf8'))
 await db.exec(`create table public.traveler_templates(id uuid primary key,account_id uuid);
 create table public.traveler_template_steps(id uuid primary key,template_id uuid);
 create table public.traveler_steps(id uuid primary key,account_id uuid,job_id uuid,board_entry_id uuid);
 create table public.job_quotes(id uuid primary key,account_id uuid,job_id uuid);
 create table public.job_cost_entries(id uuid primary key,account_id uuid,job_id uuid,board_entry_id uuid);
 create table public.website_leads(id uuid primary key);
 create table public.wavlon_fixture(id uuid primary key);
 create schema company;
 create view company.v_axon_account_health as select id,name from public.accounts;
 grant usage on schema company to anon,authenticated,service_role;
 grant select on company.v_axon_account_health to authenticated,service_role;
 grant all on all tables in schema public to anon,authenticated,service_role;`)
 await db.exec(migration);await db.exec(migration);count+=2
 let q=await db.query(`select has_table_privilege('authenticated','accounts','UPDATE') as auth_write,
 has_table_privilege('anon','jobs','SELECT') as anon_read,
 has_table_privilege('authenticated','jobs','SELECT') as auth_read,
 has_table_privilege('service_role','accounts','UPDATE') as service_write,
 has_table_privilege('authenticated','wavlon_fixture','UPDATE') as wavlon_unchanged,
 has_function_privilege('authenticated','public.billet_accept_invite(text,uuid,text)','EXECUTE') as rpc_public,
 has_function_privilege('service_role','public.billet_accept_invite(text,uuid,text)','EXECUTE') as rpc_service`)
 assert.deepEqual(q.rows[0],{auth_write:false,anon_read:false,auth_read:false,service_write:true,wavlon_unchanged:true,rpc_public:false,rpc_service:true});count++
 q=await db.query(`select has_table_privilege('authenticated','company.v_axon_account_health','SELECT') as signed_in_read,
 has_table_privilege('service_role','company.v_axon_account_health','SELECT') as service_read,
 has_function_privilege('anon','public.my_account_id()','EXECUTE') as anon_helper`)
 assert.deepEqual(q.rows[0],{signed_in_read:false,service_read:true,anon_helper:false});count++
 await db.exec(`insert into auth.users values('${U}'),('${V}');
 insert into accounts(id,name,slug,plan,modules) values('${A}','Test A','test-a','trial',array['production-board']),('${B}','Test B','test-b','trial',array['production-board']);
 insert into jobs(id,account_id,job_number,part_name) values('${J}','${A}','J1','part'),('${K}','${B}','J2','part');
 insert into customers(id,account_id,name) values('${C}','${B}','Other shop customer');
 insert into account_invites(account_id,email,role,token) values('${A}','test@example.invalid','viewer','token-one'),('${B}','test@example.invalid','admin','token-other');`)
 await db.exec('set role service_role')
 q=await db.query('select public.billet_accept_invite($1,$2,$3) as r',['token-one',U,'wrong@example.invalid']);assert.equal(q.rows[0].r.ok,false);count++
 q=await db.query('select public.billet_accept_invite($1,$2,$3) as r',['token-one',U,'test@example.invalid']);assert.equal(q.rows[0].r.ok,true);count++
 q=await db.query('select public.billet_accept_invite($1,$2,$3) as r',['token-one',U,'test@example.invalid']);assert.equal(q.rows[0].r.ok,false);count++
 q=await db.query('select public.billet_accept_invite($1,$2,$3) as r',['token-other',U,'test@example.invalid']);assert.equal(q.rows[0].r.ok,false);count++
 await db.exec(`insert into account_invites(account_id,email,role,token) values('${A}','test@example.invalid','admin','token-repeat');`)
 await db.query('select public.billet_accept_invite($1,$2,$3)',['token-repeat',U,'test@example.invalid'])
 q=await db.query('select role from account_users where user_id=$1',[U]);assert.equal(q.rows[0].role,'viewer');count++
 await assert.rejects(()=>db.query('update jobs set customer_id=$1 where id=$2',[C,J]),/Customer does not belong/);count++
 await assert.rejects(()=>db.query('insert into traveler_steps(id,account_id,job_id) values($1,$2,$3)',[C,A,K]),/Job does not belong/);count++
 await assert.rejects(()=>db.query('update jobs set account_id=$1 where id=$2',[B,J]),/Account ownership/);count++
 await db.query('insert into traveler_steps(id,account_id,job_id) values($1,$2,$3)',[C,A,J]);count++
 const event=(id,created,type,obj)=>({id,created,type,data:{object:obj}})
 const checkout={mode:'subscription',payment_status:'paid',customer:'cus_test',subscription:'sub_test',metadata:{account_id:A,plan:'growth'}}
 const apply=async e=>(await db.query('select public.billet_process_billing_event($1::jsonb) as r',[JSON.stringify(e)])).rows[0].r
 await apply(event('evt_new',200,'checkout.session.completed',checkout))
 q=await db.query('select plan,modules,stripe_event_created from accounts where id=$1',[A]);assert.equal(q.rows[0].plan,'growth');assert.equal(q.rows[0].modules.length,3);count++
 assert.equal((await apply(event('evt_new',200,'checkout.session.completed',checkout))).duplicate,true);count++
 await apply(event('evt_old',100,'checkout.session.completed',{...checkout,metadata:{account_id:A,plan:'starter'}}))
 q=await db.query('select plan from accounts where id=$1',[A]);assert.equal(q.rows[0].plan,'growth');count++
 await apply(event('evt_unpaid',300,'checkout.session.completed',{...checkout,payment_status:undefined,metadata:{account_id:A,plan:'suite'}}))
 q=await db.query('select plan from accounts where id=$1',[A]);assert.equal(q.rows[0].plan,'growth');count++
 await assert.rejects(()=>apply(event('evt_bad',400,'checkout.session.completed',{...checkout,customer:'foreign'})),/customer mismatch/)
 q=await db.query("select count(*)::int as n from billet_billing_events where event_id='evt_bad'");assert.equal(q.rows[0].n,0);count++
 await apply(event('evt_deleted',500,'customer.subscription.deleted',{id:'sub_test'}))
 await apply(event('evt_late',600,'checkout.session.completed',checkout))
 q=await db.query('select status from accounts where id=$1',[A]);assert.equal(q.rows[0].status,'suspended');count++
 await apply(event('evt_early_delete',800,'customer.subscription.deleted',{id:'sub_other',metadata:{account_id:B}}))
 await apply(event('evt_delayed_checkout',700,'checkout.session.completed',{...checkout,subscription:'sub_other',metadata:{account_id:B,plan:'starter'}}))
 q=await db.query('select status from accounts where id=$1',[B]);assert.equal(q.rows[0].status,'suspended');count++
 await db.exec('reset role;set role authenticated')
 await assert.rejects(()=>db.query('update accounts set plan=$1 where id=$2',['suite',A]),/permission denied/);count++
 await assert.rejects(()=>db.query('select public.billet_accept_invite($1,$2,$3)',['token-one',U,'test@example.invalid']),/permission denied/);count++
 await db.close();console.log(`${count} PostgreSQL migration checks passed; production was not touched.`)
})().catch(e=>{console.error(e.message);process.exitCode=1})
