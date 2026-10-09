(()=>{
 const main=document.querySelector('main')||document.querySelector('#tour')||document.querySelector('h1');
 if(main){if(!main.id)main.id='main-content';const skip=document.createElement('a');skip.href='#'+main.id;skip.className='ov-skip-link';skip.textContent='Skip to main content';skip.onclick=()=>{main.tabIndex=-1;main.focus()};document.body.prepend(skip)}
})();
