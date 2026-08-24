# MAISON D’VUE — Founding Creator Program

A complete, low-maintenance affiliate & creator program built to the same
quiet standard as the rest of the house. Three pieces:

| File | Role |
| --- | --- |
| `creators.html` | The public application page (hero, the house, benefits, commission, application + success). |
| `creator-dashboard.html` | The creator portal — enter a code to see sales, revenue, commission, link & code. |
| `creator-program.gs` | The backend: a Google Apps Script Web App with a Google Sheet as the data store and admin dashboard. |

The pages work **immediately** as a polished preview without any backend — the
dashboard shows a demonstration record. And the application form is **already
live**: until the Apps Script endpoint is set, submissions post straight into
the MAISON D'VUE Mailchimp audience (the same no-server method the Founder's
Circle form uses), so applicants are captured from day one. Name and email land
on every audience; the social/shipping fields populate too if matching merge
tags exist (`IG`, `TIKTOK`, `FOLLOWERS`, `SHIPADDR`, `NOTE`) — add those in
Mailchimp ▸ Audience ▸ Settings ▸ Merge fields if you want them stored now.

Deploying the Apps Script below upgrades the experience: structured rows,
auto-generated referral codes/links, the approval + receipt emails, the creator
dashboard, and click tracking. Once `APPLICATION_ENDPOINT` is set, the form uses
the script instead of the Mailchimp fallback automatically.

---

## 1 · Stand up the backend (Google Apps Script)

Nothing in the script needs editing — it binds to its own sheet.

1. Open a blank **Google Sheet** (visit **sheets.new**).
2. **Extensions ▸ Apps Script**. Delete the placeholder and paste the contents
   of `creator-program.gs`. Leave `SHEET_ID` empty. (Optionally set
   `SHOP_BASE_URL` if your store isn't `shop.maisondvue.com`.)
3. Run **`setup`** once (Run ▸ `setup`) and grant authorization. This builds
   the `Applications`, `Sales`, `Clicks`, and `Admin Dashboard` tabs, adds the
   Status dropdown, and installs the trigger that mints codes on approval.
4. **Deploy ▸ New deployment ▸ Web app.**
   - *Execute as:* **Me**
   - *Who has access:* **Anyone**
   - Deploy and copy the **Web App URL**.

## 2 · Connect the pages

In **`creators.html`**, set:

```js
var APPLICATION_ENDPOINT = "https://script.google.com/macros/s/……/exec";
```

In **`creator-dashboard.html`**, set the same URL:

```js
var DASHBOARD_ENDPOINT = "https://script.google.com/macros/s/……/exec";
```

That is the entire wiring. Commit and the program is live.

---

## How it runs

### Application → sheet
Submitting `creators.html` appends a row to **Applications** with the
application date, name, email, social handles, follower range, shipping
address, optional note, and a `Status` of **Applied**. The applicant receives
a quiet *Application Received* email, and the House is notified
(`NOTIFY_EMAIL`).

### Approval → automatic affiliate account
The **Status** column is a dropdown:

> Applied · Approved · Product Sent · Active Affiliate · House Ambassador · Founder Circle

The moment you move someone off **Applied**, the script automatically:

- generates a **unique referral code** (e.g. `MASIELA10`),
- writes their **affiliate link** (`SHOP_BASE_URL?ref=CODE`),
- sends the **“Welcome to the House”** approval email — a cream/navy serif
  note with their code, link, 20% commission, and benefits.

No extra step — editing the dropdown *is* the approval action.

### The creator dashboard
A creator opens `creator-dashboard.html` and enters **both their creator code
and the email they applied with** — the code alone won't release their figures,
a light second factor since codes are guessable. A deep link may prefill the
code (`creator-dashboard.html?code=THEIRCODE`); the creator still confirms the
email before anything is shown. Once verified they see:

- **Total Sales**, **Total Revenue Generated**, **Commission Earned**
- their **Affiliate Link** and **Referral Code**, each with a **Copy** button,
  plus a **Request Support** button (mails `hello@maisondvue.com`).

### Commission tiers
Rates are read from the `Status`/tier in `COMMISSION_RATES`:

| Tier | Rate |
| --- | --- |
| Founding Creator / Active Affiliate | 20% |
| House Ambassador | 25% |
| Founder Circle | 30% |

Advancement = changing the Status dropdown. Rates and tier names are all
editable at the top of `creator-program.gs`.

### Recording sales
Add verified orders to the **Sales** tab: `Date · Creator Code · Order ID ·
Order Value · Status`. Rows marked `refunded`, `cancelled`, or `voided` are
excluded. You can paste these in manually, or have your store/webhook append
them.

To attribute orders automatically, capture the `?ref=` parameter at checkout
(store it to a cookie / cart attribute) and write the code into the Sales tab
with each order — most carts support this with a small snippet or a Zapier /
Make step.

### Tracking clicks (optional)
The clean `…?ref=CODE` link works on its own. If you also want **click**
counts, hand creators the trackable form of their link instead:

```
https://script.google.com/macros/s/……/exec?action=click&code=CODE
```

It logs the click to the **Clicks** tab and instantly forwards to the shop
with `?ref=CODE` attached. Clicks then roll up per creator and into the admin
summary on the next `refreshAllTotals`.

### Admin dashboard
The Google Sheet **is** the admin console. The **Admin Dashboard** tab
summarizes Applications, Approvals, Product shipments, Active affiliates,
Referral clicks, Total revenue, Commission owed, and the **Top performing
creators**. Approve or reject by hand via the Status dropdown. Run
**`refreshAllTotals`** (or add a daily time-based trigger) to recompute every
creator's clicks/sales/commission and rebuild the summary.

---

## Notes
- Both pages are `noindex` — the program is by invitation, not a public funnel.
- No secrets live in the static site; the Apps Script holds everything.
- A honeypot field on the form silently discards bot submissions.
