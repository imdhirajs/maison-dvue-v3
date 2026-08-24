# MAISON D'VUE — Live Chat AI backend

The Live Chat widget on the site (`assets/chat.js`) talks to this small
Cloudflare Worker. The Worker holds your **Anthropic API key** as an encrypted
secret and forwards conversations to Claude. The key never touches the public
website, so no one can steal it from the page source.

```
Visitor ──> assets/chat.js (browser) ──HTTPS──> Cloudflare Worker ──> Claude API
                                                  (holds the secret key)
```

## What you need (one time)

1. A **Cloudflare account** — free tier is fine (https://dash.cloudflare.com/sign-up).
2. An **Anthropic API key** — from https://console.anthropic.com → *API Keys*.
   (This is a paid API; chat usage with the default `claude-haiku-4-5` model is
   inexpensive — roughly a fraction of a cent per conversation.)
3. **Node.js** installed on your computer (https://nodejs.org).

## Deploy in 5 steps

From a terminal, inside the `chat-worker/` folder:

```bash
cd chat-worker

# 1. Log in to Cloudflare (opens your browser once)
npx wrangler login

# 2. Store your Anthropic key as an encrypted secret (paste the key when prompted)
npx wrangler secret put ANTHROPIC_API_KEY

# 3. Publish the Worker
npx wrangler deploy
```

After step 3, Wrangler prints your Worker URL, e.g.:

```
https://maisondvue-chat.YOUR-SUBDOMAIN.workers.dev
```

```bash
# 4. Copy that URL.
```

5. Open **`assets/chat.js`** and paste the URL into the `CHAT_ENDPOINT` line near
   the top:

   ```js
   var CHAT_ENDPOINT = "https://maisondvue-chat.YOUR-SUBDOMAIN.workers.dev";
   ```

   Commit and push that change. The live chat is now connected.

> Until `CHAT_ENDPOINT` is set, the widget still works visually but politely
> tells guests to email `hello@maisondvue.com` instead of giving AI answers.

## Settings you can change

All in **`chat-worker/worker.js`**:

| Setting | Default | Notes |
|---|---|---|
| `MODEL` | `claude-haiku-4-5` | Fast and cost-effective. Change to `claude-sonnet-4-6` for a richer, more elaborate brand voice (higher cost & slightly slower). |
| `MAX_TOKENS` | `1024` | Maximum length of each reply. |
| `MAX_HISTORY` | `24` | How many past turns are sent per request (caps cost). |
| `ALLOWED_ORIGINS` | maisondvue.com etc. | Domains permitted to use the chatbot. Add any new domains here. |
| `SYSTEM_PROMPT` | — | The advisor's personality, knowledge, and rules. Edit freely to change how it speaks and what it knows. |

After editing, re-run `npx wrangler deploy`.

## Testing locally

```bash
npx wrangler dev        # runs the Worker at http://localhost:8787
```

`localhost` origins are already in `ALLOWED_ORIGINS`, so you can point
`CHAT_ENDPOINT` at the local URL while testing.

## Cost & safety notes

- The Worker only accepts requests from the domains in `ALLOWED_ORIGINS` (CORS).
- `MAX_HISTORY` and `MAX_TOKENS` bound how much each conversation can cost.
- The system prompt instructs the AI **not** to quote prices, order status, or
  policies it can't verify — it directs those guests to `hello@maisondvue.com`.
- For higher-volume abuse protection, you can later add Cloudflare rate limiting
  in the dashboard (Security → WAF → Rate limiting rules).
