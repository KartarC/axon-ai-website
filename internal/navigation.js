(()=>{
const groups=[['Sales & marketing',['sales','enquiries','contacts','marketing']],['Customer operations',['accounts','users','workflows','tasks','customer-success']],['Support & communication',['bugs','mailbox','emails']],['Insights & access',['customer-activity','web-analytics','activity','modules']],['Help',['guide']]];
let closed=new Set();try{closed=new Set(JSON.parse(localStorage.getItem('ovrendi_staff_nav_groups')||'[]'))}catch(_){}
window.renderStaffNavigation=(names,view)=>{
const nav=document.getElementById('navigation');nav.replaceChildren();
const link=key=>{const a=document.createElement('a');a.href='#'+key;a.textContent=names[key];if(key===view){a.className='active';a.setAttribute('aria-current','page')}return a};nav.append(link('overview'));
for(const [name,keys]of groups){const d=document.createElement('details'),summary=document.createElement('summary'),children=document.createElement('div');summary.textContent=name;children.className='staff-children';keys.forEach(k=>children.append(link(k)));d.open=keys.includes(view)||!closed.has(name);d.append(summary,children);nav.append(d);d.addEventListener('toggle',()=>{if(document.getElementById('navSearch').value)return;d.open?closed.delete(name):closed.add(name);try{localStorage.setItem('ovrendi_staff_nav_groups',JSON.stringify([...closed]))}catch(_){}})}
const empty=document.createElement('p');empty.textContent='No matching pages.';empty.hidden=true;nav.append(empty);
const input=document.getElementById('navSearch');const filter=()=>{const term=input.value.trim().toLowerCase();let count=0;nav.querySelectorAll('a').forEach(a=>{a.hidden=!a.textContent.toLowerCase().includes(term);if(!a.hidden)count++});nav.querySelectorAll('details').forEach(d=>{d.hidden=![...d.querySelectorAll('a')].some(a=>!a.hidden);if(term)d.open=true});empty.hidden=!!count};input.oninput=filter;filter();
};
})();