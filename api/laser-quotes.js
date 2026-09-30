const { sb, requireAuth, requireRole, cors } = require('./_lib/supabase')
const { isUuid } = require('./_lib/security')
const { parseHans, MAX_FILE } = require('./_lib/laser-import')
const { calculate, normalizeRates } = require('./_lib/laser-cost')
export const config = { api: { bodyParser: { sizeLimit:'3mb' } } }
function bad(message,status=400){const e=new Error(message);e.status=status;throw e}
function text(value,label,max,required=false){if(typeof value!=='string'||value.length>max||(required&&!value.trim()))bad(`Invalid ${label}.`);return value.trim()}
async function own(table,id,account){if(!isUuid(id))bad('Invalid record ID.');const rows=await sb('GET',`${table}?id=eq.${id}&account_id=eq.${account}`);if(!rows?.length)bad('Record not found.',404);return rows[0]}
export default async function handler(req,res){
  cors(res);res.setHeader('Cache-Control','no-store')
  if(req.method==='OPTIONS')return res.status(200).end()
  try{
    const ctx=await requireAuth(req,res);if(!ctx)return
    // Separate beta module; Job Costing entitlement also grants pilot access.
    if(!ctx.account.modules.some(m=>['laser-quoting','job-costing'].includes(m)))return res.status(403).json({error:'Laser Quoting is not enabled for this shop.'})
    if(!requireRole(ctx,['owner','admin','manager'],res))return
    const account=ctx.account.id, action=req.query.action||'quotes',body=req.body||{}
    if(req.method==='GET'&&action==='profiles')return res.status(200).json(await sb('GET',`billet_laser_profiles?account_id=eq.${account}&order=name.asc`))
    if(req.method==='POST'&&action==='profiles'){
      if(!requireRole(ctx,['owner','admin'],res))return
      const name=text(body.name,'profile name',100,true),rates=normalizeRates(body.rates)
      if(body.id){await own('billet_laser_profiles',body.id,account);return res.status(200).json((await sb('PATCH',`billet_laser_profiles?id=eq.${body.id}&account_id=eq.${account}`,{name,rates,updated_at:new Date().toISOString()}))[0])}
      return res.status(201).json((await sb('POST','billet_laser_profiles',{account_id:account,name,rates}))[0])
    }
    if(req.method==='GET'&&action==='quotes'){
      if(req.query.id)return res.status(200).json(await own('billet_laser_quotes',req.query.id,account))
      return res.status(200).json(await sb('GET',`billet_laser_quotes?account_id=eq.${account}&select=id,family_id,revision,customer,reference,status,created_at,result->price,result->currency&order=created_at.desc&limit=100`))
    }
    if(req.method==='POST'&&action==='import'){
      if(typeof body.file!=='string'||body.file.length>Math.ceil(MAX_FILE/3)*4||body.file.length%4!==0||! /^[A-Za-z0-9+/]*={0,2}$/.test(body.file))bad('Invalid file. Upload a Han’s workbook under 2 MB.')
      const source=await parseHans(Buffer.from(body.file,'base64'),text(body.name,'filename',160,true))
      const existing=await sb('GET',`billet_laser_imports?account_id=eq.${account}&sha256=eq.${source.hash}&limit=1`)
      if(existing?.length)return res.status(200).json({...existing[0],duplicate:true})
      try {
        const row=(await sb('POST','billet_laser_imports',{account_id:account,created_by:ctx.user.id,sha256:source.hash,source}))[0]
        return res.status(201).json(row)
      } catch(error) {
        // A concurrent upload of the same source may have won the unique-key race.
        const duplicate=await sb('GET',`billet_laser_imports?account_id=eq.${account}&sha256=eq.${source.hash}&limit=1`)
        if(duplicate?.length)return res.status(200).json({...duplicate[0],duplicate:true})
        throw error
      }
    }
    if(req.method==='POST'&&(action==='calculate'||action==='save')){
      const imported=await own('billet_laser_imports',body.import_id,account)
      const result=calculate(imported.source,body.rates)
      if(action==='calculate')return res.status(200).json(result)
      if(body.reviewed!==true)bad('Confirm the imported quantities, units, currency and warnings before saving.')
      if(!result.complete)bad('Complete the missing costing settings before saving.')
      if(!isUuid(body.request_id))bad('Missing save request ID.')
      if(body.previous_id&&!isUuid(body.previous_id))bad('Invalid previous quote ID.')
      const details={customer:text(body.customer,'customer',160,true),reference:text(body.reference||'','reference',160),terms:text(body.terms||'','terms',2000),valid_days:body.valid_days??30}
      if(!Number.isInteger(details.valid_days)||details.valid_days<1||details.valid_days>365)bad('Quote validity must be 1–365 days.')
      const saved=await sb('POST','rpc/billet_laser_save',{p_account:account,p_user:ctx.user.id,p_id:body.request_id,p_import:imported.id,p_previous:body.previous_id||null,p_details:details,p_result:result})
      if(saved.error)bad(saved.error,409)
      return res.status(201).json(saved)
    }
    if(req.method==='POST'&&action==='status'){
      if(!isUuid(body.id)||!['issued','accepted'].includes(body.status))bad('Invalid quote transition.')
      const row=await sb('POST','rpc/billet_laser_status',{p_account:account,p_id:body.id,p_status:body.status})
      if(row.error)bad(row.error,409)
      return res.status(200).json(row)
    }
    return res.status(405).json({error:'Unsupported quotation action.'})
  }catch(e){if(!e.status)console.error('Laser Quoting request failed');return res.status(e.status||500).json({error:e.status?e.message:'Laser Quoting could not complete this request. Please retry.'})}
}
