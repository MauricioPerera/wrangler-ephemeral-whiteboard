# 🎨 Ephemeral Whiteboard

🌐 [Español](./README.md) · **English** · [Português](./README.pt.md)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/MauricioPerera/wrangler-ephemeral-whiteboard)

🌐 **[Landing page](https://mauricioperera.github.io/wrangler-ephemeral-whiteboard/)** — visual presentation of the project, available in español / English / português.

A real-time collaborative whiteboard that deploys in seconds on a **Cloudflare temporary account**, no login required, and **self-destructs** when that account expires (~1 hour).

Sibling of [wrangler-ephemeral-chat](https://github.com/MauricioPerera/wrangler-ephemeral-chat) — same pattern (Durable Objects + `wrangler deploy --temporary`), but for drawing instead of chatting.

## How it works

- `wrangler deploy --temporary` creates a temporary Cloudflare account (no login), deploys the Worker, and gives you a public URL on `workers.dev`.
- That account — and everything in it: the Worker, the whiteboard, the strokes — lives for **~60 minutes**. If nobody claims it, Cloudflare deletes it automatically.
- The whiteboard runs on a single Durable Object with SQLite state: strokes, room config, and invites.

## Requirements

- Node.js
- Wrangler **4.102.0 or later**
- **Not logged in** to Wrangler (`wrangler logout` if you already have a session) — `--temporary` only works without existing credentials

## Deploy

```bash
git clone https://github.com/MauricioPerera/wrangler-ephemeral-whiteboard.git
cd wrangler-ephemeral-whiteboard
npm install
npx wrangler deploy --temporary
```

The output gives you the whiteboard URL and a **claim URL**. Share the URL with whoever you want to invite. If you want to keep the Worker permanently, open the claim URL and complete the Cloudflare login before the hour is up.

### Permanent deploy (optional)

If you'd rather it didn't expire, run `wrangler login` and `npx wrangler deploy` instead of `--temporary`. You can also use the **Deploy to Cloudflare** button above.

## Features

- **Real-time drawing** via WebSockets (Durable Objects hibernation API), with incremental streaming as you draw
- **Persistent history**: the last 300 strokes are stored in the Durable Object's own SQLite — late joiners see everything drawn
- **Adjustable color palette and stroke width**
- **Export PNG / JSON**: download the drawing as an image, or as JSON to re-import into a future instance and keep going
- **Open / closed mode**: anyone with the link (open) vs. invitees only (closed)
- **Admin**: whoever connects first with `?admin=1` becomes admin; can toggle the mode, generate invites, and **wipe the whole board**
- **Single-use invites**
- **Countdown banner**
- **Mobile-friendly UI**: full-screen on phones, touch drawing (pointer events)

## Usage

1. Open the deploy URL → login screen, enter a name.
2. To become admin: add `?admin=1` to the URL the first time you enter. Save the link with your admin token.
3. Pick a color and width, and draw — it syncs live with everyone connected.
4. From the admin panel: toggle between open/closed whiteboard, generate invites, or wipe everything with "wipe board".

## Structure

```
src/index.js       — Worker + Durable Object (Board) + embedded UI
wrangler.jsonc      — Worker config and Durable Object binding
```

## Limitations (inherited from Cloudflare temporary accounts)

- Durable Objects, KV, D1, Hyperdrive, Queues, and mTLS certificates are supported on temporary accounts — **R2 and Vectorize are not**.
- The 60-minute timer is fixed from account creation, it does not extend with activity.

More info: [Claim deployments · Cloudflare Workers docs](https://developers.cloudflare.com/workers/platform/claim-deployments/)

## Are you an AI agent?

See [AGENTS.md](./AGENTS.md) for autonomous deployment instructions with `wrangler --temporary`.
