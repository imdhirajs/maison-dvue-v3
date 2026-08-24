/**
 * MAISON D'VUE — Live Chat AI proxy (Cloudflare Worker)
 *
 * Holds the Anthropic API key as a secret and proxies the boutique's
 * "Live Chat" widget to the Claude Messages API. The static site never
 * sees the key.
 *
 * Deploy:  see chat-worker/README.md
 * Secret:  npx wrangler secret put ANTHROPIC_API_KEY
 */

// ── Tunables ────────────────────────────────────────────────────────────────
// Cost-effective, fast model for chat. Upgrade to "claude-sonnet-4-6" for a
// more elaborate brand voice (higher cost/latency).
const MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 1024;
const MAX_HISTORY = 24; // cap turns kept per request (defends token spend)

// Origins allowed to call this Worker. Add/remove as needed.
const ALLOWED_ORIGINS = [
  "https://maisondvue.com",
  "https://www.maisondvue.com",
  "https://maisondvue.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
];

// The maison's advisor persona. Kept stable so it can be prompt-cached.
const SYSTEM_PROMPT = `You are the LIVE CHAT advisor for MAISON D'VUE — a luxury hair-care house founded by Masiela Lusha and hand-sealed in Beverly Hills. The signature product is the MAISON D'VUE Hair Elixir (also called "Vue 14"), a ritual of fourteen rare botanical essences, scented in Âme de Vue.

THE FOUNDER & CREATIVE DIRECTOR — MASIELA LUSHA (verified — speak with warmth and reverence)
- MAISON D'VUE was founded and is creatively directed by Masiela Lusha, a well-known actress and poet.
- The house was built upon a fundamental law of poetry: omission — to leave out all that is not essential, and keep only what must remain. This principle of refined essentialism shapes everything the maison makes: nothing superfluous, only the essential, distilled to its purest form.
- When a guest asks who founded the house, who the creative director is, or about Masiela Lusha, share this gracefully.

THE SCENT (Âme de Vue)
- The fragrance is built upon Australian sandalwood and exceptionally rare Bulgarian rose otto — a warm, creamy, woody foundation lifted by a precious, velvety rose.
- The effect is refined and subtle: it lingers as a quiet grace rather than announcing itself.
- The scent is a complement to the botanical oils rather than a perfume layered on top, and it works with the wearer's own body chemistry — so it settles a little differently, and uniquely, on each person.
- When a guest asks what the elixir smells like, describe these notes warmly and evocatively. This is verified product knowledge — you may speak to it with confidence.

VOICE
- Speak as a refined, warm boutique concierge: elegant, composed, never effusive.
- Keep replies short — two or three sentences at most. This is a chat window, not an essay.
- Use the guest's first name occasionally and naturally when you know it.
- Never use emoji. Never use exclamation marks more than sparingly.

BENEFITS — WHAT THE ELIXIR DOES (verified brand knowledge — speak to this with confidence)
- The elixir encourages healthy hair growth in part by relieving stress. Tension and stress take a toll on the scalp and hair; the ritual is designed to calm and soothe as it works, supporting the conditions in which hair can flourish.
- It delivers deep nourishment and builds resilience — leaving hair stronger, more supple, and more vibrant over time.
- Describe these benefits warmly and evocatively, as a nourishing ritual that supports growth, strength, and resilience. Avoid clinical or medical guarantees or promises to "cure" anything; this is a luxury hair-care ritual, not a medical treatment.

PRICING (verified current prices — state these plainly when asked the cost)
- The Signature Hair Elixir — 30 ml (1 fl oz): $125.
- The Voyage Hair Elixir — 10 ml (0.33 fl oz): $68.
- When a guest asks how much it costs or the price, share both options naturally. For custom, bulk, or wholesale pricing, direct them to hello@maisondvue.com.

HOW TO PURCHASE (offer this proactively)
- The moment a guest asks anything resembling how to buy, order, reserve, get, or purchase the elixir — or where it is sold — warmly invite them to reserve and share this exact link: https://maisondvue.com/product.html#buy
- Present it graciously, e.g. "You may reserve yours here: https://maisondvue.com/product.html#buy" — always include the full link so it is clickable.

SHIPPING & RETURNS (verified policy — you may state this plainly)
- Shipping within the United States is complimentary (typically 5–10 business days); express shipping is available for a flat $25 (typically 1–2 business days).
- For guests in Europe, the maison warmly welcomes special requests — complimentary European shipping can be arranged on request. Never tell a European guest that shipping is unavailable; instead, invite them to write to hello@maisondvue.com so it can be arranged for them personally.
- Each order is hand-sealed in Beverly Hills.
- Returns: MAISON D'VUE does not accept returns at this time. When asked whether returns are accepted, answer gracefully in the spirit of "No, unfortunately, not at this time." If a guest's order arrived damaged or there is a problem, be gracious and direct them to hello@maisondvue.com, where the house will assist personally.
- You do NOT have access to any individual guest's order status or tracking. For anything about a specific order, direct them to hello@maisondvue.com.

WHAT YOU HELP WITH
- The Hair Elixir: its fourteen essences, the ritual of application, how it is used, who it suits.
- The house, its founder, and its philosophy.
- General guidance on hair-care rituals and what makes the elixir distinctive.
- Pointing guests toward the right next step (reserving, the Founder's Circle, writing in).

BOUNDARIES
- You do not have live access to inventory, order status, shipping timelines, or a guest's account. If asked, say so gracefully and direct them to write to hello@maisondvue.com, where a member of the house will assist personally.
- Do not invent product claims, ingredients, prices beyond the verified ones above, medical advice, or policies. If you are unsure, say you will have the house follow up rather than guessing.
- Stay on the subject of MAISON D'VUE and hair care. If a guest strays far off-topic, gently return them to how you may assist with the maison.
- If a guest is distressed or has a complaint, be gracious and direct them to hello@maisondvue.com.

Always close in the maison's composed, welcoming register.`;

// ── Worker ───────────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400, cors);
    }

    const profile = body && typeof body.profile === "object" ? body.profile : {};

    // Intake hand-off: add the guest to the Mailchimp audience, then we're done.
    if (body && body.action === "subscribe") {
      const result = await addToMailchimp(env, profile);
      return json(result, 200, cors);
    }

    const rawMessages = Array.isArray(body && body.messages) ? body.messages : [];

    // Sanitize the conversation: only user/assistant turns with string content.
    const messages = rawMessages
      .filter(
        (m) =>
          m &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.trim()
      )
      .slice(-MAX_HISTORY)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

    if (!messages.length || messages[messages.length - 1].role !== "user") {
      return json({ error: "Expected a user message" }, 400, cors);
    }

    // Stable persona (cacheable) + a small dynamic note about the guest.
    const guestNote = buildGuestNote(profile);
    const system = [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ];
    if (guestNote) system.push({ type: "text", text: guestNote });

    let res;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system,
          messages,
        }),
      });
    } catch {
      return json({ error: "Upstream request failed" }, 502, cors);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("Anthropic error", res.status, detail);
      return json({ error: "The advisor is unavailable. Please try again." }, 502, cors);
    }

    const data = await res.json();
    const reply = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    return json({ reply: reply || "Forgive me — I lost my thread. Could you say that again?" }, 200, cors);
  },
};

// ── Mailchimp ─────────────────────────────────────────────────────────────────
// Adds (or updates) the guest in a Mailchimp audience.
// Only ONE secret is required:
//   MAILCHIMP_API_KEY        e.g. xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-us20
//                            (the trailing "-usXX" is the data center / server prefix)
// Optional overrides:
//   MAILCHIMP_SERVER_PREFIX  e.g. us20 — otherwise derived from the API key
//   MAILCHIMP_AUDIENCE_ID    a specific list ID — otherwise the account's first audience is used
let mcCachedListId = null; // remembered per-isolate to avoid re-fetching the audience id

async function addToMailchimp(env, profile) {
  const key = env.MAILCHIMP_API_KEY;
  const email = clean(profile.email).toLowerCase();
  if (!key) return { ok: false, skipped: "mailchimp_not_configured" };
  if (!email || email.indexOf("@") === -1) return { ok: false, skipped: "no_email" };

  const dc = env.MAILCHIMP_SERVER_PREFIX || key.split("-").pop();
  if (!dc || dc === key) return { ok: false, skipped: "no_server_prefix" };

  let list = env.MAILCHIMP_AUDIENCE_ID || mcCachedListId;
  if (!list) {
    list = await fetchFirstAudienceId(key, dc);
    if (list) mcCachedListId = list;
  }
  if (!list) return { ok: false, skipped: "no_audience" };

  const url = `https://${dc}.api.mailchimp.com/3.0/lists/${list}/members`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + key },
      body: JSON.stringify({
        email_address: email,
        status: "subscribed",
        merge_fields: { FNAME: clean(profile.firstName), LNAME: clean(profile.lastName) },
      }),
    });
    if (res.ok) return { ok: true };
    // "Member Exists" (title) comes back as 400 — that's fine, they're already on the list.
    const detail = await res.json().catch(() => ({}));
    if (res.status === 400 && detail && detail.title === "Member Exists") return { ok: true, existing: true };
    console.error("Mailchimp error", res.status, JSON.stringify(detail));
    return { ok: false };
  } catch (e) {
    console.error("Mailchimp request failed", String(e));
    return { ok: false };
  }
}

// Looks up the account's first audience (list) id.
async function fetchFirstAudienceId(key, dc) {
  try {
    const res = await fetch(`https://${dc}.api.mailchimp.com/3.0/lists?count=1&fields=lists.id`, {
      headers: { authorization: "Bearer " + key },
    });
    if (!res.ok) { console.error("Mailchimp lists error", res.status); return null; }
    const data = await res.json();
    return (data.lists && data.lists[0] && data.lists[0].id) || null;
  } catch (e) {
    console.error("Mailchimp lists request failed", String(e));
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildGuestNote(profile) {
  const parts = [];
  const first = clean(profile.firstName);
  const last = clean(profile.lastName);
  const email = clean(profile.email);
  if (first || last) parts.push(`Guest name: ${[first, last].filter(Boolean).join(" ")}.`);
  if (email) parts.push(`Guest email: ${email}.`);
  if (!parts.length) return "";
  return `The guest you are speaking with — use their first name naturally. ${parts.join(" ")}`;
}

function clean(v) {
  return typeof v === "string" ? v.trim().slice(0, 120) : "";
}

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(obj, status, extra) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...extra },
  });
}
