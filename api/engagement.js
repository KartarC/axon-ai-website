const {sb,requireAuth,cors}=require('./_lib/supabase');
const {safePage,tracking}=require('./_lib/engagement');
export default async function handler(req,res){
 cors(res);res.setHeader('Cache-Control','no-store');if(req.method==='OPTIONS')return res.status(200).end();
 try{
 const action=req.query.action;
 if(action==='event'&&req.method==='POST'){
  const origin=req.headers.origin;
  if(!['https://getovrendi.com','https://www.getovrendi.com','https://axon-ai-website-three.vercel.app'].includes(origin))return res.status(403).json({error:'Origin not allowed'});
  if(!process.env.CRON_SECRET)return res.status(503).json({error:'Analytics unavailable'});
  const minute=Math.floor(Date.now()/60000);
  const ip=req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||'unknown';
  const bucket=require('crypto').createHmac('sha256',process.env.CRON_SECRET).update(String(ip).split(',')[0]+':'+minute).digest('hex');
  if(!await sb('POST','rpc/ovrendi_event_allow',{p_bucket:bucket}))return res.status(429).json({error:'Please slow down'});
  const data=tracking(req.body);if(!data||!['page_view','form_start','cta_click'].includes(req.body.kind)||!['','demo','signup'].includes(req.body.form||''))return res.status(400).json({error:'Invalid analytics event'});
  const recent=await sb('GET',`ovrendi_web_events?session_id=eq.${data.session_id}&created_at=gt.${new Date(Date.now()-60000).toISOString()}&select=id&limit=31`);
  if(recent?.length>=30)return res.status(429).json({error:'Please slow down'});
  await sb('POST','ovrendi_web_events',{...data,kind:req.body.kind,form:req.body.form||''});return res.status(200).json({ok:true});
 }
 const ctx=await requireAuth(req,res,{allowExpired:true});if(!ctx)return;
 if(action==='support')return require('./_lib/support').support(req,res,ctx);
 if(action==='presence'&&req.method==='POST'){
  const path=`ovrendi_user_presence?account_id=eq.${ctx.account.id}&user_id=eq.${ctx.user.id}`;
  const rows=await sb('GET',path+'&select=last_seen_at');if(rows?.[0]&&Date.now()-Date.parse(rows[0].last_seen_at)<45000)return res.status(200).json({ok:true});
  if(rows?.length)await sb('PATCH',path,{last_seen_at:new Date().toISOString(),page:safePage(req.body?.page),last_login_at:ctx.user.last_sign_in_at||null,email:ctx.user.email||null});
  else await sb('POST','ovrendi_user_presence?on_conflict=account_id,user_id',{account_id:ctx.account.id,user_id:ctx.user.id,last_seen_at:new Date().toISOString(),page:safePage(req.body?.page),last_login_at:ctx.user.last_sign_in_at||null,email:ctx.user.email||null},{Prefer:'resolution=ignore-duplicates'});
  return res.status(200).json({ok:true});
 }
 if(action==='bugs'&&req.method==='GET')return res.status(200).json(await sb('GET',`ovrendi_bug_reports?account_id=eq.${ctx.account.id}&user_id=eq.${ctx.user.id}&select=id,title,details,page,status,created_at&order=created_at.desc&limit=50`));
 if(action==='bugs'&&req.method==='POST'){
  const {title,details,page}=req.body||{};if(typeof title!=='string'||!title.trim()||title.length>160||typeof details!=='string'||!details.trim()||details.length>6000)return res.status(400).json({error:'Add a title (up to 160 characters) and details (up to 6,000 characters).'});
  const recent=await sb('GET',`ovrendi_bug_reports?user_id=eq.${ctx.user.id}&created_at=gt.${new Date(Date.now()-3600000).toISOString()}&select=id&limit=10`);if(recent?.length>=10)return res.status(429).json({error:'You have submitted several reports. Please try again later.'});
  const [report]=await sb('POST','ovrendi_bug_reports',{account_id:ctx.account.id,user_id:ctx.user.id,title:title.trim(),details:details.trim(),page:safePage(page)});
  return res.status(201).json({id:report.id,status:report.status});
 }
 return res.status(405).json({error:'Method not allowed'});
 }catch(_){return res.status(503).json({error:'Could not complete this request. Please try again.'})}
}
