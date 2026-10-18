import {requireModule} from '../../_shared/auth.js'
import {apiGet,apiPost} from '../../_shared/api.js'
const session=requireModule('production-board'),$=id=>document.getElementById(id)
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
if(session&&['owner','admin','manager'].includes(session.role)){
 let weekly=null,busy=false,request=0
 $('weekly').hidden=false
 const monday=new Date();monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);$('week').value=monday.toISOString().slice(0,10)
 function clear(){request++;weekly=null;$('approveWeek').disabled=true;$('exportWeek').disabled=true;$('weekSummary').textContent='';$('weekStatus').textContent='Load the week to review all employee hours and costs.'}
 $('week').onchange=clear;window.addEventListener('timesheets-changed',clear)
 async function load(){clear();const ticket=request;try{const data=await apiGet('/api/jobs?action=weekly-timesheets&week='+$('week').value);if(ticket!==request)return;weekly=data;const groups=new Map();for(const e of data.entries){const key=e.user_id+'|'+(e.rate_currency||'Missing currency');if(!groups.has(key))groups.set(key,{name:e.employee_name,currency:e.rate_currency||'Missing currency',hours:0,cost:0,missing:false});const g=groups.get(key);g.hours+=Number(e.hours||0);g.cost+=Number(e.labor_cost||0);g.missing||=e.labor_cost==null}
 $('weekSummary').innerHTML='<table><thead><tr><th>Employee</th><th>Hours</th><th>Currency</th><th>Labour cost</th></tr></thead><tbody>'+[...groups.values()].map(g=>`<tr><td>${esc(g.name)}</td><td>${g.hours.toFixed(3)}</td><td>${esc(g.currency)}</td><td>${g.missing?'Incomplete':g.cost.toFixed(2)}</td></tr>`).join('')+'</tbody></table>'
 $('weekStatus').textContent=data.approved?'Week approved · '+new Date(data.approved_at).toLocaleString():data.running?'Stop running timers before approval.':data.missing_rates?'Resolve missing rates before approval.':data.entries.length?'Needs weekly approval.':'No sessions in this week.';$('approveWeek').disabled=data.approved||data.running||data.missing_rates||!data.entries.length;$('exportWeek').disabled=!data.entries.length
 }catch(e){if(ticket===request)$('weekStatus').textContent=e.message}}
 $('loadWeek').onclick=load
 $('approveWeek').onclick=async()=>{if(!weekly||busy)return;busy=true;$('approveWeek').disabled=true;try{await apiPost('/api/jobs?action=weekly-timesheets&week='+weekly.week_start,{fingerprint:weekly.fingerprint});await load()}catch(e){clear();$('weekStatus').textContent=e.message}finally{busy=false}}
 const cell=v=>{let s=String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'}
 $('exportWeek').onclick=async()=>{await load();if(!weekly)return;const rows=[['Week (UTC)','Employee','Employee ID','Job','Started (UTC)','Stopped (UTC)','Hours','Currency','Hourly rate','Labour cost','Week approval'],...weekly.entries.map(e=>[weekly.week_start,e.employee_name,e.user_id,e.job_number,e.started_at,e.ended_at,e.hours,e.rate_currency,e.hourly_rate,e.labor_cost,weekly.approved?'Approved':'Unapproved'])];const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='timesheets-'+weekly.week_start+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 clear()
}
