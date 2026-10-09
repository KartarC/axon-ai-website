const {sb}=require('./supabase');
const {isUuid}=require('./security');
function safePage(value){
 if(typeof value!=='string')return '/';
 const p=value.split(/[?#]/)[0];
 // Store route categories, not customer names, document IDs or reset tokens.
 if(p.startsWith('/app/modules/')){const module=p.split('/')[3];return ['laser-quoting','production-board','job-costing','shop-traveler','customer-portal','maintenance','materials','coc','crm','outside-service'].includes(module)?'/app/modules/'+module+'/':'/app/other'}
 if(p.startsWith('/app/'))return ['/app/signup.html','/app/login.html','/app/billing.html','/app/dashboard.html','/app/settings.html','/app/getting-started.html','/app/support.html'].includes(p)?p:'/app/other';
 if(/^\/articles\/[a-z0-9-]+\/?$/.test(p))return p.slice(0,120);
 return ['/','/index.html','/pricing.html','/erp/','/crm/','/studio/','/ai/','/about/','/contact/','/articles/','/tools.html','/website-design.html','/compare-proshop.html','/packages/starter/','/packages/growth/','/packages/suite/'].includes(p)?p:'/other';
}
function tracking(t){return t&&t.consent===true&&isUuid(t.session_id)?{session_id:t.session_id,page:safePage(t.page),source:['direct','search','social','referral','email','paid'].includes(t.source)?t.source:'direct'}:null}
async function conversion(t,form){const data=tracking(t);if(!data)return;try{await sb('POST','ovrendi_web_events',{...data,form,kind:'form_success'})}catch(_){/* Analytics must never fail a successful submission. */}}
async function staffEngagement(req,res){
 const resource=req.query.resource;
 if(req.method==='GET')return res.status(200).json(await sb(resource==='bugs'?'GET':'POST',resource==='bugs'?'ovrendi_bug_reports?select=*&order=created_at.desc&limit=500':resource==='customer-activity'?'rpc/ovrendi_customer_activity':'rpc/ovrendi_web_summary',resource==='bugs'?undefined:{}));
 if(resource==='bugs'&&req.method==='PATCH'){
  if(!isUuid(req.query.id)||!['new','investigating','resolved','closed'].includes(req.body?.status)||typeof req.body?.staff_notes!=='string'||req.body.staff_notes.length>4000)return res.status(400).json({error:'Invalid report update'});
  const rows=await sb('PATCH','ovrendi_bug_reports?id=eq.'+req.query.id,{status:req.body.status,staff_notes:req.body.staff_notes,updated_at:new Date().toISOString()});
  return res.status(rows?.length?200:404).json(rows?.[0]||{error:'Report not found'});
 }
 return res.status(405).json({error:'Method not allowed'});
}
module.exports={safePage,tracking,conversion,staffEngagement};
