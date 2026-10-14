// Open the relevant setup section once, without interrupting with a tour.
export function installSetupLink(){
 const url=new URL(location.href),step=url.searchParams.get('setup')
 if(!['company','rates','quote'].includes(step))return
 const workspace=document.getElementById('workspace')
 workspace.dataset.setupEntry='true'
 const open=()=>{
  if(workspace.hidden||workspace.inert)return false
  document.dispatchEvent(new CustomEvent('quote-view',{detail:'builder'}))
  const target=document.querySelector(step==='company'?'.identity-panel':step==='rates'?'#rateFields':'#file')
  if(!target)return false
  if(step==='company')target.open=true
  if(step==='rates'){target.querySelectorAll('details').forEach(d=>d.open=true);const standards=document.querySelector('.standards-fold');if(standards)standards.open=true}
  const back=document.createElement('a');back.className='btn-app btn-app--secondary';back.href='/app/getting-started.html';back.textContent='← Back to your setup checklist';workspace.prepend(back)
  url.searchParams.delete('setup');history.replaceState(null,'',url.pathname+url.search+url.hash)
  requestAnimationFrame(()=>{target.scrollIntoView({block:'center'});if(step!=='quote'){target.setAttribute('tabindex','-1');target.focus({preventScroll:true})}})
  return true
 }
 if(!open()){const observer=new MutationObserver(()=>{if(open())observer.disconnect()});observer.observe(workspace,{attributes:true,attributeFilter:['hidden','inert']})}
}
