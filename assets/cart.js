/* MAISON D'VUE — shared cart helpers.
   Cross-sell "+" buttons add to the real Shopify cart (shop.maisondvue.com)
   via a hidden iframe form-post, so the customer's own page never navigates.
   Cross-origin fetch() can't read Shopify's cart-endpoint responses (no CORS
   there), but a plain form POST isn't subject to CORS at all — same
   mechanism, just silent. A "believed" cart count is kept in localStorage so
   the bag icon can show a live badge as the customer moves between pages. */
(function () {
  var SHOP_ORIGIN = 'https://shop.maisondvue.com';
  var STORAGE_KEY = 'mdv_cart_count';

  function getCount() {
    var n = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
    return isNaN(n) ? 0 : n;
  }

  function renderBadges() {
    var n = getCount();
    document.querySelectorAll('.nav-bag-count').forEach(function (el) {
      if (n > 0) {
        el.textContent = n > 9 ? '9+' : String(n);
        el.classList.add('is-visible');
      } else {
        el.textContent = '';
        el.classList.remove('is-visible');
      }
    });
  }

  function bumpCount(by) {
    localStorage.setItem(STORAGE_KEY, String(getCount() + by));
    renderBadges();
  }

  var frame, form, idInput, qtyInput;
  function ensureFrame() {
    if (frame) return;
    frame = document.createElement('iframe');
    frame.name = 'mdv-cart-frame';
    frame.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;top:-9999px;';
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('tabindex', '-1');
    document.body.appendChild(frame);

    form = document.createElement('form');
    form.method = 'post';
    form.action = SHOP_ORIGIN + '/cart/add';
    form.target = 'mdv-cart-frame';
    form.style.display = 'none';
    idInput = document.createElement('input'); idInput.name = 'id';
    qtyInput = document.createElement('input'); qtyInput.name = 'quantity';
    form.appendChild(idInput);
    form.appendChild(qtyInput);
    document.body.appendChild(form);
  }

  function silentAdd(variantId, qty) {
    ensureFrame();
    idInput.value = variantId;
    qtyInput.value = qty || 1;
    form.submit();
    bumpCount(qty || 1);
  }

  var live;
  function announce(text) {
    if (!live) {
      live = document.createElement('div');
      live.setAttribute('aria-live', 'polite');
      live.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);';
      document.body.appendChild(live);
    }
    live.textContent = text;
  }

  function wireCrossAdd() {
    document.querySelectorAll('.pdp-cross-add[data-variant-id]').forEach(function (btn) {
      if (btn.dataset.mdvWired) return;
      btn.dataset.mdvWired = '1';
      btn.addEventListener('click', function () {
        var qty = parseInt(btn.dataset.qty || '1', 10) || 1;
        silentAdd(btn.dataset.variantId, qty);

        clearTimeout(btn._mdvResetTimer);
        btn.classList.add('is-added');
        btn._mdvResetTimer = setTimeout(function () {
          btn.classList.remove('is-added');
        }, 1300);

        var pop = document.createElement('span');
        pop.className = 'pdp-cross-pop';
        pop.textContent = '+' + qty;
        pop.addEventListener('animationend', function () { pop.remove(); });
        btn.appendChild(pop);

        announce((btn.dataset.label || 'Item') + ' added to your bag.');
      });
    });
  }

  function init() { renderBadges(); wireCrossAdd(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.MDVCart = { silentAdd: silentAdd, getCount: getCount, renderBadges: renderBadges };
})();
