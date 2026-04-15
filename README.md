# Patta x Nike — International Soccer Tournament Game

A web-based soccer ball keepie-uppie game built for a Patta x Nike brand activation campaign. Players tap to keep a ball in the air, submit their scores to a leaderboard, and sign up for the newsletter.

## Tech Stack

- **Frontend:** Vanilla JavaScript, HTML5 Canvas, CSS3
- **Hosting:** Vercel (static files + serverless functions)
- **Database:** Upstash Redis (via `@upstash/redis`)
- **Bot Protection:** Cloudflare Turnstile (invisible mode)
- **Newsletter:** Klaviyo API v3

## Architecture

```
/
├── index.html              Static game page
├── app.js                  Game engine + UI logic
├── style.css               All styling
├── assets/                 Images, fonts, backgrounds
├── api/
│   ├── start-session.js    POST — creates game session in Redis
│   ├── submit-score.js     POST — validates + stores score, triggers Klaviyo
│   └── leaderboard.js      GET  — returns top 10 (edge-cached 30s)
├── lib/
│   ├── redis.js            Shared Redis client
│   └── leaderboard.js      Shared leaderboard query helper
└── vercel.json             Vercel config + caching headers
```

## Game Flow

1. Player loads the page → loading animation → main menu
2. Player clicks **Play Game** → `POST /api/start-session` creates a server-side session
3. Player plays the game (tap/space to kick the ball inside the hit zone)
4. Game over → player clicks **Submit Score**
5. Score submission form: username + email → `POST /api/submit-score`
6. Server validates, stores score, subscribes to Klaviyo, returns leaderboard
7. Leaderboard screen shows top 10 + player's position

## Score Submission Pipeline

When a score is submitted, the server runs these checks in order:

1. **Cloudflare Turnstile** — verifies the request comes from a real browser (invisible challenge, includes `remoteip` binding)
2. **Input validation** — name (max 16 chars, alphanumeric, no URLs), email format, score (positive integer, max 500)
3. **Session validation** — atomic `GETDEL` retrieves and deletes the session in one operation (prevents race conditions). Checks:
   - Session exists and hasn't expired (10-minute TTL)
   - Minimum 5 seconds elapsed (can't submit instantly)
   - Score is plausible for elapsed time (`score <= elapsed_seconds * 1.5`)
4. **Rate limiting** — per-email (10/hour) + per-IP (100/hour), using Redis `INCR` + `EXPIRE` in a pipeline
5. **Score storage** — `ZADD` with `GT` flag (only updates if new score is higher)
6. **Klaviyo subscription** — fire-and-forget (doesn't block the response)
7. **Response** — returns fresh top 10 + user's rank

## Anti-Bot / Security Measures

| Layer | What it does | Prevents |
|-------|-------------|----------|
| Cloudflare Turnstile (invisible) | Browser challenge with IP binding | Automated scripts, headless browsers |
| Game session tokens | Server-side session created on game start, consumed atomically on submit | Direct API calls without playing |
| Score plausibility check | Rejects scores faster than 1.5 points/second of play time | Console `score = 999` manipulation |
| Max score cap (500) | Hard upper bound on submitted scores | Absurdly high fake scores |
| Per-email rate limit (10/hr) | Limits submissions per player | Spam from a single account |
| Per-IP rate limit (100/hr) | Limits submissions per network | Script flooding from one machine |
| Session endpoint rate limit (200/hr per IP) | Limits session creation | Redis flooding attacks |
| Input validation | Alphanumeric names, no URLs, email format | XSS, injection, spam links |
| HTML escaping | `escapeHtml()` on all leaderboard names | XSS via leaderboard display |
| Edge caching (30s) | Leaderboard GET cached at Vercel edge | DDoS on read endpoint |

## Difficulty Curve

The game has progressive difficulty with 4 levels:

- **Training Field (0-29):** Large hit zone (400px), gentle bobbing
- **Local Stadium (30-69):** Zone shrinking, noticeable movement
- **Big Stadium (70-119):** Small zone, fast bobbing
- **World Cup (120+):** Elite — zone at minimum, max bob speed

The hit zone never stops shrinking (0.15px per point past score 100), so there's no plateau. Bob speed also increases continuously after score 60. This ensures unique leaderboard positions — no score clustering.

## Environment Variables

```
leaderboard_KV_REST_API_URL    Upstash Redis URL (auto-set by Vercel KV)
leaderboard_KV_REST_API_TOKEN  Upstash Redis token (auto-set by Vercel KV)
TURNSTILE_SECRET_KEY           Cloudflare Turnstile secret key
KLAVIYO_API_KEY                Klaviyo private API key
KLAVIYO_LIST_ID                Klaviyo list ID for newsletter
```

The Turnstile **site key** (public) is in `app.js`.

## Local Development

```bash
npm install
npx vercel link
npx vercel env pull .env.development.local
npx vercel dev
```

## Redis Schema

| Key | Type | TTL | Purpose |
|-----|------|-----|---------|
| `leaderboard` | Sorted Set | — | Scores (member = email, score = points) |
| `player:{email}` | Hash | — | Player data (name, email, score) |
| `session:{uuid}` | String (JSON) | 10 min | Game session (startTime) |
| `ratelimit:email:{email}` | String (counter) | 1 hour | Per-email rate limit |
| `ratelimit:ip:{ip}` | String (counter) | 1 hour | Per-IP rate limit |
| `ratelimit:session:{ip}` | String (counter) | 1 hour | Session creation rate limit |
