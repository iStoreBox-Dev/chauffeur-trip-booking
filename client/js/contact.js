(function () {
  'use strict';

  const LANG_KEY = 'chauffeur_locale';
  const THEME_KEY = 'chauffeur_theme';
  const DEBUG_KEY = 'chauffeur_debug';

  function qs(selector, ctx = document) {
    return ctx.querySelector(selector);
  }

  function isDebugEnabled() {
    const byStorage = localStorage.getItem(DEBUG_KEY) === '1';
    const byQuery = new URLSearchParams(window.location.search).get('debug') === '1';
    return byStorage || byQuery;
  }

  function debugLog(message, data) {
    if (!isDebugEnabled()) return;
    if (typeof data === 'undefined') {
      console.log('[LUXERIDE CONTACT DEBUG]', message);
      return;
    }
    console.log('[LUXERIDE CONTACT DEBUG]', message, data);
  }

  function setTheme(theme, persist) {
    const finalTheme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', finalTheme);

    const button = qs('#theme-toggle');
    if (button) {
      button.textContent = finalTheme === 'dark' ? '☀ Light' : '🌙 Dark';
    }

    if (persist) {
      localStorage.setItem(THEME_KEY, finalTheme);
    }

    debugLog('Theme updated', { finalTheme, persist });
  }

  function setLocale(locale, persist) {
    const finalLocale = locale === 'ar' ? 'ar' : 'en';
    document.documentElement.lang = finalLocale;
    document.documentElement.dir = finalLocale === 'ar' ? 'rtl' : 'ltr';

    const button = qs('#lang-toggle');
    if (button) {
      button.textContent = finalLocale === 'en' ? '🌐 AR' : '🌐 EN';
    }

    if (persist) {
      localStorage.setItem(LANG_KEY, finalLocale);
    }

    debugLog('Locale updated', { finalLocale, persist });
  }

  function bindHeaderTools() {
    const langBtn = qs('#lang-toggle');
    const themeBtn = qs('#theme-toggle');

    if (langBtn) {
      langBtn.addEventListener('click', () => {
        const current = document.documentElement.lang || 'en';
        setLocale(current === 'en' ? 'ar' : 'en', true);
      });
    }

    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        setTheme(current === 'dark' ? 'light' : 'dark', true);
      });
    }
  }

  function setStatusMessage(message, type) {
    const el = qs('#contact-message');
    if (!el) return;

    el.textContent = message;
    if (type === 'ok') {
      el.style.color = 'var(--ok)';
    } else if (type === 'error') {
      el.style.color = 'var(--err)';
    } else {
      el.style.color = 'var(--muted)';
    }
  }

  function bindContactForm() {
    const form = qs('#contact-form');
    if (!form) {
      debugLog('Contact form not found on this page');
      return;
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const payload = {
        first_name: qs('#contact-first')?.value.trim() || '',
        last_name: qs('#contact-last')?.value.trim() || '',
        email: qs('#contact-email')?.value.trim() || '',
        country_code: qs('#country-code')?.value || '+973',
        phone: qs('#contact-phone')?.value.trim() || '',
        message: qs('#contact-message-text')?.value.trim() || ''
      };

      debugLog('Submitting contact payload', {
        hasFirstName: Boolean(payload.first_name),
        hasLastName: Boolean(payload.last_name),
        hasEmail: Boolean(payload.email),
        hasPhone: Boolean(payload.phone),
        messageLength: payload.message.length
      });

      try {
        const response = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const responseBody = await response.json().catch(() => ({}));
        debugLog('Contact API response', { status: response.status, ok: response.ok, responseBody });

        if (response.ok) {
          setStatusMessage('Message sent. We will get back to you shortly.', 'ok');
          form.reset();
          return;
        }

        setStatusMessage(responseBody.error || 'Message was not sent. Please try again.', 'error');
      } catch (error) {
        debugLog('Contact API request failed', { error: error.message });
        setStatusMessage('Failed to send message. Please try again later.', 'error');
      }
    });
  }

  function runDiagnostics() {
    if (!isDebugEnabled()) return;

    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((n) => n.getAttribute('href'));
    const scripts = Array.from(document.querySelectorAll('script[src]')).map((n) => n.getAttribute('src'));

    debugLog('Page diagnostics', {
      path: window.location.pathname,
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      theme: document.documentElement.getAttribute('data-theme'),
      styles,
      scripts
    });

    window.addEventListener('error', (event) => {
      const target = event.target;
      if (target && (target.tagName === 'SCRIPT' || target.tagName === 'LINK' || target.tagName === 'IMG')) {
        debugLog('Asset failed to load', {
          tag: target.tagName,
          source: target.src || target.href || ''
        });
      }
    }, true);
  }

  function init() {
    const savedLocale = localStorage.getItem(LANG_KEY) || document.documentElement.lang || 'en';
    const savedTheme = localStorage.getItem(THEME_KEY) || document.documentElement.getAttribute('data-theme') || 'dark';

    setLocale(savedLocale, false);
    setTheme(savedTheme, false);

    bindHeaderTools();
    bindContactForm();
    runDiagnostics();

    const year = qs('#footer-year');
    if (year) {
      year.textContent = String(new Date().getFullYear());
    }

    debugLog('Contact page initialized');
  }

  init();
})();
