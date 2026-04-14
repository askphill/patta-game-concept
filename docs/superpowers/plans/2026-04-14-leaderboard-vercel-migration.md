# Leaderboard & Vercel Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Patta game from Cloudflare to Vercel and add a leaderboard with score submission, Klaviyo newsletter integration, and bot protection.

**Architecture:** Vercel serves existing static files + three serverless API endpoints. Redis (Vercel KV) stores leaderboard scores, player data, sessions, and rate limits. Cloudflare Turnstile provides invisible bot protection. Klaviyo receives email signups via fire-and-forget API calls.

**Tech Stack:** Vanilla JS (no framework), Vercel Serverless Functions (Node.js), @vercel/kv (Redis), Cloudflare Turnstile, Klaviyo v3 API

**Spec:** `docs/superpowers/specs/2026-04-14-leaderboard-vercel-migration-design.md`

---

### Task 1: Project Scaffolding

**Files:**
- Create: `.gitignore`
- Create: `package.json`
- Create: `vercel.json`

- [ ] **Step 1: Create .gitignore**

```
node_modules/
.vercel/
.env*.local
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "patta-game-concept",
  "private": true,
  "dependencies": {
    "@vercel/kv": "^2.0.0"
  }
}
```

- [ ] **Step 3: Create vercel.json**

```json
{
  "framework": null,
  "headers": [
    {
      "source": "/api/leaderboard",
      "headers": [
        { "key": "Cache-Control", "value": "s-maxage=30, stale-while-revalidate=60" }
      ]
    }
  ]
}
```

Setting `framework: null` tells Vercel to treat this as a static site (no build step). The Cache-Control header on the leaderboard endpoint enables Vercel's edge cache for 30 seconds.

- [ ] **Step 4: Install dependencies**

Run: `npm install`

- [ ] **Step 5: Verify the static site works locally**

Run: `npx vercel dev`

Open `http://localhost:3000` in a browser. The existing game should load and work exactly as before (loading animation, menu, gameplay). Close the dev server.

- [ ] **Step 6: Commit**

```bash
git add .gitignore package.json package-lock.json vercel.json
git commit -m "chore: add Vercel project scaffolding with @vercel/kv"
```

---

### Task 2: Start Session API

**Files:**
- Create: `api/start-session.js`

- [ ] **Step 1: Create the start-session endpoint**

Create `api/start-session.js`:

```javascript
import { kv } from '@vercel/kv';
import { randomUUID } from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sessionId = randomUUID();

  await kv.set(`session:${sessionId}`, {
    startTime: Date.now(),
    used: false,
  }, { ex: 600 }); // 10-minute TTL

  return res.status(200).json({ sessionId });
}
```

- [ ] **Step 2: Test with curl**

Start the dev server: `npx vercel dev`

In another terminal, run:

```bash
curl -s -X POST http://localhost:3000/api/start-session | jq .
```

Expected output (UUID will vary):
```json
{
  "sessionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

Verify a GET request is rejected:
```bash
curl -s http://localhost:3000/api/start-session | jq .
```

Expected:
```json
{
  "error": "Method not allowed"
}
```

Note: This requires KV environment variables to be configured. If running locally without them, the endpoint will error — that's expected. The curl test confirms the routing and handler structure are correct. Full integration testing happens after Vercel KV is linked.

- [ ] **Step 3: Commit**

```bash
git add api/start-session.js
git commit -m "feat: add start-session API endpoint"
```

---

### Task 3: Leaderboard API

**Files:**
- Create: `lib/leaderboard.js`
- Create: `api/leaderboard.js`

- [ ] **Step 1: Create shared leaderboard helper**

Create `lib/leaderboard.js`:

```javascript
import { kv } from '@vercel/kv';

/**
 * Fetches the top N entries from the leaderboard sorted set.
 * Returns an array of { rank, name, score } objects.
 */
export async function getTopTen(count = 10) {
  // Get top emails from the sorted set (highest scores first)
  const emails = await kv.zrange('leaderboard', 0, count - 1, { rev: true });

  if (!emails || emails.length === 0) {
    return [];
  }

  // Fetch scores and player names in a pipeline
  const pipeline = kv.pipeline();
  for (const email of emails) {
    pipeline.zscore('leaderboard', email);
    pipeline.hget(`player:${email}`, 'name');
  }
  const results = await pipeline.exec();

  const entries = [];
  for (let i = 0; i < emails.length; i++) {
    const score = results[i * 2];
    const name = results[i * 2 + 1];
    entries.push({
      rank: i + 1,
      name: name || 'Anonymous',
      score: Number(score),
    });
  }

  return entries;
}
```

- [ ] **Step 2: Create the leaderboard endpoint**

Create `api/leaderboard.js`:

```javascript
import { getTopTen } from '../lib/leaderboard.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const topTen = await getTopTen();

  return res.status(200).json({ topTen });
}
```

The `Cache-Control: s-maxage=30` header is set in `vercel.json` for this route, so Vercel's edge caches the response for 30 seconds automatically.

- [ ] **Step 3: Test with curl**

With dev server running:

```bash
curl -s http://localhost:3000/api/leaderboard | jq .
```

Expected (empty leaderboard):
```json
{
  "topTen": []
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/leaderboard.js api/leaderboard.js
git commit -m "feat: add leaderboard GET API endpoint with shared helper"
```

---

### Task 4: Submit Score API

**Files:**
- Create: `api/submit-score.js`

- [ ] **Step 1: Create the submit-score endpoint**

Create `api/submit-score.js`:

```javascript
import { kv } from '@vercel/kv';
import { getTopTen } from '../lib/leaderboard.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, score, sessionId, turnstileToken } = req.body;

  // 1. Validate session
  const sessionError = await validateSession(sessionId);
  if (sessionError) {
    return res.status(403).json({ error: sessionError });
  }

  // 2. Verify Turnstile token
  const turnstileError = await verifyTurnstile(turnstileToken);
  if (turnstileError) {
    return res.status(403).json({ error: turnstileError });
  }

  // 3. Validate inputs
  const inputError = validateInputs(name, email, score);
  if (inputError) {
    return res.status(400).json({ error: inputError });
  }

  const emailLower = email.toLowerCase().trim();

  // 4. Rate limit (10 per email per hour)
  const rateLimitError = await checkRateLimit(emailLower);
  if (rateLimitError) {
    return res.status(429).json({ error: rateLimitError });
  }

  // 5. Write score (GT = only update if new score is higher)
  await kv.zadd('leaderboard', { gt: true }, { score, member: emailLower });

  // 6. Store/update player data
  await kv.hset(`player:${emailLower}`, { name: name.trim(), email: emailLower, score });

  // 7. Fire-and-forget Klaviyo call
  subscribeToKlaviyo(emailLower, name.trim(), score).catch(() => {});

  // 8. Get fresh leaderboard + user rank
  const [topTen, userRank] = await Promise.all([
    getTopTen(),
    kv.zrevrank('leaderboard', emailLower),
  ]);

  const rank = userRank !== null ? userRank + 1 : null;

  // 9. Return response
  return res.status(200).json({
    rank,
    topTen,
    userEntry: { rank, name: name.trim(), score },
  });
}

async function validateSession(sessionId) {
  if (!sessionId) return 'Missing session ID';

  const session = await kv.get(`session:${sessionId}`);
  if (!session) return 'Invalid or expired session';
  if (session.used) return 'Session already used';
  if (Date.now() - session.startTime < 5000) return 'Score submitted too quickly';

  // Mark session as used
  await kv.set(`session:${sessionId}`, { ...session, used: true }, { ex: 600 });
  return null;
}

async function verifyTurnstile(token) {
  if (!token) return 'Missing Turnstile token';

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret: process.env.TURNSTILE_SECRET_KEY,
      response: token,
    }),
  });
  const data = await res.json();

  if (!data.success) return 'Bot verification failed';
  return null;
}

function validateInputs(name, email, score) {
  if (!name || typeof name !== 'string') return 'Name is required';
  if (name.trim().length === 0 || name.trim().length > 16) return 'Name must be 1-16 characters';
  if (!/^[a-zA-Z0-9_ -]+$/.test(name.trim())) return 'Name contains invalid characters';
  if (/https?:|www\.|\.com|\.net|\.org|\.io/i.test(name)) return 'URLs not allowed in name';

  if (!email || typeof email !== 'string') return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Invalid email format';

  if (!Number.isInteger(score) || score < 1) return 'Invalid score';

  return null;
}

async function checkRateLimit(email) {
  const key = `ratelimit:${email}`;
  const count = await kv.incr(key);

  // Set TTL on first increment
  if (count === 1) {
    await kv.expire(key, 3600);
  }

  if (count > 10) return 'Too many submissions. Try again later.';
  return null;
}

async function subscribeToKlaviyo(email, name, score) {
  const apiKey = process.env.KLAVIYO_API_KEY;
  const listId = process.env.KLAVIYO_LIST_ID;
  if (!apiKey || !listId) return;

  await fetch('https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/', {
    method: 'POST',
    headers: {
      'Authorization': `Klaviyo-API-Key ${apiKey}`,
      'Content-Type': 'application/json',
      'revision': '2024-10-15',
    },
    body: JSON.stringify({
      data: {
        type: 'profile-subscription-bulk-create-job',
        attributes: {
          profiles: {
            data: [{
              type: 'profile',
              attributes: {
                email,
                properties: {
                  patta_game_username: name,
                  patta_game_score: score,
                },
              },
            }],
          },
          historical_import: false,
        },
        relationships: {
          list: {
            data: { type: 'list', id: listId },
          },
        },
      },
    }),
  });
}
```

- [ ] **Step 2: Test validation with curl**

With dev server running:

```bash
# Missing fields
curl -s -X POST http://localhost:3000/api/submit-score \
  -H 'Content-Type: application/json' \
  -d '{}' | jq .
```

Expected: `{ "error": "Missing session ID" }`

```bash
# Name too long
curl -s -X POST http://localhost:3000/api/submit-score \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"fake","name":"thisnameiswaaaaaytoolong","email":"a@b.com","score":1,"turnstileToken":"x"}' | jq .
```

Expected: `{ "error": "Invalid or expired session" }` (session check fails first)

- [ ] **Step 3: Commit**

```bash
git add api/submit-score.js
git commit -m "feat: add submit-score API endpoint with session, Turnstile, rate limiting"
```

---

### Task 5: Score Submission Screen UI

**Files:**
- Modify: `index.html:43-49` (replace game-over-overlay content)
- Modify: `style.css` (add submission form styles)

- [ ] **Step 1: Add score submission overlay HTML**

In `index.html`, replace the existing game-over overlay (lines 44-49):

```html
            <!-- Game over overlay -->
            <div class="game-over-overlay">
                <div class="game-over-score"></div>
                <button class="btn-submit-score" aria-label="Submit Score">
                    <img src="assets/btn-submit.png" alt="Submit Score" draggable="false" />
                </button>
            </div>
```

With:

```html
            <!-- Game over overlay -->
            <div class="game-over-overlay">
                <div class="game-over-score"></div>
                <button class="btn-submit-score" aria-label="Submit Score">
                    <img src="assets/btn-submit.png" alt="Submit Score" draggable="false" />
                </button>
            </div>

            <!-- Score submission overlay -->
            <div class="score-submit-overlay">
                <div class="score-submit-header">YOUR SCORE</div>
                <div class="score-submit-score"></div>
                <form class="score-submit-form" autocomplete="off">
                    <div class="pixel-input">
                        <input type="text" name="name" placeholder="USERNAME" maxlength="16" required autocomplete="off" />
                    </div>
                    <div class="pixel-input">
                        <input type="email" name="email" placeholder="EMAIL ADDRESS" required autocomplete="off" />
                    </div>
                    <div class="score-submit-error"></div>
                    <div id="turnstile-container"></div>
                    <button type="submit" class="btn-continue">
                        <span>CONTINUE</span>
                    </button>
                </form>
            </div>
```

- [ ] **Step 2: Add the Turnstile script to index.html**

In `index.html`, add the Turnstile script before the closing `</head>` tag (after line 8):

```html
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>
```

- [ ] **Step 3: Add score submission styles**

Append the following to the end of `style.css`:

```css
/* ── SCORE SUBMISSION OVERLAY ── */
.score-submit-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    z-index: 4;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s var(--ease-out-cubic);
    background: linear-gradient(to bottom, rgba(219, 109, 42, 0) 60%, rgba(219, 109, 42, 0.6) 100%);
}

.splash-panel.score-submit-active .score-submit-overlay {
    opacity: 1;
    pointer-events: auto;
}

.score-submit-header {
    font-family: 'Neue Pixel Grotesk', monospace;
    font-size: 21px;
    color: #e9e9e9;
    text-transform: uppercase;
    letter-spacing: 2.1px;
    margin-top: 21px;
}

.score-submit-score {
    font-family: 'Neue Pixel Grotesk', monospace;
    font-size: 120px;
    color: #fff;
    line-height: 1;
    margin-top: 56px;
}

.score-submit-form {
    display: flex;
    flex-direction: column;
    gap: 18px;
    width: calc(100% - 36px);
    padding: 18px;
    margin-top: auto;
    margin-bottom: 36px;
}

.pixel-input {
    height: 48px;
    border: 2px solid #fff;
    display: flex;
    align-items: center;
}

.pixel-input input {
    width: 100%;
    height: 100%;
    background: none;
    border: none;
    outline: none;
    color: #fff;
    font-family: 'Neue Pixel Grotesk', monospace;
    font-size: 20px;
    letter-spacing: 2px;
    text-transform: uppercase;
    padding: 0 12px;
}

.pixel-input input::placeholder {
    color: #8ac464;
}

.score-submit-error {
    font-family: 'Neue Pixel Grotesk', monospace;
    font-size: 14px;
    color: #ff4444;
    letter-spacing: 1.4px;
    text-transform: uppercase;
    min-height: 14px;
}

.btn-continue {
    height: 57px;
    border: 2px solid #fff;
    background: linear-gradient(to bottom, #0051e8, #40c4f1);
    color: #fff;
    font-family: 'Neue Pixel Grotesk', monospace;
    font-size: 20px;
    letter-spacing: 2px;
    text-transform: uppercase;
    cursor: pointer;
    transition: filter 0.15s var(--ease-out-cubic), transform 0.15s var(--ease-out-cubic);
    margin: 0 auto;
    padding: 0 40px;
}

.btn-continue:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.btn-continue:not(:disabled):hover {
    filter: brightness(1.1);
    transform: translateY(-1px);
}

.btn-continue:not(:disabled):active {
    filter: brightness(0.92);
    transform: translateY(1px);
    transition-duration: 0.1s;
}

#turnstile-container {
    min-height: 0;
}
```

- [ ] **Step 4: Verify in browser**

Run `npx vercel dev`, open `http://localhost:3000`. Play a game, let it end — the existing game-over overlay should still show. The new score-submit-overlay is hidden by default (it will be wired up in Task 7).

- [ ] **Step 5: Commit**

```bash
git add index.html style.css
git commit -m "feat: add score submission screen HTML and CSS"
```

---

### Task 6: Leaderboard Screen UI

**Files:**
- Modify: `index.html` (add leaderboard overlay after score-submit-overlay)
- Modify: `style.css` (add leaderboard styles)

- [ ] **Step 1: Add leaderboard overlay HTML**

In `index.html`, add the following after the score-submit-overlay closing `</div>` and before the `<img src="assets/tournament-title.png"` line:

```html
            <!-- Leaderboard overlay -->
            <div class="leaderboard-overlay">
                <div class="leaderboard-top">
                    <img src="assets/tournament-title.png" alt="International Patta Soccer Tournament" class="leaderboard-title" />
                    <div class="leaderboard-label">LEADERBOARD</div>
                </div>
                <div class="leaderboard-table">
                    <div class="leaderboard-table-header">
                        <span class="lb-col-rank">#</span>
                        <span class="lb-col-name">NAME</span>
                        <span class="lb-col-score">SCORE</span>
                    </div>
                    <div class="leaderboard-rows"></div>
                </div>
                <button class="btn-back" aria-label="Back">
                    <span>BACK</span>
                </button>
            </div>
```

- [ ] **Step 2: Add leaderboard styles**

Append the following to the end of `style.css`:

```css
/* ── LEADERBOARD OVERLAY ── */
.leaderboard-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    z-index: 4;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s var(--ease-out-cubic);
    overflow: hidden;
}

.splash-panel.leaderboard-active .leaderboard-overlay {
    opacity: 1;
    pointer-events: auto;
}

.leaderboard-top {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 18px;
    gap: 4px;
}

.leaderboard-title {
    width: 80%;
    max-width: 310px;
    height: auto;
}

.leaderboard-label {
    font-family: 'Neue Pixel Grotesk', monospace;
    font-size: 15px;
    color: #e9e9e9;
    letter-spacing: 1.5px;
    text-transform: uppercase;
}

.leaderboard-table {
    width: calc(100% - 36px);
    margin-top: 18px;
    border: 2px solid #fff;
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
}

.leaderboard-table-header {
    display: flex;
    padding: 8px 12px;
    border-bottom: 2px solid #fff;
    font-family: 'Neue Pixel Grotesk', monospace;
    font-size: 14px;
    color: #e9e9e9;
    letter-spacing: 1.4px;
    text-transform: uppercase;
}

.leaderboard-rows {
    flex: 1;
    overflow-y: auto;
}

.leaderboard-row {
    display: flex;
    padding: 8px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
    font-family: 'Neue Pixel Grotesk', monospace;
    font-size: 14px;
    color: #fff;
    letter-spacing: 1.4px;
    text-transform: uppercase;
}

.leaderboard-row.user-row {
    background: rgba(0, 81, 232, 0.6);
}

.leaderboard-row.separator-row {
    border-bottom: 2px solid #fff;
    padding: 2px;
}

.lb-col-rank {
    width: 40px;
    flex-shrink: 0;
}

.lb-col-name {
    flex: 1;
}

.lb-col-score {
    width: 70px;
    flex-shrink: 0;
    text-align: right;
}

.btn-back {
    position: absolute;
    top: 18px;
    left: 18px;
    height: 20px;
    border: 2px solid #fff;
    background: #0051e8;
    color: #e9e9e9;
    font-family: 'Neue Pixel Grotesk', monospace;
    font-size: 14px;
    letter-spacing: 1.4px;
    text-transform: uppercase;
    cursor: pointer;
    padding: 0 8px;
    display: flex;
    align-items: center;
    gap: 6px;
    z-index: 5;
    transition: filter 0.15s var(--ease-out-cubic);
}

.btn-back:hover {
    filter: brightness(1.2);
}
```

- [ ] **Step 3: Commit**

```bash
git add index.html style.css
git commit -m "feat: add leaderboard screen HTML and CSS"
```

---

### Task 7: Frontend Integration

**Files:**
- Modify: `app.js` (add session handling, form submission, leaderboard rendering, Turnstile, screen transitions)

This task wires up all the new UI to the API endpoints and game flow.

- [ ] **Step 1: Add Turnstile site key constant and DOM references**

At the top of `app.js`, after the existing DOM references (after line 40, after `const btnSubmitScore`), add:

```javascript
// ── LEADERBOARD & SUBMISSION ──
// Replace with your Cloudflare Turnstile site key
const TURNSTILE_SITE_KEY = 'YOUR_TURNSTILE_SITE_KEY';

const scoreSubmitOverlay = document.querySelector('.score-submit-overlay');
const scoreSubmitScore = document.querySelector('.score-submit-score');
const scoreSubmitForm = document.querySelector('.score-submit-form');
const scoreSubmitError = document.querySelector('.score-submit-error');
const btnContinue = document.querySelector('.btn-continue');
const leaderboardOverlay = document.querySelector('.leaderboard-overlay');
const leaderboardRows = document.querySelector('.leaderboard-rows');
const btnBack = document.querySelector('.btn-back');
const btnLeaderboard = document.querySelector('.btn-leaderboard');

let currentSessionId = null;
let turnstileToken = null;
let turnstileWidgetId = null;
```

- [ ] **Step 2: Add the startSession function**

Add after the new DOM references:

```javascript
async function startSession() {
  try {
    const res = await fetch('/api/start-session', { method: 'POST' });
    const data = await res.json();
    currentSessionId = data.sessionId;
  } catch (e) {
    currentSessionId = null;
  }
}
```

- [ ] **Step 3: Call startSession when the game starts**

Modify the existing `startGame()` function (around line 251) to call `startSession()`. Add `startSession();` as the first line inside the function:

Replace:
```javascript
function startGame() {
    // Show canvas + start overlay inside the panel, hide menu content
    splashPanel.classList.add('game-active');
```

With:
```javascript
function startGame() {
    startSession();
    // Show canvas + start overlay inside the panel, hide menu content
    splashPanel.classList.add('game-active');
```

- [ ] **Step 4: Add the showScoreSubmit function**

Add after the `startSession` function:

```javascript
function showScoreSubmit() {
  scoreSubmitScore.textContent = score;
  scoreSubmitError.textContent = '';
  btnContinue.disabled = false;

  // Pre-fill from localStorage
  const savedName = localStorage.getItem('patta_game_name');
  const savedEmail = localStorage.getItem('patta_game_email');
  const nameInput = scoreSubmitForm.querySelector('[name="name"]');
  const emailInput = scoreSubmitForm.querySelector('[name="email"]');
  if (savedName) nameInput.value = savedName;
  if (savedEmail) emailInput.value = savedEmail;

  splashPanel.classList.remove('game-over');
  splashPanel.classList.add('score-submit-active');

  // Initialize Turnstile widget
  if (window.turnstile && !turnstileWidgetId) {
    turnstileWidgetId = turnstile.render('#turnstile-container', {
      sitekey: TURNSTILE_SITE_KEY,
      callback: function(token) {
        turnstileToken = token;
      },
      'error-callback': function() {
        turnstileToken = null;
      },
      size: 'invisible',
    });
  } else if (window.turnstile && turnstileWidgetId) {
    turnstile.reset(turnstileWidgetId);
    turnstileToken = null;
  }
}
```

- [ ] **Step 5: Wire the Submit Score button to showScoreSubmit**

Replace the existing `btnSubmitScore` click handler (around line 274):

Replace:
```javascript
// Submit score button
btnSubmitScore.addEventListener('click', (e) => {
    e.stopPropagation();
    // TODO: implement score submission
});
```

With:
```javascript
// Submit score button → show submission form
btnSubmitScore.addEventListener('click', (e) => {
    e.stopPropagation();
    showScoreSubmit();
});
```

- [ ] **Step 6: Add the form submission handler**

Add after the `showScoreSubmit` function:

```javascript
scoreSubmitForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  scoreSubmitError.textContent = '';
  btnContinue.disabled = true;

  const formData = new FormData(scoreSubmitForm);
  const name = (formData.get('name') || '').trim();
  const email = (formData.get('email') || '').trim();

  // Client-side validation
  if (!name || name.length > 16) {
    scoreSubmitError.textContent = 'NAME MUST BE 1-16 CHARACTERS';
    btnContinue.disabled = false;
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    scoreSubmitError.textContent = 'INVALID EMAIL ADDRESS';
    btnContinue.disabled = false;
    return;
  }

  // Save to localStorage for pre-fill
  localStorage.setItem('patta_game_name', name);
  localStorage.setItem('patta_game_email', email);

  try {
    const res = await fetch('/api/submit-score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        email,
        score,
        sessionId: currentSessionId,
        turnstileToken,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      scoreSubmitError.textContent = (data.error || 'SUBMISSION FAILED').toUpperCase();
      btnContinue.disabled = false;
      return;
    }

    // Show leaderboard with user highlight
    showLeaderboard(data.topTen, data.userEntry);
  } catch (err) {
    scoreSubmitError.textContent = 'NETWORK ERROR. TRY AGAIN.';
    btnContinue.disabled = false;
  }
});
```

- [ ] **Step 7: Add the showLeaderboard and renderLeaderboard functions**

Add after the form submission handler:

```javascript
function showLeaderboard(topTen, userEntry) {
  splashPanel.classList.remove('score-submit-active', 'game-over', 'game-active', 'game-playing');
  canvas.classList.remove('active');
  splashPanel.classList.add('leaderboard-active');
  renderLeaderboard(topTen, userEntry);
}

function renderLeaderboard(topTen, userEntry) {
  leaderboardRows.innerHTML = '';

  topTen.forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'leaderboard-row';
    if (userEntry && entry.rank === userEntry.rank) {
      row.classList.add('user-row');
    }
    row.innerHTML =
      '<span class="lb-col-rank">' + entry.rank + '</span>' +
      '<span class="lb-col-name">' + escapeHtml(entry.name) + '</span>' +
      '<span class="lb-col-score">' + entry.score + '</span>';
    leaderboardRows.appendChild(row);
  });

  // If user is outside top 10, add separator + user row
  if (userEntry && userEntry.rank > topTen.length) {
    const sep = document.createElement('div');
    sep.className = 'leaderboard-row separator-row';
    leaderboardRows.appendChild(sep);

    const userRow = document.createElement('div');
    userRow.className = 'leaderboard-row user-row';
    userRow.innerHTML =
      '<span class="lb-col-rank">' + userEntry.rank + '</span>' +
      '<span class="lb-col-name">' + escapeHtml(userEntry.name) + '</span>' +
      '<span class="lb-col-score">' + userEntry.score + '</span>';
    leaderboardRows.appendChild(userRow);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
```

- [ ] **Step 8: Add the Back button and menu Leaderboard button handlers**

Add after the `renderLeaderboard` function:

```javascript
// Back button → return to menu
btnBack.addEventListener('click', (e) => {
  e.stopPropagation();
  splashPanel.classList.remove('leaderboard-active');
  state = 'start';
  resetGame();
});

// Menu leaderboard button → fetch and show leaderboard (no user highlight)
btnLeaderboard.addEventListener('click', async (e) => {
  e.stopPropagation();
  try {
    const res = await fetch('/api/leaderboard');
    const data = await res.json();
    splashPanel.classList.add('leaderboard-active');
    renderLeaderboard(data.topTen, null);
  } catch (err) {
    // Silently fail — button just doesn't work if API is down
  }
});
```

- [ ] **Step 9: Update the game-over tap-to-retry behavior**

The existing `kick()` function (around line 513) has a tap-to-retry on game over. Replace that behavior so tapping during game-over no longer auto-restarts — the user should go through the submit flow instead.

In the `kick()` function, replace the `state === 'over'` block:

Replace:
```javascript
    if (state === 'over') {
        if (Date.now() - gameOverTime < GAME_OVER_COOLDOWN) return;
        hideGameOver();
        state = 'playing';
        resetGame();
        ball.vy = KICK_FORCE;
        ball.vx = (Math.random() - 0.5) * 4;
        ball.spin = ball.vx * 0.08;
        score = 1;
        canKick = false;
        screenShake = 4;
        spawnParticles(ball.x, ball.y);
        return;
    }
```

With:
```javascript
    if (state === 'over') {
        // Don't auto-restart — user must go through submit flow
        return;
    }
```

- [ ] **Step 10: Add CSS to hide menu content during score-submit and leaderboard states**

In `style.css`, find the existing rule that hides content during game-active (around line 245):

Replace:
```css
.splash-panel.game-active .tournament-title,
.splash-panel.game-active .menu-buttons,
.splash-panel.game-active .menu-footer {
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s var(--ease-out-cubic);
}
```

With:
```css
.splash-panel.game-active .tournament-title,
.splash-panel.game-active .menu-buttons,
.splash-panel.game-active .menu-footer,
.splash-panel.score-submit-active .tournament-title,
.splash-panel.score-submit-active .menu-buttons,
.splash-panel.score-submit-active .menu-footer,
.splash-panel.leaderboard-active .menu-buttons,
.splash-panel.leaderboard-active .menu-footer {
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s var(--ease-out-cubic);
}
```

Note: the leaderboard overlay has its own title image, so we hide the original `.tournament-title` during score-submit but let the leaderboard overlay handle its own title.

Also add a rule to hide the pattern background during these states. Find (around line 255):

Replace:
```css
.splash-panel.game-active::before {
    opacity: 0;
    transition: opacity 0.3s var(--ease-out-cubic);
}
```

With:
```css
.splash-panel.game-active::before,
.splash-panel.score-submit-active::before,
.splash-panel.leaderboard-active::before {
    opacity: 0;
    transition: opacity 0.3s var(--ease-out-cubic);
}
```

- [ ] **Step 11: Verify the full flow in browser**

Run `npx vercel dev`, open `http://localhost:3000`.

1. Click Play Game → play the game → let ball drop → game over screen shows
2. Click Submit Score → score submission form appears with score, name input, email input
3. Fill in name + email, click Continue (will fail without KV + Turnstile keys, which is expected)
4. Click the Leaderboard button from the menu → leaderboard overlay should show (empty)
5. Click Back → returns to menu

- [ ] **Step 12: Commit**

```bash
git add app.js style.css
git commit -m "feat: wire up frontend game flow with session, submission, and leaderboard"
```

---

### Task 8: Environment Setup & Deployment Verification

**Files:** None (Vercel dashboard + local env setup)

This task covers connecting the Vercel project to KV storage and deploying.

- [ ] **Step 1: Link Vercel project**

Run from the project root:

```bash
npx vercel link
```

Follow the prompts to link to your Vercel team/project. If the project doesn't exist yet, Vercel will create it.

- [ ] **Step 2: Create Vercel KV store**

In the Vercel dashboard:
1. Go to the project → Storage tab
2. Click "Create Database" → select "KV" (Upstash Redis)
3. Name it (e.g., `patta-game-leaderboard`)
4. Connect it to the project

This automatically sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` as environment variables.

- [ ] **Step 3: Set remaining environment variables**

In the Vercel dashboard → project Settings → Environment Variables, add:

- `TURNSTILE_SECRET_KEY` — from Cloudflare Turnstile dashboard
- `KLAVIYO_API_KEY` — from Klaviyo account
- `KLAVIYO_LIST_ID` — from Klaviyo list settings

- [ ] **Step 4: Update the Turnstile site key in app.js**

Replace `YOUR_TURNSTILE_SITE_KEY` in `app.js` with the actual site key from Cloudflare Turnstile.

- [ ] **Step 5: Pull environment variables for local development**

```bash
npx vercel env pull .env.development.local
```

This creates `.env.development.local` with all the KV and API keys for local testing.

- [ ] **Step 6: Test the full flow locally**

Run: `npx vercel dev`

1. Play a game → game over → Submit Score → fill form → Continue
2. Verify the score appears in the leaderboard
3. Play again → submit with same email but lower score → verify score doesn't change
4. Play again → submit with same email but higher score → verify score updates
5. Check the Leaderboard button from the menu shows the same data
6. Verify the Turnstile widget runs invisibly (no CAPTCHA visible)

- [ ] **Step 7: Deploy to Vercel**

```bash
npx vercel --prod
```

Verify the deployed URL works end-to-end.

- [ ] **Step 8: Commit the site key update**

```bash
git add app.js
git commit -m "chore: set Turnstile site key for production"
```
