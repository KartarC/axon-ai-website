// Production totals are read directly from their saved record; no duplicate ledger rows are created.
const round=n=>Math.round((Number(n)+Number.EPSILON)*100)/100
function reconcile(quote,entries=[],tracking=null){
 const s=tracking?.snapshot||{},linked=!!tracking?.quote_id
 const currency=linked&&/^[A-Z]{3}$/.test(s.currency||'')?s.currency:quote?.currency||tracking?.labor_currency||null
 if(linked){const price=Number(s.price),basis=s.estimated_cost==null?null:Number(s.estimated_cost);quote={quoted_price:price,target_margin:price>0&&basis!=null?(1-basis/price)*100:0,estimated_cost:basis,currency,source:'accepted_quote'}}
 const productionTypes=['labor','material'].filter(type=>tracking?.[type==='labor'?'labor_cost':'material_cost']!=null)
 const excluded=entries.filter(e=>productionTypes.includes(e.type)),effective=entries.filter(e=>!productionTypes.includes(e.type))
 for(const type of productionTypes){const total=Number(tracking[type==='labor'?'labor_cost':'material_cost']);effective.push({id:'production-'+type,source:'production',type,description:'Production cumulative '+(type==='labor'?'labour':'material')+' total',quantity:1,unit_cost:total,total_cost:total,recorded_at:tracking.updated_at,read_only:true})}
 const actual=round(effective.reduce((n,e)=>n+Number(e.total_cost||0),0)),price=quote?Number(quote.quoted_price):null
 const basis=quote?(quote.source==='accepted_quote'?quote.estimated_cost:price*(1-Number(quote.target_margin||0)/100)):null
 return {quote,entries:effective,excluded_entries:excluded,currency,actual_cost:actual,estimated_cost:basis,variance:basis==null?null:round(actual-basis),margin_pct:price>0?round((price-actual)/price*100):null,
 production:tracking?{labor_mode:tracking.labor_mode,labor_rate:tracking.labor_rate,labor_source:tracking.labor_source,labor_note:tracking.labor_note,actual_hours:tracking.actual_hours==null?null:Number(tracking.actual_hours),estimated_process_hours:s.source?.totalSeconds==null?null:Number(s.source.totalSeconds)/3600,material_used:tracking.material_used,material_unit:tracking.material_unit,updated_at:tracking.updated_at,managed_types:productionTypes,labor_cost_missing:tracking.actual_hours!=null&&tracking.labor_cost==null}:null}
}
async function trackingFor(sb,account,ids){const rows=[];for(let i=0;i<ids.length;i+=100)rows.push(...await sb('GET',`ovrendi_job_tracking?account_id=eq.${account}&job_id=in.(${ids.slice(i,i+100).join(',')})&limit=100`));return new Map(rows.map(t=>[t.job_id,t]))}
module.exports={reconcile,trackingFor}
