import {apiGet,apiPatch} from './_shared/api.js'
import {requireAuth} from './_shared/auth.js'
import {renderNav} from './_shared/nav.js'
import {hasModule} from './_shared/modules.js'
const session=requireAuth()
if(session){
 renderNav('/app/getting-started.html')
 document.getElementById('mobileNavBtn').onclick=()=>document.getElementById('app-nav').classList.toggle('open')
 const canQuote=hasModule(session.account,'laser-quoting')&&['owner','admin','manager'].includes(session.role)
 const canManage=['owner','admin','manager'].includes(session.role)
 const steps=[['company','Company setup', ['owner','admin'].includes(session.role)?'Confirm your company name and time zone once for the whole workspace.':'Review your company details. Ask an owner or admin to make changes.','/app/settings.html','Review company','account-and-team']]
 if(canQuote)steps.push(
  ['quoting-rates','Prepare your quoting profiles','Add the company contact details for your PDFs and enter your own machine, material, gas and electricity costs. Save reusable profiles.','/app/modules/laser-quoting/?setup=rates','Set up rates','rates-and-profiles'],
  ['quoting-first','Create your first quote','Import a supported Han’s report, review the parts and costs, then save your quotation and check the PDF.','/app/modules/laser-quoting/?setup=quote','Create a quote','first-quote'])
 if(hasModule(session.account,'production-board'))steps.push(['production-first',canManage?'Plan your first job':'Explore your production board',canManage?'Open the board, add a job and review its stage and machine assignment.':'Review your team’s jobs, priorities and current stages.','/app/modules/production-board/','Open Production Board','production-board'])
 if(hasModule(session.account,'job-costing'))steps.push(['costing-first',canManage?'Review your first job’s costs':'Explore job costs',canManage?'Open a job and compare quoted amounts with recorded labour and material costs.':'Review the job costs available to your team. Ask a manager to update cost records.','/app/modules/job-costing/','Open Job Costing','job-costing'])
 if(hasModule(session.account,'shop-traveler'))steps.push(['traveler-first','Follow a shop traveler',canManage?'Open a job’s traveler and review its instructions, checks and sign-offs.':'Open a traveler and review the instructions for your work. Actions depend on your role.','/app/modules/shop-traveler/','Open Shop Traveler','shop-traveler'])
 const key='ovrendi_setup_v3:'+session.account.id+':'+session.user?.id
 let done=[]
 try{
  const saved=localStorage.getItem(key)
  if(saved){const value=JSON.parse(saved);if(Array.isArray(value))done=value.filter(v=>typeof v==='string')}
  else{const old=JSON.parse(localStorage.getItem('ovrendi_setup_v2:'+session.account.id+':'+session.user?.id)||'[]');if(Array.isArray(old))done=old.filter(n=>n===1||n===2).map(n=>n===1?'quoting-rates':'quoting-first')}
 }catch(_){}
 document.querySelector('.page-title').textContent='Get your workspace ready.'
 document.querySelector('.page-subtitle').textContent='Company setup comes first, followed by the tools available to you. Leave and return at any time.'
 document.getElementById('meter').max=steps.length
 document.getElementById('checklist').innerHTML=steps.map(([id,title,description,href,action,guide],i)=>`<article class="setup-step"><span class="setup-number" aria-hidden="true">${i+1}</span><div class="setup-content"><h2>${title}</h2><p>${description}</p><div class="setup-actions"><a class="btn-app btn-app--primary" href="${href}">${action} →</a>${id==='quoting-rates'?'<a href="/app/modules/laser-quoting/?setup=company">PDF contact details</a>':''}<details><summary>Need help?</summary><a href="/education/${guide}/">Read the step-by-step guide</a></details></div><label><input type="checkbox" data-step="${i}" data-task="${id}" ${done.includes(id)?'checked':''}>I’ve completed this step</label></div></article>`).join('')
 function progress(){const n=document.querySelectorAll('[data-step]:checked').length;document.getElementById('meter').value=n;document.getElementById('progress').textContent=n===steps.length?'Your setup checklist is complete.':n+' of '+steps.length+' steps complete'}
 const sync=document.createElement('p');sync.setAttribute('role','status');document.getElementById('progress').after(sync)
 const retry=document.createElement('button');retry.type='button';retry.className='btn-app btn-app--secondary';retry.textContent='Retry sync';retry.hidden=true;sync.after(retry)
 const inputs=[...document.querySelectorAll('[data-task]')];let busy=false,loaded=false
 const lock=value=>inputs.forEach(input=>input.disabled=value)
 const render=()=>{inputs.forEach(input=>input.checked=done.includes(input.dataset.task));progress()}
 // Old browser checkmarks are imported only into missing cloud records, never over a saved unchecked state.
 const localDone=[...done];done=[];render();lock(true)
 async function load(){
  if(busy)return;busy=true;lock(true);retry.hidden=true;sync.textContent='Loading saved progress…'
  try{
   let data=await apiGet('/api/auth?action=onboarding')
   if(!loaded){for(const id of localDone.filter(id=>data.allowed_tasks.includes(id)&&!data.tasks.some(t=>t.task_id===id)))await apiPatch('/api/auth?action=onboarding',{task_id:id,completed:true,import_local:true});data=await apiGet('/api/auth?action=onboarding')}
   done=data.tasks.filter(t=>t.completed).map(t=>t.task_id);loaded=true;render()
   try{localStorage.removeItem(key);localStorage.removeItem('ovrendi_setup_v2:'+session.account.id+':'+session.user?.id)}catch(_){}
   sync.textContent='Progress saved to your account. Continue from any device.';lock(false)
  }catch(e){sync.textContent=e.message;retry.hidden=false}finally{busy=false}
 }
 document.getElementById('checklist').onchange=async event=>{
  const input=event.target;if(!input.matches('[data-task]')||busy||!loaded)return
  busy=true;lock(true);sync.textContent='Saving progress…';retry.hidden=true
  try{await apiPatch('/api/auth?action=onboarding',{task_id:input.dataset.task,completed:input.checked});done=done.filter(id=>id!==input.dataset.task);if(input.checked)done.push(input.dataset.task);sync.textContent='Progress saved to your account.'}
  catch(e){sync.textContent=e.message+' Your change was not saved.';retry.hidden=false}
  finally{render();lock(false);busy=false}
 }
 retry.onclick=load
 window.addEventListener('focus',()=>{if(loaded)load()})
 load()
 if(!canQuote){document.getElementById('openQuoting').hidden=true;if(steps.length===1)document.getElementById('moduleNotice').textContent='No supported module setup tasks are available for your access yet. Ask your administrator which tools are enabled.'}
}
