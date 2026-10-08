import { getSession } from './auth.js';
const tours={quoting:[['.identity-panel','Make the PDF yours','Save your company details and personal contact profile. Owners and admins edit the shared company profile.'],['#file','Import a cutting report','Choose one supported Han’s LaserNest workbook, up to 2 MB. Review dimensions, nested quantities and warnings after import.'],['#quoteForm','Set customer and costs','Enter customer details, currency and your own material, machine, gas and electricity rates. Use each question mark for field help.'],['#profileEditor','Reuse your standards','Owners and admins can save customer, machine, gas and electricity profiles. Loading a profile does not change older quote revisions.'],['#calculate','Calculate and review','Calculate the estimate and resolve missing values. Confirm the source and rate review before saving.'],['#saveQuote','Save a revision','Save explicitly before leaving. Changing a saved quote creates a new revision; previous snapshots stay unchanged.'],['.summary','Download and share','After saving, download the one-page PDF. Mark issued records a status only: it does not email the customer.'],['#quoteList','Find your work','Saved quotations lists the most recent 100 revisions. Open a revision to inspect it or prepare an update.']],overview:[['.anav-account','Your company workspace','Confirm you are in the right company. Your administrator controls which modules are available.'],['.modules-grid','Open a module','Only enabled modules are active. Quoting is available to owners, admins and managers.'],['.anav-theme','Choose your appearance','Use Light or Dark to choose a comfortable view. On a phone, use the menu button to reach navigation.'],['a[href="/education/"]','Help stays close','Education contains task-based guides. Getting started provides a checklist you can return to at any time.']]};
let closeCurrent=()=>{};
export function startWalkthrough(kind){
 const steps=(tours[kind]||[]).filter(([selector])=>document.querySelector(selector));if(!steps.length)return;
 closeCurrent();const previous=document.activeElement;let index=0,highlight=null;const opened=[];
 const dialog=document.createElement('dialog');dialog.className='ov-tour';dialog.setAttribute('aria-labelledby','ovTourTitle');dialog.innerHTML='<p id="ovTourProgress"></p><h2 id="ovTourTitle"></h2><p id="ovTourText"></p><div><button type="button" data-back>Back</button><button type="button" data-next>Next</button><button type="button" data-close>Close tour</button></div>';
 const cleanup=()=>{highlight?.classList.remove('ov-tour-target');opened.forEach(d=>d.open=false);dialog.remove();if(previous?.isConnected)previous.focus();closeCurrent=()=>{}};
 closeCurrent=()=>{dialog.close();cleanup()};
 function show(){highlight?.classList.remove('ov-tour-target');const [selector,title,text]=steps[index];highlight=document.querySelector(selector);const details=highlight.closest('details');if(details&&!details.open){details.open=true;opened.push(details)}highlight.classList.add('ov-tour-target');highlight.scrollIntoView({block:'center',behavior:'instant'});dialog.querySelector('#ovTourProgress').textContent='Step '+(index+1)+' of '+steps.length;dialog.querySelector('#ovTourTitle').textContent=title;dialog.querySelector('#ovTourText').textContent=text;dialog.querySelector('[data-back]').disabled=index===0;dialog.querySelector('[data-next]').textContent=index===steps.length-1?'Finish':'Next';}
 dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.querySelector('[data-back]').onclick=()=>{index--;show()};dialog.querySelector('[data-next]').onclick=()=>{if(index===steps.length-1)dialog.close();else{index++;show()}};dialog.addEventListener('close',cleanup,{once:true});document.body.append(dialog);show();dialog.showModal();
}
export function installWalkthrough(){
 if(!document.getElementById('walkthroughStyle')){const css=document.createElement('link');css.id='walkthroughStyle';css.rel='stylesheet';css.href='/app/_shared/walkthrough.css';document.head.append(css)}
 const kind=location.pathname.includes('laser-quoting')?'quoting':location.pathname.includes('dashboard')?'overview':null;
 if(!kind||document.getElementById('startWalkthrough'))return;
 const button=document.createElement('button');button.id='startWalkthrough';button.className='ov-tour-start';button.type='button';button.textContent='Quick walkthrough';button.onclick=()=>startWalkthrough(kind);const header=document.querySelector('.page-header');if(header)header.append(button);else document.querySelector('.app-main')?.prepend(button);
 // Consume old tour links so navigation and refresh cannot restart the tour.
 const url=new URL(location.href);
 if(url.searchParams.has('tour')){url.searchParams.delete('tour');history.replaceState(history.state,'',url)}
 if(kind!=='quoting')return;
 const session=getSession();
 if(!session?.user?.id||!session?.account?.id)return;
 const key=`ovrendi:walkthrough:quoting:${session.account.id}:${session.user.id}`;
 const seen=()=>{for(const storage of ['localStorage','sessionStorage']){try{if(window[storage].getItem(key))return true}catch{}}return false};
 const ready=()=>{const workspace=document.getElementById('workspace');return workspace&&!workspace.hidden&&!workspace.inert};
 const openOnce=()=>{
  if(seen())return;
  // Mark on opening, not completion: refreshing an unfinished tour must not restart it.
  for(const storage of ['localStorage','sessionStorage']){try{window[storage].setItem(key,'seen')}catch{}}
  startWalkthrough(kind);
 };
 if(seen())return;
 if(ready())openOnce();
 else{
  const watcher=new MutationObserver(()=>{if(ready()){watcher.disconnect();openOnce()}});
  watcher.observe(document.querySelector('.app-main'),{subtree:true,attributes:true,attributeFilter:['hidden','inert']});
  setTimeout(()=>watcher.disconnect(),20000);
 }
}
