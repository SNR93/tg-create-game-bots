# TG Game Bot Constructor

A browser-based visual node editor for building interactive narrative Telegram bots — branching stories, quests, games — without writing a single line of code.

![Node editor interface](.github/preview.png)

---

## What it is and why

Most Telegram bot builders are designed for simple Q&A flows or lead funnels. This tool is built for **narrative-driven experiences**: branching storylines, character relationships, inventory systems, achievements, and Telegram Stars monetization.

You draw a graph. The bot plays it.

The editor runs in the browser. The runtime executes scenarios directly inside Telegram. Everything is self-hosted — your data, your server, your rules.

---

## Highlights

### Visual node graph
Drag, connect, and configure nodes on an infinite canvas powered by React Flow. No YAML, no JSON, no code.

### Rich node library (20+ types)
| Category | Nodes |
|---|---|
| Entry points | Global menu (/start), Settings (/settings), Custom commands, Invoke command, Continue story |
| Messages | Single message, Message chain, Media gallery |
| Logic | Variable branching, Text condition, Formula, Random |
| Progression | Variables, Inventory, Relations, Achievements, Checkpoint |
| Monetization | Telegram Stars purchase, Promocodes |
| Structure | Subscenario, Return, Comment, Group |

### Built-in simulator
Test the full bot scenario directly in the browser — with a fake Telegram chat UI, variable panel, debug log, and countdown timers for delay nodes. No real bot needed to test.

### Player admin panel
Live view and edit of every player's variables, inventory, relations, and achievements. Search, reset, or delete players. View choice logs and analytics.

### Version control & backups
Snapshot the scenario at any point, publish with gradual rollout (e.g. 10% of players get v2), and restore from backup instantly.

### Analytics
Conversion funnel, node visit heatmap, and player choice breakdown — all from the admin panel.

### Telegram Stars monetization
Create products in the admin panel, place a Purchase node anywhere in the story. Payment is handled entirely by Telegram — no payment provider setup needed.

### Redis-backed sessions
Player sessions survive backend restarts. State is persisted to Redis and reloaded transparently.

### Rate-limited Telegram API
Built-in token-bucket rate limiter (25 req/s) prevents hitting Telegram's API limits during broadcasts or high-traffic moments.

### Nginx media delivery
Uploaded media files (photos, videos, voice) are served directly by nginx — not through Node.js — with 30-day cache headers.

### Self-hosted, Docker-first
One `docker compose up` command. No external services, no cloud lock-in.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, @xyflow/react |
| Backend | Node.js, Express |
| Database | PostgreSQL 16 |
| Sessions | Redis 7 |
| Web server | nginx (Alpine) |
| Infrastructure | Docker Compose |

---

## Quick start

### Requirements
- Docker and Docker Compose installed
- Ports 4000 and 4001 available on your machine

### 1. Clone

```bash
git clone https://github.com/SNR93/tg-create-game-bots.git
cd tg-create-game-bots
```

### 2. Start

```bash
docker compose up -d --build
```

This starts four containers: PostgreSQL, Redis, backend API, and nginx frontend.

### 3. Open

```
http://localhost:4000
```

### 4. Create a bot

1. Click **+ Новый бот**
2. Build your scenario in the node editor
3. Press **Ctrl+S** to save

### 5. Connect to Telegram

1. Get a token from [@BotFather](https://t.me/BotFather) via `/newbot`
2. Open **Telegram** panel in the editor toolbar
3. Paste the token and click **Запустить**

The bot starts polling immediately. Send `/start` in Telegram to test it.

---

## Public webhook mode (optional)

For production deployments with a public domain, set `PUBLIC_BASE_URL` before starting:

```bash
PUBLIC_BASE_URL=https://yourdomain.com docker compose up -d
```

The backend will register a Telegram webhook instead of polling.

---

## Project structure

```
.
├── backend/
│   ├── index.js           # Express API
│   ├── telegramRuntime.js # Bot execution engine
│   ├── telegramApi.js     # Telegram HTTP + rate limiter
│   ├── graphUtils.js      # Graph traversal utilities
│   ├── sessionStore.js    # Redis session storage
│   ├── playerStore.js     # Player data (PostgreSQL)
│   ├── adminStore.js      # Versions, backups, analytics
│   ├── jobQueue.js        # Scheduled jobs (broadcasts, delays)
│   ├── telegramLimits.js  # Validation rules
│   └── database.js        # Schema initialization
├── frontend/
│   ├── src/
│   │   ├── pages/         # Editor and bot list pages
│   │   ├── components/
│   │   │   ├── nodes/     # Node visual components
│   │   │   ├── inspector/ # Node settings panels
│   │   │   ├── panels/    # Admin, history, node catalog
│   │   │   └── simulator/ # In-browser bot simulator
│   │   └── api.js         # Backend API client
│   └── nginx.conf
└── docker-compose.yml
```

---

## Configuration

All configuration is done via environment variables in `docker-compose.yml`:

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://tgbot:tgbot@postgres:5432/tgbot` | PostgreSQL connection |
| `REDIS_URL` | `redis://redis:6379` | Redis connection |
| `PUBLIC_BASE_URL` | _(empty)_ | Public HTTPS URL for webhook mode |

---

## License

MIT
