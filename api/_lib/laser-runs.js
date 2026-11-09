const {isUuid}=require('./security')
const num=(v,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max
function validate(d){
 if(!d||!isUuid(d.machine_id)||!['manual','csv'].includes(d.entry_method)||!['run_ref','program'].every((k,i)=>typeof d[k]==='string'&&d[k].trim()&&d[k].length<=[100,200][i]))return 'Choose a machine, run reference and program.'
 if(!/^\d{4}-\d{2}-\d{2}$/.test(d.completed_on)||!Number.isFinite(Date.parse(d.completed_on))||new Date(d.completed_on).toISOString().slice(0,10)!==d.completed_on||d.completed_on>new Date().toISOString().slice(0,10))return 'Enter a valid completion date in the past or today.'
 if(!num(d.cut_minutes,1e6)||!num(d.elapsed_minutes,1e6)||!d.elapsed_minutes||d.elapsed_minutes<d.cut_minutes||!num(d.sheets,1e5)||!num(d.good_parts,1e7)||!Number.isInteger(d.good_parts))return 'Check the run quantities. Elapsed minutes must include cutting minutes.'
 for(const [k,source] of [['gas_m3','gas_source'],['energy_kwh','energy_source']])if(d[k]!=null?(!num(d[k],1e7)||!['meter','operator'].includes(d[source])):d[source]!=null)return 'Enter observed utility usage and its source, or leave both blank.'
 if(d.gas_m3!=null&&(typeof d.gas_type!=='string'||!d.gas_type.trim()||d.gas_type.length>30))return 'Specify the gas used.'
 return null
}
async function comparison(sb,a,t){
 if(!t?.quote_id)return null
 const rows=[];for(let offset=0;;offset+=500){const batch=await sb('GET','ovrendi_laser_runs?account_id=eq.'+a+'&job_id=eq.'+t.job_id+'&quote_id=eq.'+t.quote_id+'&order=id.asc&limit=500&offset='+offset);rows.push(...batch);if(batch.length<500)break}
 if(!rows.length)return {count:0}
 const [q]=await sb('GET','billet_laser_quotes?account_id=eq.'+a+'&id=eq.'+t.quote_id+'&select=result');const s=t.snapshot.source||{},r=q?.result||{},usage=r.usage||{}
 const sum=k=>rows.every(x=>x[k]!=null)?rows.reduce((n,x)=>n+Number(x[k]),0):null
 const gasOk=s.gas&&rows.every(x=>String(x.gas_type||'').trim().toLowerCase()===s.gas.trim().toLowerCase())
 const metrics=[],add=(label,quoted,actual)=>metrics.push({label,quoted:quoted??null,actual,variance:quoted!=null&&actual!=null?actual-quoted:null})
 add('Cutting (min)',s.cuttingSeconds==null?null:s.cuttingSeconds/60,sum('cut_minutes'));add('Process / elapsed (min)',s.totalSeconds==null?null:s.totalSeconds/60,sum('elapsed_minutes'));add('Sheets',s.sheetCount,sum('sheets'));add('Nested / good parts',r.quantity??s.parts?.reduce((n,p)=>n+p.nested,0),sum('good_parts'));add('Gas (standard m³)',usage.gasM3,gasOk?sum('gas_m3'):null);add('Electricity (kWh)',usage.energyKwh,sum('energy_kwh'))
 for(const [label,key,unit,amount] of [['Gas','gas_m3',usage.gasPerM3,gasOk?sum('gas_m3'):null],['Electricity','energy_kwh',r.rates?.electricityMode==='estimate'?r.rates.energyPrice:null,sum('energy_kwh')]]){const c=r.components?.find(x=>x.name===label);add(label+' cost ('+(r.currency||'quote currency')+')',c?.amount,unit!=null&&amount!=null?amount*Number(unit):null)}
 const rate=r.rates||{},cc=r.currency||'quote currency';if(rate.method==='shop'&&rate.machineHourly!=null)add('Machine time cost ('+cc+')',r.components?.find(x=>x.name==='Machine processing')?.amount,sum('elapsed_minutes')*Number(rate.machineHourly)/60)
 if(rate.method==='shop'&&rate.materialMode==='sheet'&&rate.sheetPrice!=null)add('Sheet cost before remnant credit ('+cc+')',s.sheetCount==null?null:s.sheetCount*Number(rate.sheetPrice),sum('sheets')*Number(rate.sheetPrice))
 return {count:rows.length,quote_id:t.quote_id,revision:t.snapshot.revision,program:s.program,metrics,runs:rows.map(x=>({run:x.run_ref,program:x.program,date:x.completed_on,machine:x.machine_id,entry:x.entry_method,gas:x.gas_source,energy:x.energy_source,cut:x.cut_minutes,elapsed:x.elapsed_minutes,sheets:x.sheets,parts:x.good_parts,gas_type:x.gas_type,gas_m3:x.gas_m3,kwh:x.energy_kwh}))}
}
module.exports={validate,comparison}
