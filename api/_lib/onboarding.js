const {sb,requireAuth}=require('./supabase')
const {isUuid}=require('./security')
const labels={'company':'Company setup','quoting-rates':'Quoting profiles','quoting-first':'First quotation','production-first':'Production Board','costing-first':'Job Costing','traveler-first':'Shop Traveler'}
function allowedTasks(account,role){
 const modules=account.modules||[],ids=['company']
 if(['owner','admin','manager'].includes(role)&&modules.some(m=>['laser-quoting','job-costing'].includes(m)))ids.push('quoting-rates','quoting-first')
 for(const [module,id] of [['production-board','production-first'],['job-costing','costing-first'],['shop-traveler','traveler-first']])if(modules.includes(module))ids.push(id)
 return ids
}
async function onboarding(req,res){
 const ctx=await requireAuth(req,res,{allowExpired:true});if(!ctx)return
 try{
  const allowed=allowedTasks(ctx.account,ctx.role)
  if(req.method==='GET'){
   const rows=await sb('GET',`ovrendi_onboarding_progress?account_id=eq.${ctx.account.id}&user_id=eq.${ctx.user.id}&select=task_id,completed,updated_at`)
   return res.status(200).json({tasks:rows||[],allowed_tasks:allowed})
  }
  if(req.method!=='PATCH')return res.status(405).json({error:'Method not allowed'})
  const {task_id,completed,import_local}=req.body||{}
  if(!allowed.includes(task_id)||typeof completed!=='boolean'||(import_local!==undefined&&typeof import_local!=='boolean'))return res.status(400).json({error:'Choose an available onboarding step and completion state'})
  if(import_local&&completed!==true)return res.status(400).json({error:'Only completed local steps can be imported'})
  await sb('POST','ovrendi_onboarding_progress?on_conflict=account_id,user_id,task_id',{
   account_id:ctx.account.id,user_id:ctx.user.id,task_id,completed,updated_at:new Date().toISOString()
  },{Prefer:'resolution='+(import_local?'ignore':'merge')+'-duplicates'})
  return res.status(200).json({ok:true})
 }catch(_){return res.status(503).json({error:'Could not sync onboarding progress. Please retry.'})}
}
// Called only after the internal CRM staff authorization gate.
async function staffOnboarding(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'})
 if(!isUuid(req.query.id))return res.status(400).json({error:'Select a company'})
 try{
  const id=req.query.id,[account]=await sb('GET',`accounts?id=eq.${id}&select=id,name,modules`)
  if(!account)return res.status(404).json({error:'Company not found'})
  const members=await sb('GET',`account_users?account_id=eq.${id}&select=user_id,full_name,role&order=user_id&limit=1000`)
  const rows=[];let truncated=false
  for(let offset=0;offset<6000;offset+=1000){
   const page=await sb('GET',`ovrendi_onboarding_progress?account_id=eq.${id}&select=user_id,task_id,completed,updated_at&order=user_id,task_id&limit=1000&offset=${offset}`)
   rows.push(...page);if(page.length<1000)break;if(offset===5000)truncated=true
  }
  return res.status(200).json({reported_by:'customer',truncated,users:members.map(m=>{
   const relevant=rows.filter(r=>r.user_id===m.user_id),tasks=allowedTasks(account,m.role).map(id=>({id,label:labels[id],completed:relevant.find(r=>r.task_id===id)?.completed===true}))
   return{user_id:m.user_id,name:m.full_name||'User '+m.user_id.slice(0,8),role:m.role,tasks,completed:tasks.filter(t=>t.completed).length,total:tasks.length,updated_at:relevant.map(r=>r.updated_at).sort().at(-1)||null}
  }),limit:1000})
 }catch(_){return res.status(503).json({error:'Could not load onboarding progress. Please retry.'})}
}
module.exports={onboarding,staffOnboarding,allowedTasks}
