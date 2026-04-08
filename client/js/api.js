(function () {
  'use strict';

  async function fetchJson(endpoint, options) {
    const {
      method = 'GET',
      body = null,
      headers = {},
      timeout = 30000
    } = options || {};

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(endpoint, {
        method,
        headers,
        signal: controller.signal,
        body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
      });
      const data = await response.json().catch(() => ({}));
      return { ok: response.ok, status: response.status, data };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  window.LuxeApi = { fetchJson };
})();
