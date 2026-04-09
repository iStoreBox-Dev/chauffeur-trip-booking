/* Lightweight UI helpers for premium booking UX
  - Stepper completion + gold line fill
  - Add-on tile selected visual state
  - Mobile nav toggle
*/
(function(){
  'use strict';

  function qs(sel, ctx){ return (ctx||document).querySelector(sel); }
  function qsa(sel, ctx){ return Array.from((ctx||document).querySelectorAll(sel)); }

  /* ── Stepper ── */
  function transformStepper(){
    qsa('.step').forEach(step => {
      const spans = step.querySelectorAll('span');
      if(!spans.length) return;
      const first = spans[0];
      const label = spans[1] || null;
      first.classList.add('step-pill');
      if(label) label.classList.add('step-label');
      if(!first.querySelector('.num')){
        const num   = document.createElement('span'); num.className='num';   num.textContent = first.textContent.trim();
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
    // colour connector lines
    qsa('.stepper .line').forEach((line, i) => {
      line.classList.toggle('done', i < current - 1);
    });
  }

  function bindStepperEvents(){
    qsa('[data-next],[data-prev]').forEach(btn => {
      btn.addEventListener('click', () => setTimeout(updateStepperCompletion, 140));
    });
    const observer = new MutationObserver(() => updateStepperCompletion());
    qsa('.step').forEach(el => observer.observe(el, { attributes: true, attributeFilter: ['class'] }));
  }

  /* ── Add-on tiles (visual selected state only) ── */
  function initAddonTiles(){
    // General tile selected class
    qsa('.addon-item').forEach(label => {
      const cb = label.querySelector('input[type="checkbox"]');
      if(!cb) return;
      label.classList.toggle('selected', !!cb.checked);
      cb.addEventListener('change', () => label.classList.toggle('selected', !!cb.checked));
      label.addEventListener('keydown', (e) => { if(e.key==='Enter'||e.key===' '){ e.preventDefault(); cb.click(); } });
    });
  }

  /* ── Transfer toggle pill visuals ── */
  function initTransferToggleVisuals(){
    qsa('.toggle-row input[type="radio"]').forEach(r => {
      const parent = r.closest('label');
      if(!parent) return;
      parent.classList.toggle('selected', r.checked);
      r.addEventListener('change', () => {
        qsa('.toggle-row label').forEach(l => l.classList.remove('selected'));
        parent.classList.add('selected');
      });
    });
  }

  /* ── Mobile nav ── */
  function initMobileNav(){
    const header = qs('.site-header');
    const toggle = qs('#nav-toggle');
    if(!header || !toggle) return;
    toggle.addEventListener('click', () => {
      const open = header.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    qsa('#primary-nav a').forEach(link => {
      link.addEventListener('click', () => {
        header.classList.remove('nav-open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    try {
      transformStepper();
      updateStepperCompletion();
      bindStepperEvents();
      initAddonTiles();
      initTransferToggleVisuals();
      initMobileNav();
    } catch(e){ console.error('UI helper init failed', e); }
  });
})();
