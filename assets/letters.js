/* ═══════════════════════════════════════════════════════════════════════════
   MAISON D'VUE — Letters popup (newsletter capture)
   Subscribes straight into Mailchimp via the maison Worker. No Google, no sheet.
   Self-contained: injects its own styles + DOM. Include on any page with:
     <script src="assets/letters.js" defer></script>
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  // ── Configuration ───────────────────────────────────────────────────────────
  var SUBSCRIBE_ENDPOINT = "https://maisondvue-chat.masiela23.workers.dev/";
  var DELAY_MS       = 2000;               // appears two seconds after landing
  var COOKIE         = "mdv_letters_seen"; // shared across every page
  var DISMISS_DAYS   = 7;                  // merely seen it -> ask again in a week
  var SUBSCRIBED_DAYS = 365;               // actually joined -> never nag again
  var SOURCE        = "letters";

  if (window.__mdvLettersLoaded) return;  // never mount twice on one page
  window.__mdvLettersLoaded = true;

  // A page carrying the original inline popup owns it — stand down.
  if (document.getElementById("lettersOverlay")) return;

  // ── Styles ──────────────────────────────────────────────────────────────────
  var css = `  /* ═══════════════════════════════════════════════════════════
     LETTERS POPUP
     ═══════════════════════════════════════════════════════════ */
  .letters-overlay {
    position: fixed;
    inset: 0;
    background: rgba(10, 10, 10, 0.42);
    backdrop-filter: blur(6px);
    z-index: 300;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 480ms cubic-bezier(0.22, 0.61, 0.36, 1);
  }

  .letters-overlay.visible {
    opacity: 1;
    pointer-events: auto;
  }

  .letters-modal {
    position: relative;
    width: 100%;
    max-width: 520px;
    background: var(--warm-white);
    border: 1px solid rgba(10, 10, 10, 0.12);
    padding: 64px 56px 48px;
    text-align: left;
    transform: translateY(20px) scale(0.98);
    transition: transform 600ms cubic-bezier(0.22, 0.61, 0.36, 1);
  }

  .letters-overlay.visible .letters-modal {
    transform: translateY(0) scale(1);
  }

  .letters-close {
    position: absolute;
    top: 18px;
    right: 18px;
    width: 28px;
    height: 28px;
    background: transparent;
    border: 0;
    cursor: pointer;
    color: var(--navy);
    font-size: 20px;
    line-height: 1;
    padding: 0;
    transition: color 200ms ease;
  }

  .letters-close:hover {
    color: var(--gold-muted);
  }

  .letters-label {
    font-family: var(--font-display);
    font-size: 11px;
    letter-spacing: 0.32em;
    text-transform: uppercase;
    color: var(--navy);
    margin-bottom: 12px;
    line-height: 1;
    font-weight: 500;
  }

  .letters-headline {
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 20px;
    line-height: 1.3;
    letter-spacing: 0.01em;
    color: var(--navy);
    margin-bottom: 10px;
  }

  .letters-sub {
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 13.5px;
    line-height: 1.55;
    letter-spacing: 0.01em;
    color: var(--mid);
    margin-bottom: 26px;
  }

  .letters-form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .letters-input-row {
    display: flex;
    align-items: stretch;
    border-bottom: 1px solid var(--navy);
    padding-bottom: 8px;
  }

  .letters-input {
    flex: 1;
    background: transparent;
    border: 0;
    color: var(--navy);
    font-family: var(--font-display);
    font-size: 15px;
    padding: 8px 0;
    outline: none;
    letter-spacing: 0.01em;
  }

  .letters-input::placeholder {
    color: rgba(10, 10, 10, 0.45);
    font-family: var(--font-display);
    letter-spacing: 0.02em;
  }

  .letters-submit {
    background: transparent;
    border: 0;
    color: var(--navy);
    font-family: var(--font-display);
    font-weight: 500;
    font-size: 13px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    padding: 4px 8px;
    cursor: pointer;
    transition: color 240ms ease;
    white-space: nowrap;
  }

  .letters-submit:hover {
    color: var(--gold-muted);
  }

  .letters-submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .letters-consent {
    margin-top: 18px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    font-family: var(--font-display);
    font-size: 13px;
    line-height: 1.55;
    color: var(--mid);
    letter-spacing: 0.01em;
  }

  .letters-consent input[type="checkbox"] {
    margin-top: 3px;
    flex-shrink: 0;
    accent-color: var(--navy);
    cursor: pointer;
  }

  .letters-consent a {
    color: var(--navy);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .letters-feedback {
    margin-top: 16px;
    min-height: 20px;
    font-family: var(--font-italic);
    font-style: italic;
    font-size: 14px;
    color: var(--gold-muted);
    line-height: 1.5;
  }

  .letters-feedback.error {
    color: #B26A6A;
  }

  .letters-modal.submitted .letters-form,
  .letters-modal.submitted .letters-consent,
  .letters-modal.submitted .letters-rules {
    display: none;
  }

  .letters-hp {
    position: absolute;
    left: -9999px;
    opacity: 0;
  }

  @media (max-width: 768px) {
    .letters-modal { padding: 48px 28px 36px; }
  }`;

  var styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ── Markup ──────────────────────────────────────────────────────────────────
  var wrap = document.createElement("div");
  wrap.innerHTML = `<div class="letters-overlay" id="lettersOverlay" aria-hidden="true" role="dialog" aria-labelledby="lettersHeadline">
  <div class="letters-modal" id="lettersModal">
    <button class="letters-close" type="button" aria-label="Close">&times;</button>

    <p class="letters-label">WELCOME TO MAISON D&rsquo;VUE</p>
    <h2 class="letters-headline" id="lettersHeadline">The sapphire necklace remains unclaimed.</h2>
    <p class="letters-sub">Enter the draw for a chance to make it yours. Winner revealed November 23.</p>

    <form class="letters-form" id="lettersForm" novalidate>
      <div class="letters-input-row">
        <input type="text" class="letters-input" id="lettersName" name="lettersName" placeholder="Enter your first name" autocomplete="given-name" required>
      </div>
      <div class="letters-input-row">
        <input type="email" class="letters-input" id="lettersEmail" name="lettersEmail" placeholder="Enter your email address" autocomplete="email" required>
        <button type="submit" class="letters-submit" id="lettersSubmit">OK &gt;</button>
      </div>

      <div class="letters-hp" aria-hidden="true">
        <input type="text" id="lettersHp" name="lettersHp" tabindex="-1" autocomplete="off">
      </div>
    </form>

    <label class="letters-consent">
      <input type="checkbox" id="lettersConsent" checked>
      <span>By clicking submit, I agree to MAISON D&rsquo;VUE&rsquo;s <a href="privacy.html">Privacy Policy</a> and <a href="terms.html">Terms &amp; Conditions of Use</a>.</span>
    </label>

    <p class="letters-rules" style="margin-top: 10px; font-family: var(--font-display); font-size: 11px; color: var(--mid); letter-spacing: 0.01em;">No purchase necessary. See <a href="rules.html" style="color: var(--navy); text-decoration: underline;">official rules</a>.</p><!-- TODO: link official sweepstakes rules once legal/Masiela confirms the mechanism -->

    <p class="letters-feedback" id="lettersFeedback" role="status" aria-live="polite"></p>
  </div>
</div>`;
  var overlay = wrap.firstElementChild;
  document.body.appendChild(overlay);

  var modal    = overlay.querySelector("#lettersModal");
  var form     = overlay.querySelector("#lettersForm");
  var submit   = overlay.querySelector("#lettersSubmit");
  var feedback = overlay.querySelector("#lettersFeedback");
  var nameEl   = overlay.querySelector("#lettersName");
  var emailEl  = overlay.querySelector("#lettersEmail");
  var hpEl     = overlay.querySelector("#lettersHp");
  var consent  = overlay.querySelector("#lettersConsent");
  var closeBtn = overlay.querySelector(".letters-close");

  // ── Cookie helpers ──────────────────────────────────────────────────────────
  function getCookie(name) {
    var parts = ("; " + document.cookie).split("; " + name + "=");
    return parts.length === 2 ? parts.pop().split(";").shift() : null;
  }
  function setCookie(name, value, days) {
    var d = new Date();
    d.setTime(d.getTime() + days * 864e5);
    document.cookie = name + "=" + value + ";expires=" + d.toUTCString() + ";path=/";
  }

  // ── Open / close ────────────────────────────────────────────────────────────
  function show(force) {
    if (!force && getCookie(COOKIE)) return;
    overlay.classList.add("visible");
    overlay.setAttribute("aria-hidden", "false");
    setCookie(COOKIE, "shown", DISMISS_DAYS);
  }
  function close() {
    overlay.classList.remove("visible");
    overlay.setAttribute("aria-hidden", "true");
  }

  window.openLettersPopup = function (force) {
    show(force !== false);
  };

  document.addEventListener("click", function (e) {
    var target = e.target.closest('a[href="#necklace"], a[href="#giveaway"], a[href="#letters"], .js-open-giveaway');
    if (target) {
      e.preventDefault();
      window.openLettersPopup(true);
    }
  });

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && overlay.classList.contains("visible")) close();
  });

  function setMsg(text, type) {
    feedback.textContent = text || "";
    feedback.classList.remove("error");
    if (type === "error") feedback.classList.add("error");
  }

  // ── Submit → Mailchimp ──────────────────────────────────────────────────────
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    setMsg("");

    var name  = nameEl.value.trim();
    var email = emailEl.value.trim();

    if (hpEl.value.trim()) {           // honeypot: thank the bot, save nothing
      setMsg("Thank you. Your name is on the list.");
      modal.classList.add("submitted");
      setTimeout(close, 2400);
      return;
    }
    if (!name) {
      setMsg("Your first name, please.", "error");
      nameEl.focus();
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMsg("A valid email, please.", "error");
      emailEl.focus();
      return;
    }
    if (!consent.checked) {
      setMsg("Please agree to the terms to continue.", "error");
      return;
    }

    submit.disabled = true;
    var origLabel = submit.textContent;
    submit.textContent = "...";

    try {
      var res = await fetch(SUBSCRIBE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "subscribe",
          profile: { email: email, firstName: name, source: SOURCE }
        })
      });
      var ok = res.ok;
      try {
        var data = await res.json();
        ok = ok && data && data.ok !== false;   // {ok:true,existing:true} counts
      } catch (_) {}

      if (!ok) throw new Error("subscribe failed");
      setCookie(COOKIE, "subscribed", SUBSCRIBED_DAYS);  // joined — don't ask again
      setMsg("Thank you. Your name is on the list.");
      modal.classList.add("submitted");
      form.reset();
      setTimeout(close, 2800);
    } catch (err) {
      setMsg("Forgive us — something faltered in transit. Write to hello@maisondvue.com.", "error");
    } finally {
      submit.disabled = false;
      submit.textContent = origLabel;
    }
  });

  setTimeout(show, DELAY_MS);
})();
