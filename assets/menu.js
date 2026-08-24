/* MAISON D'VUE — mobile menu
 * Self-contained: injects a hamburger into the page nav and a full-screen
 * overlay menu (big centered primary links, small utility links at the
 * bottom). Mirrors the chat widget's injection pattern so a single file
 * powers every page. Mobile only (hamburger hidden >= 861px).
 */
(function () {
  if (window.__mdvMenuLoaded) return;
  window.__mdvMenuLoaded = true;

  var NAVY = "#0A0A0A";
  var PAPER = "#FFFFFF";

  // The five rooms of the house.
  var PRIMARY = [
    { label: "The Elixir", href: "product.html" },
    { label: "The Ritual", href: "product.html#ritual" },
    { label: "The House", href: "about.html" },
    { label: "World", href: "gallery.html" }
  ];
  var SECONDARY = [
    { label: "Reserve", href: "founders-circle.html" }
  ];

  // YSL-style menu typeface (native Helvetica Neue on iOS).
  var SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";

  var css =
    ".mdv-burger{display:none;background:none;border:0;cursor:pointer;padding:8px;margin:0 -8px 0 0;color:" + PAPER + ";align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent;transition:color 320ms ease}" +
    ".mdv-burger svg{width:18px;height:9px;display:block}" +
    /* solid/scrolled nav and the always-light creator pages get dark burger */
    ".mdv-nav.scrolled .mdv-burger,.nav .mdv-burger{color:" + NAVY + "}" +
    "@media(max-width:860px){.mdv-burger{display:inline-flex;order:-1}}" +

    ".mdv-menu{position:fixed;inset:0;z-index:400;background:" + PAPER + ";display:flex;flex-direction:column;" +
      "opacity:0;visibility:hidden;transform:translateY(-6px);transition:opacity 360ms ease,transform 360ms ease,visibility 360ms}" +
    ".mdv-menu.open{opacity:1;visibility:visible;transform:none}" +
    ".mdv-menu-top{flex:0 0 auto;height:72px;display:flex;align-items:center;justify-content:space-between;padding:0 22px}" +
    ".mdv-menu-icon{background:none;border:0;cursor:pointer;padding:8px;color:" + NAVY + ";display:inline-flex;align-items:center;-webkit-tap-highlight-color:transparent}" +
    ".mdv-menu-icon svg{width:22px;height:22px;display:block}" +
    ".mdv-menu-primary{flex:1 1 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;padding:24px 20px}" +
    ".mdv-menu-primary a{font-family:" + SANS + ";font-weight:700;font-size:clamp(22px,6.4vw,30px);letter-spacing:0.01em;text-transform:uppercase;color:" + NAVY + ";line-height:1.2;text-align:center}" +
    ".mdv-menu-secondary{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:18px;padding:0 20px calc(48px + env(safe-area-inset-bottom))}" +
    ".mdv-menu-secondary a{font-family:" + SANS + ";font-weight:500;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:" + NAVY + "}" +
    ".mdv-menu-primary a[href=\"gallery.html\"]::before{content:\"\";display:inline-block;width:10px;height:10px;background:currentColor;margin-right:14px;vertical-align:baseline}" +
    ".mdv-menu-primary a,.mdv-menu-secondary a{text-decoration:none;transition:opacity 200ms ease}" +
    ".mdv-menu-primary a:active,.mdv-menu-secondary a:active{opacity:0.55}" +
    "body.mdv-menu-open{overflow:hidden}" +
    /* keep the floating chat badge from sitting on top of the open menu */
    "body.mdv-menu-open .mdv-chat-launcher{opacity:0;visibility:hidden;pointer-events:none}" +
    /* Clean, tightly-tracked Helvetica nav lettering, site-wide (logo stays Didone serif) */
    ".mdv-nav .nav-links a,.mdv-nav .nav-right a,.mdv-nav .nav-group a,.mdv-nav .nav-reserve-m," +
      ".nav .nav-links a,.nav .nav-login,.nav .nav-welcome{" +
      "font-family:" + SANS + "!important;font-weight:400!important;letter-spacing:0.1em!important}";

  var styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  function svgBurger() {
    return '<svg viewBox="0 0 26 12" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><line x1="0" y1="3" x2="26" y2="3"/><line x1="0" y1="9" x2="26" y2="9"/></svg>';
  }
  function svgClose() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>';
  }
  function svgBag() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M6 7h12l-1 14H7L6 7z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/></svg>';
  }
  function links(arr) {
    return arr.map(function (l) { return '<a href="' + l.href + '">' + l.label + '</a>'; }).join("");
  }

  function build() {
    var nav = document.querySelector(".mdv-nav") || document.querySelector(".nav");
    if (!nav) return;

    // Hamburger, placed at the start (left) of the nav; shown on mobile only.
    var burger = document.createElement("button");
    burger.className = "mdv-burger";
    burger.type = "button";
    burger.setAttribute("aria-label", "Open menu");
    burger.innerHTML = svgBurger();
    nav.insertBefore(burger, nav.firstChild);

    // Match the hamburger to the nav's logo colour so it's legible on every
    // page (light over dark hero, navy on a light/scrolled nav).
    var sampler = nav.querySelector(".nav-logo") || nav.querySelector("a");
    var lastState = null;
    function syncBurger() {
      var isScrolled = window.scrollY > 60;
      if (!nav.classList.contains("mdv-nav--light") && !nav.classList.contains("mdv-nav--overlay")) {
        nav.classList.toggle("scrolled", isScrolled);
      }
      if (isScrolled !== lastState) {
        lastState = isScrolled;
        if (sampler) burger.style.color = getComputedStyle(sampler).color;
      }
    }
    syncBurger();
    setTimeout(syncBurger, 60);
    window.addEventListener("scroll", syncBurger, { passive: true });

    // Full-screen overlay.
    var menu = document.createElement("div");
    menu.className = "mdv-menu";
    menu.id = "mdvMenu";
    menu.setAttribute("role", "dialog");
    menu.setAttribute("aria-modal", "true");
    menu.setAttribute("aria-label", "Menu");
    menu.innerHTML =
      '<div class="mdv-menu-top">' +
        '<button class="mdv-menu-icon mdv-menu-close" type="button" aria-label="Close menu">' + svgClose() + '</button>' +
        '<a class="mdv-menu-icon" href="https://shop.maisondvue.com/cart" aria-label="Bag">' + svgBag() + '</a>' +
      '</div>' +
      '<nav class="mdv-menu-primary">' + links(PRIMARY) + '</nav>' +
      '<nav class="mdv-menu-secondary">' + links(SECONDARY) + '</nav>';
    document.body.appendChild(menu);

    function openMenu() { menu.classList.add("open"); document.body.classList.add("mdv-menu-open"); }
    function closeMenu() { menu.classList.remove("open"); document.body.classList.remove("mdv-menu-open"); }

    burger.addEventListener("click", openMenu);
    menu.querySelector(".mdv-menu-close").addEventListener("click", closeMenu);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });
    // Closing on link tap keeps the transition tidy before navigation.
    menu.querySelectorAll("a[href]").forEach(function (a) {
      a.addEventListener("click", function () { closeMenu(); });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
