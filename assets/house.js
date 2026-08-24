/* MAISON D'VUE — house.js
 * The cinematic behaviours that pair with house.css: a fade-in on load, a fade-out
 * before same-site navigation (a dissolve between rooms, never a hard cut), and a
 * single-pass reveal as editorial blocks enter the viewport. Self-contained and
 * idempotent; safe to load on every page. Honours prefers-reduced-motion.
 */
(function () {
  if (window.__mdvHouseLoaded) return;
  window.__mdvHouseLoaded = true;

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ── Page-load / page-exit fade ────────────────────────────────────────────
  var body = document.body;
  if (body) body.classList.add("mdv-fade");
  function fadeIn() {
    if (body) body.classList.add("mdv-fade-in");
  }
  if (document.readyState === "complete" || document.readyState === "interactive") {
    requestAnimationFrame(fadeIn);
  } else {
    window.addEventListener("DOMContentLoaded", function () { requestAnimationFrame(fadeIn); });
  }
  // Restore opacity when arriving via the back/forward cache.
  window.addEventListener("pageshow", function (e) { if (e.persisted) fadeIn(); });

  // Intercept in-house navigations to dissolve out first. Only plain left-clicks
  // on same-origin, non-anchor, non-new-tab links to .html destinations.
  if (!reduce) {
    document.addEventListener("click", function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (!a) return;
      if (a.target && a.target !== "_self") return;
      if (a.hasAttribute("download")) return;
      var href = a.getAttribute("href");
      if (!href || href.charAt(0) === "#") return;                 // in-page anchor
      if (/^(mailto:|tel:|javascript:)/i.test(href)) return;
      var url;
      try { url = new URL(a.href, window.location.href); } catch (err) { return; }
      if (url.origin !== window.location.origin) return;           // external
      // Same path + only a hash change → let the browser handle it.
      if (url.pathname === window.location.pathname && url.hash) return;
      e.preventDefault();
      body.classList.remove("mdv-fade-in");
      body.classList.add("mdv-fade-out");
      setTimeout(function () { window.location.href = a.href; }, 360);
    }, true);
  }

  // ── Reveal on scroll ──────────────────────────────────────────────────────
  function initReveal() {
    var items = document.querySelectorAll(".mdv-reveal, .mdv-reveal-group");
    if (!items.length) return;
    if (reduce || !("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("mdv-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("mdv-in");
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.12 });
    items.forEach(function (el) { io.observe(el); });
  }
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", initReveal);
  } else {
    initReveal();
  }
})();
