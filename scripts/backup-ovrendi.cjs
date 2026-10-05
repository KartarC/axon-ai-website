// Encrypted application-data export. This is not a Supabase/Auth/Storage backup.
const fs=require('fs'),crypto=require('crypto'),path=require('path');
const tables=['accounts','account_users','account_invites','customers','machines','jobs','board_entries','traveler_templates','traveler_template_steps','traveler_steps','job_quotes','job_cost_entries','billet_billing_events','billet_laser_profiles','billet_laser_imports','billet_laser_quotes','website_leads'];
async function main(){
 const [envFile,outFile]=process.argv.slice(2);if(!envFile||!outFile)throw Error('Provide temporary environment file and encrypted output path');
 const env={};for(const line of fs.readFileSync(envFile,'utf8').split(/\r?\n/)){const m=line.match(/^([A-Z_]+)=(.*)$/);if(m)env[m[1]]=m[2].startsWith('"')?JSON.parse(m[2]):m[2]}
 if(env.SUPABASE_URL!=='https://emdgtyaggcbqaxsdrsaa.supabase.co')throw Error('Unexpected project');
 const key=Buffer.from(process.env.OVRENDI_BACKUP_KEY||'','base64');if(key.length!==32)throw Error('A 256-bit encryption key is required');
 const snapshot={version:1,project:'emdgtyaggcbqaxsdrsaa',started_at:new Date().toISOString(),kind:'application-data-export-not-full-database-backup',tables:{}};
 for(const table of tables){let offset=0;const rows=[];while(true){const id=table==='billet_billing_events'?'event_id':'id';const res=await fetch(env.SUPABASE_URL+'/rest/v1/'+table+'?select=*&order='+id+'&limit=500&offset='+offset,{headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY}});if(!res.ok)throw Error('Export failed for '+table+' ('+res.status+')');const batch=await res.json();rows.push(...batch);if(batch.length<500)break;offset+=batch.length;}snapshot.tables[table]=rows;}
 snapshot.completed_at=new Date().toISOString();const plain=Buffer.from(JSON.stringify(snapshot)),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([cipher.update(plain),cipher.final()]);
 const archive=JSON.stringify({version:1,algorithm:'aes-256-gcm',iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')});fs.writeFileSync(outFile,archive,{flag:'wx'});
 // Recovery drill: read disk, authenticate/decrypt, and verify every row survives exactly.
 const restored=JSON.parse(fs.readFileSync(outFile,'utf8'));const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(restored.iv,'base64'));decipher.setAuthTag(Buffer.from(restored.tag,'base64'));const recovered=Buffer.concat([decipher.update(Buffer.from(restored.data,'base64')),decipher.final()]);if(!plain.equals(recovered))throw Error('Recovery mismatch');
 const report={created_at:snapshot.completed_at,project:snapshot.project,kind:snapshot.kind,encrypted_archive:path.basename(outFile),archive_sha256:crypto.createHash('sha256').update(archive).digest('hex'),table_counts:Object.fromEntries(Object.entries(snapshot.tables).map(([k,v])=>[k,v.length])),recovery:'Authenticated decryption and exact row-content comparison passed. No production restore performed.',limitations:['Export is not a transaction-consistent database snapshot.','Does not include auth identities/passwords, Storage objects, database schema or provider settings.','Retain the encryption key separately in a secure recovery store before relying on this export.']};
 fs.writeFileSync(outFile+'.manifest.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));key.fill(0);
}
main().catch(()=>{console.error('Backup failed. No credentials or customer records logged.');process.exitCode=1});

