const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto'),os=require('os'),{spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..');
test('past-due accounts can reach billing but not operational APIs; administrative suspension still blocks',async()=>{
 const account={id:'10000000-0000-4000-8000-000000000001',status:'active',plan:'growth',billing_status:'past_due'};
 const sandbox={module:{exports:{}},console,process:{env:{SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture'}},require:n=>require(path.join(root,'api/_lib',n)),fetch:async url=>({ok:true,json:async()=>({id:'20000000-0000-4000-8000-000000000001'}),text:async()=>{assert(url.includes('stripe_subscription_id,billing_status'));return JSON.stringify([{role:'owner',accounts:account}])}})};
 vm.runInNewContext(fs.readFileSync(root+'/api/_lib/supabase.js','utf8'),sandbox);
 const req={headers:{authorization:'Bearer fixture'},query:{}};
 const response=()=>({code:200,setHeader(){},status(n){this.code=n;return this},json(body){this.body=body}});
 let res=response();assert.equal(await sandbox.module.exports.requireAuth(req,res),null);assert.equal(res.code,402);
 res=response();assert(await sandbox.module.exports.requireAuth(req,res,{allowExpired:true}));
 account.status='suspended';res=response();assert.equal(await sandbox.module.exports.requireAuth(req,res,{allowExpired:true}),null);assert.equal(res.code,403);
});
test('encrypted export can be recovered exactly; wrong keys are rejected (synthetic data only)',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ovrendi-backup-test-'));
 try {
 const env=path.join(dir,'fixture.env'),out=path.join(dir,'fixture.backup.enc'),key=crypto.randomBytes(32);
 fs.writeFileSync(env,'SUPABASE_URL="https://emdgtyaggcbqaxsdrsaa.supabase.co"\nSUPABASE_SERVICE_ROLE_KEY="fixture-only"');
 const code=`global.fetch=async()=>({ok:true,json:async()=>[{id:'fixture',value:'synthetic recovery check'}]});process.argv=['node','script',${JSON.stringify(env)},${JSON.stringify(out)}];require(${JSON.stringify(root+'/scripts/backup-ovrendi.cjs')});`;
 const result=spawnSync(process.execPath,['-e',code],{env:{...process.env,OVRENDI_BACKUP_KEY:key.toString('base64')},encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 const archive=JSON.parse(fs.readFileSync(out,'utf8'));assert(!fs.readFileSync(out,'utf8').includes('synthetic recovery check'));
 const decrypt=k=>{const d=crypto.createDecipheriv('aes-256-gcm',k,Buffer.from(archive.iv,'base64'));d.setAuthTag(Buffer.from(archive.tag,'base64'));return Buffer.concat([d.update(Buffer.from(archive.data,'base64')),d.final()])};
 assert.equal(JSON.parse(decrypt(key)).tables.accounts[0].value,'synthetic recovery check');assert.throws(()=>decrypt(crypto.randomBytes(32)));
 } finally {fs.rmSync(dir,{recursive:true,force:true})}
});
test('AI disclosure and data minimization are wired together',()=>{
 const api=fs.readFileSync(root+'/api/quote-suggest.js','utf8'),ui=fs.readFileSync(root+'/app/modules/job-costing/index.js','utf8');
 assert(api.includes('req.body?.ai_consent !== true'));assert(ui.includes('ai_consent: true'));assert(!api.includes('- Notes: ${target.notes}'));assert(!api.includes('- Part: ${target.part_name}'));
});
