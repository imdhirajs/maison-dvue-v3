/**
 * MAISON D'VUE - Founding Creator Program backend (Google Apps Script)
 * ---------------------------------------------------------------------------
 * A single Web App that powers the creator program with a Google Sheet as the
 * data store - the same lightweight pattern the boutique already uses for its
 * reservation waitlist. No server to maintain, no database to provision.
 *
 *   POST  (form fields)                         -> record a new application
 *   GET   ?action=dashboard&code=CODE           -> a creator's dashboard figures
 *   GET   ?action=click&code=CODE               -> log a referral click, then redirect to the shop
 *
 * Emails (best-effort): an "Application Received" receipt on submit, and a
 * "Welcome to the House" approval email the moment a creator is approved.
 *
 * The Google Sheet itself IS the admin dashboard: the founder reviews, approves,
 * and tracks everything from the rows. Changing an applicant's Status to
 * "Approved" automatically mints their affiliate code and referral link.
 *
 * -- DEPLOY (about a minute, nothing to edit) --------------------------------
 *  1. Open a blank Google Sheet (sheets.new).
 *  2. Extensions > Apps Script. Delete the placeholder, paste this whole file.
 *     (Leave SHEET_ID empty - a bound script uses its own sheet automatically.)
 *  3. Run `setup` once (Run > setup) and authorize. It builds the tabs and
 *     installs the on-edit trigger that mints codes on approval.
 *  4. Deploy > New deployment > Web app.
 *       Execute as: Me   |   Who has access: Anyone
 *     Copy the Web App URL.
 *  5. Send that URL over - it gets pasted into APPLICATION_ENDPOINT in
 *     creators.html and DASHBOARD_ENDPOINT in creator-dashboard.html.
 * ---------------------------------------------------------------------------
 */

// -- Configuration ------------------------------------------------------------
// Leave SHEET_ID empty when this script is bound to its sheet (the normal case:
// created via Extensions > Apps Script). Only set it if you run the script
// standalone, pointing at a sheet by ID from its URL (.../d/<ID>/edit).
var SHEET_ID = "";

// Where verified purchases send shoppers. The creator's code is appended as ?ref=.
var SHOP_BASE_URL = "https://shop.maisondvue.com/";

// Notify the House when a new application arrives ("" to disable).
var NOTIFY_EMAIL = "hello@maisondvue.com";

// Display name on the automated emails sent to applicants/creators.
var SENDER_NAME = "MAISON D'VUE";

// -- Mailchimp --------------------------------------------------------------
// Applicant-facing emails are sent by Mailchimp Customer Journeys, triggered by
// tags this script applies: MC_TAG_APPLIED on submit, MC_TAG_APPROVED on
// approval. The API key lives in Script Properties (Project Settings > Script
// Properties) under MAILCHIMP_API_KEY so it never touches the repo; the
// datacenter is read from the key's suffix. Run `setupMailchimp` once after
// adding the key to create the merge fields the approval email needs.
//
// STATUS (on hold): the Mailchimp path is built but DORMANT. The script needs
// the script.external_request OAuth scope (declared in appsscript.json) to call
// the Mailchimp API. Granting a NEW scope to an already-authorized script
// requires a one-time re-authorization that the editor will not auto-prompt for
// -- revoke the project's access at myaccount.google.com/connections, then run
// `setupMailchimp` to get a fresh consent screen. Until then every mc* call
// fails silently (best-effort) and applicant emails are sent via Gmail instead
// (MC_OWNS_APPLICANT_EMAILS = false), which works today.
var MC_AUDIENCE_ID = "3a9da7ab07";          // us20 "MAISON D'VUE" audience
var MC_TAG_APPLIED = "creator-applied";
var MC_TAG_APPROVED = "creator-approved";

// When true, Mailchimp owns the applicant receipt + approval emails and the
// script's own Gmail versions are suppressed (no duplicates). The internal
// founder notification still sends.
// ROLLOUT: keep false until the two Customer Journeys are built and verified --
// Gmail keeps sending receipts meanwhile (no gap) while tags sync in parallel.
// Flip to true for Mailchimp-only once the Journeys are live.
var MC_OWNS_APPLICANT_EMAILS = false;

// Commission rate by status / tier. Advancement is set by editing Status.
var COMMISSION_RATES = {
  "Applied": 0,
  "Approved": 0.20,
  "Product Sent": 0.20,
  "Active Affiliate": 0.20,
  "Founding Creator": 0.20,
  "House Ambassador": 0.25,
  "Founder Circle": 0.30
};

// The status values offered as a dropdown in the sheet.
var STATUS_OPTIONS = [
  "Applied", "Approved", "Product Sent",
  "Active Affiliate", "House Ambassador", "Founder Circle"
];

var APPLICATIONS_TAB = "Applications";
var SALES_TAB = "Sales";
var CLICKS_TAB = "Clicks";
var DASHBOARD_TAB = "Admin Dashboard";

var APP_HEADERS = [
  "Application Date", "First Name", "Last Name", "Email",
  "Instagram", "TikTok", "Follower Count", "Shipping Address",
  "Note", "Status", "Creator Code", "Referral Link",
  "Clicks", "Total Sales", "Total Revenue", "Commission Owed", "Source"
];

var SALES_HEADERS = ["Date", "Creator Code", "Order ID", "Order Value", "Status"];
var CLICKS_HEADERS = ["Date", "Creator Code", "Referrer"];

// -- HTTP entry points ---------------------------------------------------------
function doPost(e) {
  try {
    var p = (e && e.parameter) || {};

    // Honeypot - silently accept and discard.
    if (p.website) return json({ ok: true });

    var email = String(p.email || "").trim().toLowerCase();
    if (!email || email.indexOf("@") === -1) {
      return json({ ok: false, error: "A valid email is required." });
    }

    var sheet = tab(APPLICATIONS_TAB, APP_HEADERS);

    sheet.appendRow([
      new Date(),
      clean(p.firstName),
      clean(p.lastName),
      email,
      clean(p.instagram),
      clean(p.tiktok),
      clean(p.followers),
      clean(p.shipping, 500),
      clean(p.note, 1000),
      "Applied",
      "",            // Creator Code - minted on approval
      "",            // Referral Link - minted on approval
      0,             // Clicks
      0,             // Total Sales
      0,             // Total Revenue
      0,             // Commission Owed
      clean(p.source) || "creators-page"
    ]);

    // Sync to Mailchimp and tag "creator-applied" -> the Journey on that tag
    // sends the branded "Application Received" email. Only standard merge
    // fields (FNAME/LNAME) are sent here so an audience without custom fields
    // never rejects the subscribe + tag.
    mcUpsert(email, { FNAME: clean(p.firstName), LNAME: clean(p.lastName) }, [MC_TAG_APPLIED]);

    // Fall back to a Gmail receipt only when Mailchimp isn't handling it.
    if (!MC_OWNS_APPLICANT_EMAILS) sendApplicationReceived(email, clean(p.firstName));

    if (NOTIFY_EMAIL) {
      try {
        MailApp.sendEmail(
          NOTIFY_EMAIL,
          "New Founding Creator application - " + clean(p.firstName) + " " + clean(p.lastName),
          [
            "A new application has been received.",
            "",
            "Name: " + clean(p.firstName) + " " + clean(p.lastName),
            "Email: " + email,
            "Instagram: " + clean(p.instagram),
            "TikTok: " + clean(p.tiktok),
            "Followers: " + clean(p.followers),
            "",
            "Review and approve in the program sheet."
          ].join("\n")
        );
      } catch (mailErr) { /* notification is best-effort */ }
    }

    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === "dashboard") return dashboardForCode(p.code, p.email);
  if (p.action === "click") return clickRedirect(p.code, p.r);
  return json({ ok: true, service: "MAISON D'VUE Founding Creator Program" });
}

// Logs a referral click, then forwards to the shop with the ?ref= attached.
// Use this URL form as the trackable link: .../exec?action=click&code=CODE
function clickRedirect(code, referrer) {
  code = String(code || "").trim().toUpperCase();
  var dest = SHOP_BASE_URL + (code ? "?ref=" + encodeURIComponent(code) : "");
  if (code) {
    try {
      tab(CLICKS_TAB, CLICKS_HEADERS).appendRow([new Date(), code, clean(referrer, 300)]);
    } catch (err) { /* never block the redirect */ }
  }
  var safe = JSON.stringify(dest);
  return HtmlService
    .createHtmlOutput(
      '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<meta http-equiv="refresh" content="0;url=' + dest.replace(/"/g, "&quot;") + '">' +
      '<script>location.replace(' + safe + ');</script>' +
      '<p style="font-family:Georgia,serif;color:#0B1F3A;text-align:center;margin-top:40px">Taking you to MAISON D&rsquo;VUE&hellip;</p>'
    )
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// -- Dashboard read ----------------------------------------------------------
// Credentials lookup requires BOTH the creator code and the email on file - a
// light second factor so a guessed code alone can't expose someone's figures.
// Not-found and email-mismatch return the same generic message on purpose, so
// the endpoint never confirms whether a given code exists.
function dashboardForCode(code, email) {
  code = String(code || "").trim().toUpperCase();
  email = String(email || "").trim().toLowerCase();
  if (!code) return json({ ok: false, error: "No code provided." });
  if (!email) return json({ ok: false, error: "Email required." });

  var sheet = tab(APPLICATIONS_TAB, APP_HEADERS);
  var rows = sheet.getDataRange().getValues();
  var col = headerIndex(rows[0]);

  var NOT_RECOGNIZED = { ok: false, error: "Code and email do not match our records." };

  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][col["Creator Code"]]).trim().toUpperCase() === code) {
      // Verify the email on file before releasing any credentials or figures.
      var onFile = String(rows[i][col["Email"]]).trim().toLowerCase();
      if (!onFile || onFile !== email) return json(NOT_RECOGNIZED);

      var status = String(rows[i][col["Status"]]).trim();
      var rate = COMMISSION_RATES[status] != null ? COMMISSION_RATES[status] : 0.20;
      var totals = salesTotals(code);
      return json({
        ok: true,
        name: [rows[i][col["First Name"]], rows[i][col["Last Name"]]].join(" ").trim(),
        status: status,
        tier: tierFromStatus(status),
        commissionRate: Math.round(rate * 100) + "%",
        creatorCode: code,
        affiliateLink: rows[i][col["Referral Link"]] || (SHOP_BASE_URL + "?ref=" + code),
        totalSales: totals.count,
        totalRevenue: totals.revenue,
        commissionEarned: Math.round(totals.revenue * rate * 100) / 100
      });
    }
  }
  return json(NOT_RECOGNIZED);
}

// -- On-edit: mint code + link the moment Status becomes "Approved" ------------
// Installed by `setup`. Fires whenever a Status cell is edited.
function onStatusEdit(e) {
  try {
    var sh = e.range.getSheet();
    if (sh.getName() !== APPLICATIONS_TAB) return;

    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var col = headerIndex(headers);
    var statusCol = col["Status"] + 1;
    if (e.range.getColumn() !== statusCol || e.range.getRow() < 2) return;

    var row = e.range.getRow();
    var status = String(e.range.getValue()).trim();
    var codeCell = sh.getRange(row, col["Creator Code"] + 1);
    var linkCell = sh.getRange(row, col["Referral Link"] + 1);

    // Mint a code on first advancement past "Applied" if none exists yet.
    var minting = status && status !== "Applied" && !String(codeCell.getValue()).trim();
    if (minting) {
      var first = String(sh.getRange(row, col["First Name"] + 1).getValue());
      var last = String(sh.getRange(row, col["Last Name"] + 1).getValue());
      var email = String(sh.getRange(row, col["Email"] + 1).getValue());
      var code = generateCode(first, last, sh, col);
      var link = SHOP_BASE_URL + "?ref=" + code;
      codeCell.setValue(code);
      linkCell.setValue(link);

      // Approval: write the code + link into Mailchimp merge fields and tag
      // "creator-approved" -> the Journey on that tag sends the "Welcome to the
      // House" email with their affiliate details (via the CREATORCODE / AFFLINK
      // merge tags). Run `setupMailchimp` once so those merge fields exist.
      mcUpsert(email, { FNAME: first, CREATORCODE: code, AFFLINK: link }, [MC_TAG_APPROVED]);

      // Fall back to a Gmail approval email only when Mailchimp isn't handling it.
      if (!MC_OWNS_APPLICANT_EMAILS) sendApprovalEmail(email, first, code, link);
    }

    refreshTotalsRow(sh, row, col);
  } catch (err) { /* never block the edit */ }
}

// -- Code generation -----------------------------------------------------------
function generateCode(first, last, sh, col) {
  var base = String(first || "").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 8);
  if (!base) base = String(last || "").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 8);
  if (!base) base = "CREATOR";

  var existing = {};
  var codes = sh.getRange(2, col["Creator Code"] + 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
  codes.forEach(function (r) { if (r[0]) existing[String(r[0]).toUpperCase()] = true; });

  // First try a clean BASE10-style code, then add a random suffix if taken.
  var candidate = base + "10";
  if (existing[candidate]) {
    do {
      candidate = base + Math.floor(100 + Math.random() * 900);
    } while (existing[candidate]);
  }
  return candidate;
}

// -- Sales aggregation ---------------------------------------------------------
function salesTotals(code) {
  var sheet = tab(SALES_TAB, SALES_HEADERS);
  var rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return { count: 0, revenue: 0 };
  var col = headerIndex(rows[0]);
  var count = 0, revenue = 0;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][col["Creator Code"]]).trim().toUpperCase() !== code) continue;
    var status = String(rows[i][col["Status"]] || "").trim().toLowerCase();
    if (status === "refunded" || status === "cancelled" || status === "voided") continue;
    count++;
    revenue += Number(rows[i][col["Order Value"]]) || 0;
  }
  return { count: count, revenue: Math.round(revenue * 100) / 100 };
}

// Writes the cached Total Sales / Revenue / Commission back onto an application
// row so the founder sees live figures in the sheet without opening anything.
function refreshTotalsRow(sh, row, col) {
  var code = String(sh.getRange(row, col["Creator Code"] + 1).getValue()).trim().toUpperCase();
  var status = String(sh.getRange(row, col["Status"] + 1).getValue()).trim();
  var rate = COMMISSION_RATES[status] != null ? COMMISSION_RATES[status] : 0.20;
  var t = code ? salesTotals(code) : { count: 0, revenue: 0 };
  sh.getRange(row, col["Clicks"] + 1).setValue(code ? clickTotal(code) : 0);
  sh.getRange(row, col["Total Sales"] + 1).setValue(t.count);
  sh.getRange(row, col["Total Revenue"] + 1).setValue(t.revenue);
  sh.getRange(row, col["Commission Owed"] + 1).setValue(Math.round(t.revenue * rate * 100) / 100);
}

// Counts logged referral clicks for a creator code.
function clickTotal(code) {
  var sheet = tab(CLICKS_TAB, CLICKS_HEADERS);
  var rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return 0;
  var col = headerIndex(rows[0]);
  var n = 0;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][col["Creator Code"]]).trim().toUpperCase() === code) n++;
  }
  return n;
}

// Recompute every creator's totals + the admin summary. Run on a daily trigger,
// or by hand after importing sales, to keep the sheet current.
function refreshAllTotals() {
  var sh = tab(APPLICATIONS_TAB, APP_HEADERS);
  var rows = sh.getDataRange().getValues();
  var col = headerIndex(rows[0]);
  for (var i = 1; i < rows.length; i++) refreshTotalsRow(sh, i + 1, col);
  buildDashboard();
}

// -- Admin summary tab ---------------------------------------------------------
function buildDashboard() {
  var ss = book();
  var apps = tab(APPLICATIONS_TAB, APP_HEADERS).getDataRange().getValues();
  var col = headerIndex(apps[0]);

  var totalApps = apps.length - 1;
  var counts = {};
  STATUS_OPTIONS.forEach(function (s) { counts[s] = 0; });
  var productSent = 0, totalRevenue = 0, totalCommission = 0, totalClicks = 0;
  var performers = [];

  for (var i = 1; i < apps.length; i++) {
    var status = String(apps[i][col["Status"]]).trim();
    if (counts[status] != null) counts[status]++;
    if (status === "Product Sent") productSent++;
    var rev = Number(apps[i][col["Total Revenue"]]) || 0;
    var comm = Number(apps[i][col["Commission Owed"]]) || 0;
    totalRevenue += rev;
    totalCommission += comm;
    totalClicks += Number(apps[i][col["Clicks"]]) || 0;
    if (apps[i][col["Creator Code"]]) {
      performers.push({
        name: [apps[i][col["First Name"]], apps[i][col["Last Name"]]].join(" ").trim(),
        code: apps[i][col["Creator Code"]],
        revenue: rev, commission: comm
      });
    }
  }

  var approved = counts["Approved"] + counts["Active Affiliate"] +
    counts["House Ambassador"] + counts["Founder Circle"];
  performers.sort(function (a, b) { return b.revenue - a.revenue; });

  var dash = ss.getSheetByName(DASHBOARD_TAB) || ss.insertSheet(DASHBOARD_TAB);
  dash.clear();
  var out = [
    ["MAISON D'VUE - Founding Creator Program", ""],
    ["Last refreshed", new Date()],
    ["", ""],
    ["Applications", totalApps],
    ["Approvals", approved],
    ["Product shipments", productSent],
    ["Active affiliates", counts["Active Affiliate"] + counts["House Ambassador"] + counts["Founder Circle"]],
    ["Total referral clicks", totalClicks],
    ["Total revenue generated", totalRevenue],
    ["Commission owed", totalCommission],
    ["", ""],
    ["Top performing creators", ""],
    ["Creator", "Code", "Revenue", "Commission"]
  ];
  performers.slice(0, 10).forEach(function (p) {
    out.push([p.name, p.code, p.revenue, p.commission]);
  });
  dash.getRange(1, 1, out.length, 4 < out[0].length ? out[0].length : 4)
    .setValues(out.map(function (r) { while (r.length < 4) r.push(""); return r; }));
  dash.getRange("A1").setFontWeight("bold").setFontSize(14);
  // Bold the "Top performing creators" label and its column header,
  // located by content so it survives changes to the summary rows above.
  for (var r = 0; r < out.length; r++) {
    if (out[r][0] === "Top performing creators") {
      dash.getRange(r + 1, 1, 2, 4).setFontWeight("bold");
      break;
    }
  }
  dash.setColumnWidth(1, 240);
}

// -- One-time setup ------------------------------------------------------------
function setup() {
  tab(APPLICATIONS_TAB, APP_HEADERS);
  tab(SALES_TAB, SALES_HEADERS);
  tab(CLICKS_TAB, CLICKS_HEADERS);

  // Status dropdown on the Applications tab.
  var sh = tab(APPLICATIONS_TAB, APP_HEADERS);
  var col = headerIndex(sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]);
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(STATUS_OPTIONS, true).build();
  sh.getRange(2, col["Status"] + 1, 1000, 1).setDataValidation(rule);

  // Install the on-edit trigger that mints codes on approval (idempotent).
  var has = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === "onStatusEdit";
  });
  if (!has) {
    ScriptApp.newTrigger("onStatusEdit")
      .forSpreadsheet(book().getId()).onEdit().create();
  }

  buildDashboard();
}

// -- Emails --------------------------------------------------------------------
// All mail is best-effort: failures never block the sheet or the response.
function sendApplicationReceived(email, first) {
  if (!email) return;
  try {
    MailApp.sendEmail({
      to: email,
      name: SENDER_NAME,
      subject: "Application Received",
      htmlBody: emailShell(
        "Application Received",
        "<p>" + greeting(first) + "</p>" +
        "<p>Thank you for your interest in MAISON D&rsquo;VUE.</p>" +
        "<p>Applications are reviewed on a rolling basis. If approved, you will receive details regarding product allocation, affiliate access, and next steps.</p>" +
        "<p>We appreciate your interest in becoming part of the House.</p>" +
        "<p style='margin-top:28px'>Warm regards,<br>MAISON D&rsquo;VUE</p>"
      )
    });
  } catch (err) { /* best-effort */ }
}

function sendApprovalEmail(email, first, code, link) {
  if (!email) return;
  try {
    var benefits =
      "<ul style='margin:16px 0;padding-left:18px;line-height:1.9'>" +
      "<li>A complimentary bottle of VUE&nbsp;14&trade; Hair Elixir</li>" +
      "<li>A personal affiliate link</li>" +
      "<li>A unique referral code</li>" +
      "<li>20% commission on verified sales</li>" +
      "<li>Early access to future releases</li>" +
      "</ul>";
    var details =
      "<table style='margin:8px 0 4px;font-size:15px'>" +
      "<tr><td style='padding:4px 16px 4px 0;color:#5D6A7E'>Referral code</td><td style='font-weight:600'>" + code + "</td></tr>" +
      "<tr><td style='padding:4px 16px 4px 0;color:#5D6A7E'>Affiliate link</td><td><a href='" + link + "' style='color:#14305A'>" + link + "</a></td></tr>" +
      "</table>";
    MailApp.sendEmail({
      to: email,
      name: SENDER_NAME,
      subject: "Welcome to the House",
      htmlBody: emailShell(
        "Welcome to the House",
        "<p>" + greeting(first) + "</p>" +
        "<p>Thank you for applying to the MAISON D&rsquo;VUE Founding Creator Program. We are delighted to welcome you.</p>" +
        "<p>As an approved creator, you will receive:</p>" +
        benefits +
        details +
        "<p>Your full affiliate details will arrive shortly.</p>" +
        "<p style='margin-top:28px'>Warm regards,<br>MAISON D&rsquo;VUE</p>"
      )
    });
  } catch (err) { /* best-effort */ }
}

function greeting(first) {
  first = clean(first);
  return first ? ("Dear " + first + ",") : "Dear Creator,";
}

// A restrained cream/navy serif email frame, in the house register.
function emailShell(title, inner) {
  return "" +
    "<div style='background:#F4EDE1;padding:40px 0;font-family:Georgia,\"Times New Roman\",serif;color:#0B1F3A'>" +
    "<div style='max-width:560px;margin:0 auto;background:#FBF7F0;padding:48px 44px;border:1px solid rgba(11,31,58,0.12)'>" +
    "<div style='font-size:13px;letter-spacing:4px;text-transform:uppercase;color:#0B1F3A;text-align:center'>MAISON D&rsquo;VUE</div>" +
    "<h1 style='font-weight:400;font-size:26px;text-align:center;margin:24px 0 28px;color:#0B1F3A'>" + title + "</h1>" +
    "<div style='font-size:16px;line-height:1.7;color:#0B1F3A'>" + inner + "</div>" +
    "</div>" +
    "<div style='max-width:560px;margin:18px auto 0;text-align:center;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8a8170'>Hand-sealed &middot; Beverly Hills</div>" +
    "</div>";
}

// -- Mailchimp API -------------------------------------------------------------
// All calls are best-effort: a Mailchimp hiccup must never block intake,
// approval, or the sheet. The audience emails come from Journeys, not here.

function mcKey() {
  return PropertiesService.getScriptProperties().getProperty("MAILCHIMP_API_KEY") || "";
}

// Configured only once a real "<key>-<dc>" value is present in Script Properties.
function mcConfigured() { return mcKey().indexOf("-") !== -1; }

// API base for this key's datacenter (the part after the dash, e.g. "us20").
function mcBase() {
  var dc = mcKey().split("-")[1] || "us20";
  return "https://" + dc + ".api.mailchimp.com/3.0";
}

function mcAuth() {
  return "Basic " + Utilities.base64Encode("key:" + mcKey());
}

// Mailchimp's subscriber id is the MD5 of the lowercased email address.
function mcHash(email) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5, String(email).trim().toLowerCase(), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ("0" + (b & 0xff).toString(16)).slice(-2); }).join("");
}

// Add or update a member with merge fields, then apply tags. Tags drive the
// Customer Journeys, so the member upsert deliberately carries only fields the
// audience is known to have (avoids a 400 that would skip the tag).
function mcUpsert(email, mergeFields, tags) {
  if (!mcConfigured() || !email) return;
  var hash = mcHash(email);
  var members = mcBase() + "/lists/" + MC_AUDIENCE_ID + "/members/" + hash;
  try {
    UrlFetchApp.fetch(members, {
      method: "put",
      contentType: "application/json",
      headers: { Authorization: mcAuth() },
      muteHttpExceptions: true,
      payload: JSON.stringify({
        email_address: email,
        status_if_new: "subscribed",
        merge_fields: mergeFields || {}
      })
    });
  } catch (err) { /* best-effort */ }

  if (tags && tags.length) {
    try {
      UrlFetchApp.fetch(members + "/tags", {
        method: "post",
        contentType: "application/json",
        headers: { Authorization: mcAuth() },
        muteHttpExceptions: true,
        payload: JSON.stringify({
          tags: tags.map(function (t) { return { name: t, status: "active" }; })
        })
      });
    } catch (err) { /* best-effort */ }
  }
}

// One-time (idempotent): create the CREATORCODE + AFFLINK merge fields the
// approval Journey email reads. Run once after setting MAILCHIMP_API_KEY.
function setupMailchimp() {
  if (!mcConfigured()) throw new Error("Set MAILCHIMP_API_KEY in Script Properties first (Project Settings).");
  var url = mcBase() + "/lists/" + MC_AUDIENCE_ID + "/merge-fields";
  var existing = {};
  try {
    var res = UrlFetchApp.fetch(url + "?count=100&fields=merge_fields.tag", {
      headers: { Authorization: mcAuth() }, muteHttpExceptions: true
    });
    (JSON.parse(res.getContentText()).merge_fields || []).forEach(function (m) { existing[m.tag] = true; });
  } catch (err) { /* fall through and attempt creation */ }

  [
    { tag: "CREATORCODE", name: "Creator Code" },
    { tag: "AFFLINK", name: "Affiliate Link" }
  ].forEach(function (f) {
    if (existing[f.tag]) return;
    try {
      UrlFetchApp.fetch(url, {
        method: "post", contentType: "application/json",
        headers: { Authorization: mcAuth() }, muteHttpExceptions: true,
        payload: JSON.stringify({ tag: f.tag, name: f.name, type: "text", required: false, "public": false })
      });
    } catch (err) { /* best-effort */ }
  });

  // Install a daily trigger that mirrors the whole audience back into the sheet
  // (idempotent), so the Applications tab stays the complete record even for
  // contacts who join Mailchimp by some route other than the application form.
  var hasSync = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === "syncFromMailchimp";
  });
  if (!hasSync) {
    ScriptApp.newTrigger("syncFromMailchimp").timeBased().everyDays(1).atHour(6).create();
  }

  // Pull anything already in the audience in now.
  return syncFromMailchimp();
}

// Mirror every Mailchimp audience member into the Applications tab. The sheet
// stays the single complete record: applicants from the form are written here
// first (doPost), and this back-fills anyone who entered the audience another
// way. Idempotent -- existing emails are skipped, so it is safe to re-run and
// safe on a daily trigger. Best-effort and paginated. Returns rows added.
function syncFromMailchimp() {
  if (!mcConfigured()) throw new Error("Set MAILCHIMP_API_KEY in Script Properties first (Project Settings).");
  var sh = tab(APPLICATIONS_TAB, APP_HEADERS);
  var rows = sh.getDataRange().getValues();
  var col = headerIndex(rows[0]);

  var have = {};
  for (var i = 1; i < rows.length; i++) {
    var e = String(rows[i][col["Email"]]).trim().toLowerCase();
    if (e) have[e] = true;
  }

  var offset = 0, pageSize = 1000, added = 0;
  while (true) {
    var url = mcBase() + "/lists/" + MC_AUDIENCE_ID + "/members" +
      "?count=" + pageSize + "&offset=" + offset +
      "&fields=total_items,members.email_address,members.merge_fields,members.tags,members.timestamp_opt";
    var res;
    try {
      res = UrlFetchApp.fetch(url, { headers: { Authorization: mcAuth() }, muteHttpExceptions: true });
    } catch (err) { break; }
    var data = JSON.parse(res.getContentText() || "{}");
    var members = data.members || [];
    if (!members.length) break;

    members.forEach(function (m) {
      var email = String(m.email_address || "").trim().toLowerCase();
      if (!email || have[email]) return;
      have[email] = true;
      var mf = m.merge_fields || {};
      var tagNames = (m.tags || []).map(function (t) { return String(t.name).toLowerCase(); });
      var status = tagNames.indexOf(MC_TAG_APPROVED) !== -1 ? "Approved" : "Applied";
      sh.appendRow([
        m.timestamp_opt ? new Date(m.timestamp_opt) : new Date(),
        clean(mf.FNAME), clean(mf.LNAME), email,
        clean(mf.IG), clean(mf.TIKTOK), clean(mf.FOLLOWERS), clean(mf.SHIPADDR, 500),
        clean(mf.NOTE, 1000), status,
        clean(mf.CREATORCODE), clean(mf.AFFLINK),
        0, 0, 0, 0, "mailchimp-sync"
      ]);
      added++;
    });

    offset += members.length;
    if (offset >= (data.total_items || offset)) break;
  }
  return added;
}

// -- Helpers -------------------------------------------------------------------
// The program's spreadsheet: the bound sheet by default, or one named by
// SHEET_ID when running standalone. Lets the same script work either way.
function book() {
  return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function tab(name, headers) {
  var ss = book();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sh.setFrozenRows(1);
  } else if (sh.getLastRow() === 0) {
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}

function headerIndex(headerRow) {
  var idx = {};
  headerRow.forEach(function (h, i) { idx[String(h).trim()] = i; });
  return idx;
}

function tierFromStatus(status) {
  if (status === "House Ambassador") return "House Ambassador";
  if (status === "Founder Circle") return "Founder Circle";
  return "Founding Creator";
}

function clean(v, max) {
  var s = (typeof v === "string" ? v : String(v == null ? "" : v)).trim();
  return s.slice(0, max || 200);
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
