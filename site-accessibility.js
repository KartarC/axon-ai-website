(()=>{
 const main=document.querySelector('main')||document.querySelector('#tour')||document.querySelector('h1');
 if(main){if(!main.id)main.id='main-content';const skip=document.createElement('a');skip.href='#'+main.id;skip.className='ov-skip-link';skip.textContent='Skip to main content';skip.onclick=()=>{main.tabIndex=-1;main.focus()};document.body.prepend(skip)}
 const footer=document.createElement('nav');footer.className='ov-legal-links';footer.setAttribute('aria-label','Legal and contact');footer.innerHTML='<a href="/privacy.html">Privacy and data practices</a><a href="/terms.html">Service terms — draft</a><a href="mailto:hello@getovrendi.com">Contact support</a>';document.body.append(footer);
})();
