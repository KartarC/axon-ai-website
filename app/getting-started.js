import {requireAuth} from './_shared/auth.js'
import {renderNav} from './_shared/nav.js'
import {hasModule} from './_shared/modules.js'
const session=requireAuth()
if(session){
 renderNav('/app/getting-started.html')
 document.getElementById('mobileNavBtn').onclick=()=>document.getElementById('app-nav').classList.toggle('open')
 const canQuote=hasModule(session.account,'laser-quoting')&&['owner','admin','manager'].includes(session.role)
 const steps=[
  ['Set up your company','Add the company and contact names that appear on your quotation. Address and contact details are optional.','company','Set up company','account-and-team'],
  ['Add your quoting rates','Enter your own machine, material, gas and electricity costs. Save a profile to reuse them.','rates','Set up rates','rates-and-profiles'],
  ['Create your first quote','Import a supported Han’s report, review the parts and costs, then save your quotation and check the PDF.','quote','Create a quote','first-quote']
 ]
 const key='ovrendi_setup_v2:'+session.account.id+':'+session.user?.id
 let done=[]
 try{const value=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(value))done=value.filter(n=>[0,1,2].includes(n))}catch(_){}
 document.getElementById('checklist').innerHTML=steps.map(([title,description,setup,action,guide],i)=>`<article class="setup-step"><span class="setup-number" aria-hidden="true">${i+1}</span><div class="setup-content"><h2>${title}</h2><p>${description}</p><div class="setup-actions">${canQuote?`<a class="btn-app btn-app--primary" href="/app/modules/laser-quoting/?setup=${setup}">${action} →</a>`:''}<details><summary>Need help?</summary><a href="/education/${guide}/">Read the step-by-step guide</a></details></div><label><input type="checkbox" data-step="${i}" ${done.includes(i)?'checked':''}>I’ve completed this step</label></div></article>`).join('')
 function progress(){const n=document.querySelectorAll('[data-step]:checked').length;document.getElementById('meter').value=n;document.getElementById('progress').textContent=n===3?'You’re ready to quote. Your setup checklist is complete.':n+' of 3 steps complete'}
 document.getElementById('checklist').onchange=()=>{done=[...document.querySelectorAll('[data-step]:checked')].map(x=>Number(x.dataset.step));try{localStorage.setItem(key,JSON.stringify(done))}catch(_){}progress()}
 progress()
 if(!canQuote){document.getElementById('openQuoting').hidden=true;document.getElementById('moduleNotice').textContent='Quoting access is not enabled for your account or role. You can read the guides; ask your administrator about access.'}
}
