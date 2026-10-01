// Native disclosures keep navigation usable without JavaScript.
const menus=[...document.querySelectorAll('.ov-menu')];
for(const menu of menus){menu.addEventListener('toggle',()=>{if(menu.open)for(const other of menus)if(other!==menu)other.open=false});menu.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu.open){menu.open=false;menu.querySelector('summary').focus();event.preventDefault()}})}
document.addEventListener('click',event=>{for(const menu of menus)if(menu.open&&!menu.contains(event.target))menu.open=false});
document.addEventListener('focusin',event=>{for(const menu of menus)if(menu.open&&!menu.contains(event.target))menu.open=false});
