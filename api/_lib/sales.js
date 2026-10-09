
const {sb}=require('./supabase'),{isUuid}=require('./security');
const stages=['lead','qualified','demo','trial','active','paid','lost'];
function validate(b){
 const d={};for(const [key,max]of [['company',160],['contact_name',160],['email',254],['owner_name',160],['next_action',300],['notes',6000],['lost_reason',500]]){const v=b[key]??'';if(typeof v!=='string'||v.length>max)throw Error('Invalid '+key);d[key]=v.trim()}
 if(!d.company)throw Error('Company or opportunity name is required.');
 if(d.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email))throw Error('Enter a valid email.');
 if(!stages.includes(b.stage))throw Error('Choose a valid stage.');d.stage=b.stage;
 for(const key of ['account_id','enquiry_id']){if(b[key]!=null&&!isUuid(b[key]))throw Error('Invalid '+key);d[key]=b[key]||null}
 if(b.due_date&&!validDate(b.due_date))throw Error('Choose a valid due date.');d.due_date=b.due_date||null;
 const value=Number(b.estimated_monthly_usd??0);if(!Number.isFinite(value)||value<0||value>9999999999.99||Math.abs(value*100-Math.round(value*100))>0.001)throw Error('Enter a valid monthly USD estimate.');d.estimated_monthly_usd=value;return d;
}
function validDate(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v}
async function sales(req,res,staff){try{
 if(req.method==='GET'){
  if(req.query.id){if(!isUuid(req.query.id))return res.status(400).json({error:'Invalid opportunity ID'});const [history,tasks]=await Promise.all([sb('GET','ovrendi_sales_history?sales_id=eq.'+req.query.id+'&order=created_at.desc&limit=100'),sb('GET','ovrendi_crm_tasks?sales_id=eq.'+req.query.id+'&order=created_at.asc&limit=100')]);return res.status(200).json({history,tasks})}
  return res.status(200).json(await sb('GET','ovrendi_sales?order=updated_at.desc&limit=1000'));
 }
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 const b=req.body||{};if(!isUuid(b.id))return res.status(400).json({error:'Invalid opportunity ID'});
 let result;if(b.operation==='onboarding'){
  if(!validDate(b.start_date))return res.status(400).json({error:'Choose a valid start date'});
  result=await sb('POST','rpc/ovrendi_sales_onboarding',{p_id:b.id,p_start:b.start_date});
 }else if(b.operation==='save'){
  if(!Number.isInteger(b.version)||b.version<0)return res.status(400).json({error:'Invalid opportunity version'});
  let data;try{data=validate(b)}catch(e){return res.status(400).json({error:e.message})}
  result=await sb('POST','rpc/ovrendi_save_sale',{p_id:b.id,p_version:b.version,p_data:data,p_actor:staff.email});
 }else return res.status(400).json({error:'Unsupported sales action'});
 return res.status(result.error?409:200).json(result);
 }catch(_){return res.status(503).json({error:'Could not load or save sales data. Check the linked company and retry.'})}}
module.exports={sales,validate};
