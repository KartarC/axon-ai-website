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
 document.getElementById('checklist').onchange=()=>{const visible=new Set(steps.map(s=>s[0]));done=[...done.filter(id=>!visible.has(id)),...[...document.querySelectorAll('[data-step]:checked')].map(x=>x.dataset.task)];try{localStorage.setItem(key,JSON.stringify(done))}catch(_){}progress()}
 progress()
 if(!canQuote){document.getElementById('openQuoting').hidden=true;if(steps.length===1)document.getElementById('moduleNotice').textContent='No supported module setup tasks are available for your access yet. Ask your administrator which tools are enabled.'}
}
