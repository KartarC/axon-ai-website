
// Explicit customer-facing fields only. Also used for the estimator's preview.
window.renderCustomerQuote=function(q,target){
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const date=x=>x?new Date(x).toLocaleDateString():'Not issued';
 target.innerHTML=`<p class="eyebrow">${esc(q.company.name)}</p><p>${esc(q.company.address)}<br>${esc(q.company.email)}</p><h1>Quotation ${esc(q.number)}</h1><p>Revision ${esc(q.revision)} · ${esc(q.status)}<br>Issued: ${esc(date(q.issued_at))} · Valid until: ${esc(date(q.valid_until))}</p><h2>Prepared for ${esc(q.customer)}</h2><p>Reference: ${esc(q.reference||'—')}<br>${esc(q.material)} · ${esc(q.thickness)} mm</p><div class="table-wrap"><table><thead><tr><th>Part</th><th>Size (mm)</th><th>Quantity</th></tr></thead><tbody>${q.parts.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.width)} × ${esc(p.height)}</td><td>${esc(p.quantity)}</td></tr>`).join('')}</tbody></table></div><p class="total">${esc(new Intl.NumberFormat('en-CA',{style:'currency',currency:q.currency}).format(q.price))} ${esc(q.currency)}</p><p>Taxes excluded. Price applies to the complete batch and quantities shown.</p><h2>Terms</h2><p class="terms">${esc(q.terms||'No additional terms specified.')}</p><p>Prepared by ${esc(q.prepared_by||q.company.name)}.</p>`;
};
