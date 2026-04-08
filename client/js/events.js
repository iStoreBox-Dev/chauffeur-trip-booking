(function () {
  'use strict';

  function on(el, event, handler, options) {
    if (!el) return;
    el.addEventListener(event, handler, options);
  }

  function delegate(root, event, selector, handler) {
    if (!root) return;
    root.addEventListener(event, function (e) {
      const target = e.target.closest(selector);
      if (!target || !root.contains(target)) return;
      handler(e, target);
    });
  }

  window.LuxeEvents = { on, delegate };
})();
