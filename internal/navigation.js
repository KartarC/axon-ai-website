(()=>{
const groups=[['Sales & marketing',['sales','enquiries','contacts','marketing']],['Customer operations',['accounts','users','workflows','tasks','customer-success']],['Support & communication',['bugs','mailbox','emails']],['Insights & access',['customer-activity','web-analytics','activity','modules']],['Help',['guide']]];
window.renderStaffNavigation=(names,view)=>{
const nav=document.getElementById('navigation');nav.replaceChildren();
const link=key=>{const a=document.createElement('a');a.href='#'+key;a.textContent=names[key];if(key===view){a.className='active';a.setAttribute('aria-current','page')}return a};nav.append(link('overview'));
for(const [name,keys]of groups){const d=document.createElement('details'),summary=document.createElement('summary'),children=document.createElement('div');summary.textContent=name;children.className='staff-children';keys.forEach(k=>children.append(link(k)));d.open=keys.includes(view);d.append(summary,children);nav.append(d);summary.addEventListener('click',()=>{if(!d.open)nav.querySelectorAll('details').forEach(other=>{if(other!==d)other.open=false})})}

const empty=document.createElement('p');empty.textContent='No matching pages.';empty.hidden=true;nav.append(empty);
const input=document.getElementById('navSearch');const filter=()=>{const term=input.value.trim().toLowerCase();let count=0;nav.querySelectorAll('a').forEach(a=>{a.hidden=!a.textContent.toLowerCase().includes(term);if(!a.hidden)count++});nav.querySelectorAll('details').forEach(d=>{d.hidden=![...d.querySelectorAll('a')].some(a=>!a.hidden);d.open=term?true:!!d.querySelector('[aria-current="page"]')});empty.hidden=!!count};input.oninput=filter;filter();
};
})();