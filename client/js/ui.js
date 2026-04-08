/* Lightweight UI helpers for premium booking UX
   - Floating labels
   - Stepper polish (mark completed steps)
   - Add-on tile toggle visuals
   - Small accessibility/visual helpers
   Loaded after /js/app.js (deferred)
*/
(function(){
  'use strict';

  function qs(sel, ctx=document){ return ctx.querySelector(sel); }
  function qsa(sel, ctx=document){ return Array.from((ctx||document).querySelectorAll(sel)); }

  function initFloatingLabels(){
    qsa('.field').forEach(field => {
      const input = field.querySelector('input,textarea,select');
      if(!input) return;

      // initialize state
      const update = ()=>{
        const has = String(input.value||'').trim().length>0;
        field.classList.toggle('has-value', has);
      };

      // focus styling
      input.addEventListener('focus', ()=>{ field.classList.add('has-focus'); field.classList.add('focus-underline'); });
      input.addEventListener('blur', ()=>{ field.classList.remove('has-focus'); setTimeout(update,0); });
      input.addEventListener('input', update);

      // run once
      update();
    });
  }

  function transformStepper(){
    qsa('.step').forEach(step => {
      const spans = step.querySelectorAll('span');
      if(!spans.length) return;
      const first = spans[0];
      const label = spans[1] || null;
      // add classes
      first.classList.add('step-pill');
      if(label) label.classList.add('step-label');

      // wrap number with num/check spans if not already
      if(!first.querySelector('.num')){
        const num = document.createElement('span'); num.className='num'; num.textContent = first.textContent.trim();
        const check = document.createElement('span'); check.className='check'; check.textContent='✓';
        first.textContent='';
        first.appendChild(num);
        first.appendChild(check);
      }
    });
  }

  function updateStepperCompletion(){
    const active = qs('.stepper .step.active');
    if(!active) return;
    const current = Number(active.dataset.step||0);
    qsa('.stepper .step').forEach(s => {
      const n = Number(s.dataset.step||0);
      s.classList.toggle('completed', n < current);
    });
  }

  function bindStepperEvents(){
    // when navigation buttons are clicked, update completion after app.js runs
    qsa('[data-next],[data-prev]').forEach(btn => {
      btn.addEventListener('click', ()=> setTimeout(updateStepperCompletion, 140));
    });

    // observe class changes on step elements (in case app.js toggles active programmatically)
    const observer = new MutationObserver(()=> updateStepperCompletion());
    qsa('.step').forEach(el => observer.observe(el, { attributes: true, attributeFilter: ['class'] }));
  }

  function initAddonTiles(){
    qsa('.addon-item').forEach(label => {
      const cb = label.querySelector('input[type="checkbox"]');
      if(!cb) return;
      // initialize
      label.classList.toggle('selected', !!cb.checked);
      cb.addEventListener('change', ()=> label.classList.toggle('selected', !!cb.checked));
      // clicking label should toggle via native behaviour; ensure keyboard works
      label.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' ') { e.preventDefault(); cb.click(); } });
    });
  }



  function initMobileNav(){
    const header = qs('.site-header');
    const toggle = qs('#nav-toggle');
    const nav = qs('#primary-nav');
    if(!header || !toggle || !nav) return;

    toggle.addEventListener('click', ()=>{
      const open = header.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', String(open));
    });

    qsa('#primary-nav a').forEach(link=>{
      link.addEventListener('click', ()=>{
        header.classList.remove('nav-open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  function updateStickyCta(){
    qsa('.mobile-sticky-btn').forEach(btn=>btn.classList.remove('mobile-sticky-btn'));
    const activeStep = qs('.form-step:not(.hidden)');
    if(!activeStep) return;
    const target = activeStep.querySelector('.actions .btn.gold, .actions .btn.primary');
    if(target) target.classList.add('mobile-sticky-btn');
  }

  function bindStepWatcher(){
    const observer = new MutationObserver(()=> updateStickyCta());
    qsa('.form-step').forEach(el=>observer.observe(el, { attributes:true, attributeFilter:['class'] }));
    qsa('[data-next],[data-prev]').forEach(btn=>btn.addEventListener('click', ()=> setTimeout(updateStickyCta, 150)));
    updateStickyCta();
  }

  function initTransferToggleVisuals(){
    qsa('.toggle-row input[type="radio"]').forEach(r => {
      const parent = r.closest('label');
      if(!parent) return;
      parent.classList.toggle('selected', r.checked);
      r.addEventListener('change', ()=>{
        qsa('.toggle-row label').forEach(l=>l.classList.remove('selected'));
        parent.classList.add('selected');
      });
    });
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    try{
      initFloatingLabels();
      transformStepper();
      updateStepperCompletion();
      bindStepperEvents();
      initAddonTiles();
      initTransferToggleVisuals();
      initMobileNav();
      bindStepWatcher();
    }catch(e){ console.error('UI helper init failed', e); }
  });
})();
