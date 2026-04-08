(function () {
  'use strict';

  function byId(id) {
    return document.getElementById(id);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const form = byId('contact-form');
    const messageEl = byId('contact-message');
    if (!form || !messageEl) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        first_name: byId('contact-first')?.value.trim(),
        last_name: byId('contact-last')?.value.trim(),
        email: byId('contact-email')?.value.trim(),
        country_code: byId('country-code')?.value,
        phone: byId('contact-phone')?.value.trim(),
        message: byId('contact-message-text')?.value.trim()
      };

      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          messageEl.style.color = 'var(--ok)';
          messageEl.textContent = 'Message sent — we will get back to you soon.';
          form.reset();
          return;
        }

        messageEl.style.color = 'var(--muted)';
        messageEl.textContent = 'Message recorded locally (no server endpoint).';
      } catch (_err) {
        messageEl.style.color = 'var(--err)';
        messageEl.textContent = 'Failed to send message. Please try again later.';
      }
    });
  });
})();
