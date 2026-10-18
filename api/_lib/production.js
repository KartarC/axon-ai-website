const {sb,requireRole,requireModule}=require('./supabase')
const {isUuid}=require('./security')
const stages=['planned','cutting','secondary','inspection','ready','completed','on_hold','cancelled']
async function production(req,res,ctx){
 try{
  const action=req.query.action,manage=['owner','admin','manager'].includes(ctx.role)
  if(action==='from-quote'){
   if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'})
   if(!requireRole(ctx,['owner','admin','manager'],res))return
   if(!ctx.account.modules.some(m=>['laser-quoting','job-costing'].includes(m))&&!requireModule(ctx,'laser-quoting',res))return
   if(!isUuid(req.body?.quote_id))return res.status(400).json({error:'Select an accepted quotation'})
   const data=await sb('POST','rpc/ovrendi_quote_to_job',{p_account:ctx.account.id,p_user:ctx.user.id,p_quote:req.body.quote_id})
   return res.status(data.error?409:200).json(data)
  }
  if(req.method==='GET'){
   const id=req.query.id
   const jobs=await sb('GET',`jobs?account_id=eq.${ctx.account.id}${id?'&id=eq.'+id:''}&select=id,job_number,part_name,quantity,material,due_date,priority,status,notes,customers(name)&order=created_at.desc&limit=500`)
   const tracks=[]
   for(let i=0;i<jobs.length;i+=100)tracks.push(...await sb('GET',`ovrendi_job_tracking?account_id=eq.${ctx.account.id}&job_id=in.(${jobs.slice(i,i+100).map(j=>j.id).join(',')})&limit=100`))
   const rows=jobs.map(j=>{const t=tracks.find(t=>t.job_id===j.id);const snapshot={...(t?.snapshot||{})};if(snapshot.source)snapshot.source={material:snapshot.source.material,thicknessMm:snapshot.source.thicknessMm,parts:snapshot.source.parts};if(!id)delete snapshot.source;if(!manage){delete snapshot.price;delete snapshot.estimated_cost}return {...j,tracking:t?{...t,snapshot,material_cost:manage?t.material_cost:undefined,labor_cost:manage?t.labor_cost:undefined}:{stage:({in_progress:'cutting',on_hold:'on_hold',complete:'ready',shipped:'completed',cancelled:'cancelled'})[j.status]||'planned',version:0,snapshot:{}}}})
   if(!id)return res.status(200).json({jobs:rows,limit:500})
   if(!rows.length)return res.status(404).json({error:'Job not found'})
   const events=await sb('GET',`ovrendi_job_events?account_id=eq.${ctx.account.id}&job_id=eq.${id}&select=stage,note,created_at&order=created_at.desc&limit=50`)
   return res.status(200).json({...rows[0],events})
  }
  if(req.method!=='PATCH'||!isUuid(req.query.id))return res.status(405).json({error:'Method not allowed'})
  if(!requireRole(ctx,['owner','admin','manager','operator'],res))return
  const {version,...data}=req.body||{},allowed=manage?['stage','machine_id','due_date','priority','instructions','actual_hours','material_used','material_unit','material_cost','labor_cost']:['stage','instructions','actual_hours','material_used','material_unit']
  if(!Number.isInteger(version)||version<0||Object.keys(data).some(k=>!allowed.includes(k))||!Object.keys(data).length)return res.status(400).json({error:'Invalid job update'})
  if(data.stage!==undefined&&!stages.includes(data.stage)||data.priority!==undefined&&!['low','normal','high','rush'].includes(data.priority)||data.material_unit!==undefined&&!['sheets','kg','pieces'].includes(data.material_unit)||data.instructions!==undefined&&(typeof data.instructions!=='string'||data.instructions.length>10000))return res.status(400).json({error:'Check stage, priority and instructions'})
  for(const k of ['actual_hours','material_used','material_cost','labor_cost'])if(data[k]!==undefined&&data[k]!==null&&(typeof data[k]!=='number'||!Number.isFinite(data[k])||data[k]<0||data[k]>(k.endsWith('cost')?1e8:1e6)))return res.status(400).json({error:'Enter valid positive usage and costs'})
  if(data.due_date!=null&&(!/^\d{4}-\d{2}-\d{2}$/.test(data.due_date)||!Number.isFinite(Date.parse(data.due_date))||new Date(data.due_date).toISOString().slice(0,10)!==data.due_date))return res.status(400).json({error:'Enter a valid due date'})
  const result=await sb('POST','rpc/ovrendi_update_job',{p_account:ctx.account.id,p_user:ctx.user.id,p_job:req.query.id,p_version:version,p_data:data})
  return res.status(result.error?409:200).json(result)
 }catch(e){return res.status(503).json({error:'Could not update production. Reload and try again.'})}
}
module.exports={production}
