# Loading Animation & Splash Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a 4-phase loading animation (progress bar → logo convergence → splash reveal → menu) that replaces the existing canvas-drawn splash screen.

**Architecture:** DOM overlay (`<div id="loading-overlay">`) sits on top of the canvas. All loading/animation/menu UI lives in the DOM with CSS transitions. The canvas is hidden during loading and revealed via the CSS View Transitions API when "Play Game" is clicked. The existing canvas splash code is removed.

**Tech Stack:** Vanilla HTML, CSS (transitions/keyframes/view-transitions), JavaScript (no dependencies)

**Spec:** `docs/superpowers/specs/2026-03-23-loading-animation-design.md`

**Figma file:** `3D27Uv2tFDVPsxqOiQKBeZ` (used for asset export via Figma MCP)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `index.html` | **Modify:** Add loading overlay DOM structure, update `<title>` |
| `style.css` | **Modify:** Add all loading overlay styles, animations, view transitions |
| `app.js` | **Modify:** Remove old splash code, add asset loader + animation sequencer + menu logic |
| `assets/` | **Create directory:** Store exported Figma assets |
| `assets/patta-logo.png` | **Create:** Patta script logo (white on transparent) |
| `assets/nike-swoosh.png` | **Create:** Nike swoosh (white on transparent) |
| `assets/pattern-tile.png` | **Create:** Repeating pattern background tile |
| `assets/tournament-title.png` | **Create:** "International Patta Soccer Tournament" title graphic |

---

### Task 1: Export Assets from Figma

**Files:**
- Create: `assets/patta-logo.png`
- Create: `assets/nike-swoosh.png`
- Create: `assets/pattern-tile.png`
- Create: `assets/tournament-title.png`

- [ ] **Step 1: Create assets directory**

```bash
mkdir -p assets
```

- [ ] **Step 2: Export Patta logo from Figma**

Use Figma MCP `get_design_context` on node `0:161` (fileKey: `3D27Uv2tFDVPsxqOiQKBeZ`). Download the image asset and save to `assets/patta-logo.png`.

- [ ] **Step 3: Export Nike swoosh from Figma**

Use Figma MCP `get_design_context` on node `0:162`. Download and save to `assets/nike-swoosh.png`.

- [ ] **Step 4: Export pattern tile from Figma**

Use Figma MCP `get_design_context` on node `0:6` (Frame 17 — the pattern background). Download and save to `assets/pattern-tile.png`.

- [ ] **Step 5: Export tournament title from Figma**

Use Figma MCP to get the "International Patta Soccer Tournament" title graphic from the splash frame (node `0:3`). The title is the red/orange retro text element. Download and save to `assets/tournament-title.png`.

- [ ] **Step 6: Remove old T-Rex assets**

```bash
rm -f cacti.png t-rex-background.png t-rex.png
```

- [ ] **Step 7: Commit**

```bash
git add assets/
git add -u cacti.png t-rex-background.png t-rex.png
git commit -m "feat: add Patta/Nike assets from Figma, remove old T-Rex images"
```

---

### Task 2: Add Loading Overlay HTML Structure

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Update the HTML**

Replace the contents of `index.html` with:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Patta International Soccer Tournament</title>
    <link rel="stylesheet" href="style.css"/>
</head>
<body>
    <div id="loading-overlay">
        <!-- Phase 1: Loading bar -->
        <div class="loading-row">
            <img src="assets/patta-logo.png" alt="Patta" class="logo logo-patta" />
            <div class="progress-bar">
                <div class="progress-fill"></div>
            </div>
            <img src="assets/nike-swoosh.png" alt="Nike" class="logo logo-nike" />
        </div>

        <!-- Phase 3: Splash panel (hidden initially) -->
        <div class="splash-panel">
            <img src="assets/tournament-title.png" alt="International Patta Soccer Tournament" class="tournament-title" />

            <!-- Phase 4: Menu buttons (hidden initially) -->
            <div class="menu-buttons">
                <button class="menu-btn btn-play">PLAY GAME</button>
                <button class="menu-btn btn-signup">SIGN UP</button>
                <button class="menu-btn btn-collection">VIEW PRODUCT/COLLECTION</button>
                <button class="menu-btn btn-leaderboard">VIEW LEADERBOARD</button>
            </div>
            <footer class="menu-footer">&copy; 2026 Patta. All rights reserved.</footer>
        </div>
    </div>

    <canvas id="game" width="400" height="600"></canvas>
    <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Verify file renders in browser**

```bash
open index.html
```

Expected: Black screen with Patta logo, progress bar, and Nike swoosh visible (unstyled — will be styled in Task 3).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add loading overlay HTML structure, update page title"
```

---

### Task 3: Add Loading Overlay CSS

**Files:**
- Modify: `style.css`

- [ ] **Step 1: Add overlay and Phase 1 styles**

Append to `style.css`:

```css
/* ── LOADING OVERLAY ── */
#loading-overlay {
    position: fixed;
    inset: 0;
    background: #000;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 10;
    transition: opacity 0.3s ease-out;
}

#loading-overlay.hidden {
    opacity: 0;
    pointer-events: none;
}

/* Phase 1: Loading row */
.loading-row {
    display: flex;
    align-items: center;
    gap: 20px;
}

.logo {
    transition: width 0.4s ease-in-out, height 0.4s ease-in-out;
}

.logo-patta {
    width: 65px;
    height: 39px;
}

.logo-nike {
    width: 60px;
    height: 25px;
}

.progress-bar {
    width: 305px;
    height: 13px;
    border: 1px solid #fff;
    border-radius: 2px;
    overflow: hidden;
    transition: opacity 0.2s ease-out;
}

.progress-fill {
    height: 100%;
    width: 0%;
    background: #fff;
    transition: width 0.15s ease-out;
}

/* Responsive: narrow screens */
@media (max-width: 500px) {
    .progress-bar {
        width: 75vw;
    }
    .logo-patta {
        width: 45px;
        height: 27px;
    }
    .logo-nike {
        width: 42px;
        height: 18px;
    }
    .loading-row {
        gap: 12px;
    }
}
```

- [ ] **Step 2: Add Phase 2 (convergence) styles**

```css
/* Phase 2: Logo convergence — progress bar hidden, logos centered */
.loading-row.converged .progress-bar {
    opacity: 0;
    width: 0;
    margin: 0;
    padding: 0;
    border: none;
}

.loading-row.converged {
    gap: 19px;
}
```

- [ ] **Step 3: Add Phase 3 (splash reveal) styles**

```css
/* Phase 3: Splash panel */
.splash-panel {
    position: absolute;
    width: min(403px, 90vw);
    aspect-ratio: 403 / 698;
    background-image: url('assets/pattern-tile.png');
    background-size: 120px;
    background-repeat: repeat;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding-top: 10%;
    transform: scale(0);
    opacity: 0;
    transition: transform 0.5s ease-out, opacity 0.3s ease-out;
    z-index: 1;
}

.splash-panel.visible {
    transform: scale(1);
    opacity: 1;
}

.tournament-title {
    width: 80%;
    max-width: 350px;
    height: auto;
    margin-bottom: 20px;
}

/* Logos in splash position: scaled up, pushed outward */
.loading-row.splash-position {
    position: absolute;
    width: calc(min(403px, 90vw) + 40px); /* panel width + 20px each side */
    justify-content: space-between;
    z-index: 2;
    gap: 0;
}

.loading-row.splash-position .logo-patta {
    width: 125px;
    height: 76px;
}

.loading-row.splash-position .logo-nike {
    width: 113px;
    height: 46px;
}

.loading-row.splash-position .progress-bar {
    display: none;
}

@media (max-width: 500px) {
    .loading-row.splash-position .logo-patta {
        width: 65px;
        height: 39px;
    }
    .loading-row.splash-position .logo-nike {
        width: 60px;
        height: 25px;
    }
}
```

- [ ] **Step 4: Add Phase 4 (menu) styles**

```css
/* Phase 4: Menu buttons */
.menu-buttons {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    margin-top: auto;
    margin-bottom: 10%;
}

.menu-btn {
    width: 240px;
    padding: 12px 24px;
    border: 2px solid rgba(0, 0, 0, 0.3);
    border-radius: 6px;
    font-family: monospace;
    font-size: 14px;
    font-weight: bold;
    color: #fff;
    text-transform: uppercase;
    cursor: pointer;
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.3s ease-out, transform 0.3s ease-out;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
}

.menu-btn.visible {
    opacity: 1;
    transform: translateY(0);
}

.btn-play { background: #4CAF50; }
.btn-signup { background: #2196F3; }
.btn-collection { background: #FF9800; }
.btn-leaderboard { background: #F44336; }

.menu-btn:hover {
    filter: brightness(1.15);
}

.menu-btn:active {
    transform: translateY(2px) !important;
}

.menu-footer {
    color: #888;
    font-family: monospace;
    font-size: 11px;
    padding-bottom: 16px;
    opacity: 0;
    transition: opacity 0.2s ease-out;
}

.menu-footer.visible {
    opacity: 1;
}
```

- [ ] **Step 5: Add CSS View Transitions**

```css
/* View Transitions API: overlay → game */
::view-transition-old(root) {
    animation: fade-out 0.3s ease-out;
}

::view-transition-new(root) {
    animation: fade-in 0.3s ease-out;
}

@keyframes fade-out {
    from { opacity: 1; }
    to { opacity: 0; }
}

@keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
}
```

- [ ] **Step 6: Verify styling in browser**

```bash
open index.html
```

Expected: Black screen with centered Patta logo, progress bar, Nike swoosh. Splash panel and buttons are hidden.

- [ ] **Step 7: Commit**

```bash
git add style.css
git commit -m "feat: add loading overlay CSS with all animation phases and view transitions"
```

---

### Task 4: Remove Old Splash Code from app.js

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Remove the old splash screen code**

Remove lines 4–120 of `app.js` (everything from `// ── PATTA 8-BIT SPLASH SCREEN ──` through the `skipSplash()` function). **Keep lines 1-2** (`const canvas` and `const ctx`) — these are needed by the game. This includes:
- `splashDone`, `splashAlpha`, `splashPhase`, `splashTimer` variables
- `SPLASH_FADEIN`, `SPLASH_HOLD`, `SPLASH_FADEOUT` constants
- `pattaLogo` image loading and pixelation code
- `drawSplashScreen()` function
- `skipSplash()` function

- [ ] **Step 2: Update the game loop**

In the `update()` function (around line 721), remove the splash guard:

```javascript
// REMOVE these lines:
if (!splashDone) {
    drawSplashScreen();
    requestAnimationFrame(update);
    return;
}
```

- [ ] **Step 3: Update input handlers**

In the `keydown`, `touchstart`, and `mousedown` event listeners, remove the splash skip checks:

```javascript
// REMOVE from each handler:
if (!splashDone) { skipSplash(); return; }
```

- [ ] **Step 4: Prevent game from auto-starting**

At the bottom of `app.js`, change the auto-start:

```javascript
// REMOVE:
update();

// REPLACE WITH:
// Game loop is started by the loading overlay when "Play Game" is clicked
```

- [ ] **Step 5: Verify the file has no syntax errors**

Open browser dev tools console — should have no JS errors. The canvas should be blank (no game running, no splash).

- [ ] **Step 6: Commit**

```bash
git add app.js
git commit -m "refactor: remove old canvas splash screen code"
```

---

### Task 5: Implement Asset Loader & Animation Sequencer

**Files:**
- Modify: `app.js` (add at the top, before game constants)

- [ ] **Step 1: Add the asset preloader**

Add at the top of `app.js`:

```javascript
// ── LOADING OVERLAY CONTROLLER ──
const overlay = document.getElementById('loading-overlay');
const progressFill = document.querySelector('.progress-fill');
const loadingRow = document.querySelector('.loading-row');
const splashPanel = document.querySelector('.splash-panel');
const menuButtons = document.querySelectorAll('.menu-btn');
const menuFooter = document.querySelector('.menu-footer');
const btnPlay = document.querySelector('.btn-play');

const ASSETS_TO_LOAD = [
    'assets/patta-logo.png',
    'assets/nike-swoosh.png',
    'assets/pattern-tile.png',
    'assets/tournament-title.png',
];

let loadedCount = 0;
let loadingComplete = false;
const LOAD_TIMEOUT = 10000; // 10 seconds

function preloadAssets() {
    const totalAssets = ASSETS_TO_LOAD.length;

    const timeoutId = setTimeout(() => {
        if (!loadingComplete) {
            loadingComplete = true;
            progressFill.style.width = '100%';
            startPhase2();
        }
    }, LOAD_TIMEOUT);

    ASSETS_TO_LOAD.forEach((src) => {
        const img = new Image();
        img.onload = img.onerror = () => {
            loadedCount++;
            const percent = (loadedCount / totalAssets) * 100;
            progressFill.style.width = percent + '%';

            if (loadedCount >= totalAssets && !loadingComplete) {
                loadingComplete = true;
                clearTimeout(timeoutId);
                startPhase2();
            }
        };
        img.src = src;
    });
}
```

- [ ] **Step 2: Add Phase 2 — logo convergence**

```javascript
function startPhase2() {
    // Pause 300ms at 100%, then converge
    setTimeout(() => {
        loadingRow.querySelector('.progress-bar').style.opacity = '0';

        setTimeout(() => {
            loadingRow.classList.add('converged');
            // Wait for convergence transition to finish
            loadingRow.addEventListener('transitionend', startPhase3, { once: true });
            // Fallback if transitionend doesn't fire
            phase3Timeout = setTimeout(startPhase3, 500);
        }, 200); // bar fade duration
    }, 300); // pause at 100%
}

let phase3Started = false;
let phase3Timeout = null;
function startPhase3() {
    if (phase3Started) return;
    phase3Started = true;
    if (phase3Timeout) clearTimeout(phase3Timeout);

    // Pause 200ms, then reveal splash
    setTimeout(() => {
        // Expand panel
        splashPanel.classList.add('visible');
        // Move logos to splash position
        loadingRow.classList.add('splash-position');

        // Wait for splash expand, then show menu
        setTimeout(startPhase4, 500 + 1500); // 500ms expand + 1500ms hold
    }, 200);
}
```

- [ ] **Step 3: Add Phase 4 — menu reveal**

```javascript
function startPhase4() {
    menuButtons.forEach((btn, i) => {
        setTimeout(() => {
            btn.classList.add('visible');
        }, i * 100);
    });

    // Footer after last button
    setTimeout(() => {
        menuFooter.classList.add('visible');
    }, (menuButtons.length - 1) * 100 + 300 + 200);
}
```

- [ ] **Step 4: Add skip mechanism**

```javascript
// Skip to final menu state on tap/space during phases 1-3
function skipToMenu() {
    if (loadingComplete && menuButtons[0].classList.contains('visible')) return;

    loadingComplete = true;
    progressFill.style.width = '100%';
    phase3Started = true;

    // Instantly set all states
    loadingRow.classList.add('converged', 'splash-position');
    loadingRow.querySelector('.progress-bar').style.opacity = '0';
    splashPanel.classList.add('visible');

    // Show buttons immediately
    menuButtons.forEach(btn => btn.classList.add('visible'));
    menuFooter.classList.add('visible');
}

overlay.addEventListener('click', skipToMenu);
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && overlay.style.display !== 'none') {
        e.preventDefault();
        skipToMenu();
    }
});
```

- [ ] **Step 5: Add "Play Game" button handler with View Transitions**

```javascript
function startGame() {
    const hideOverlayAndStart = () => {
        overlay.style.display = 'none';
        update(); // Start the game loop
    };

    if (document.startViewTransition) {
        document.startViewTransition(hideOverlayAndStart);
    } else {
        overlay.classList.add('hidden');
        setTimeout(hideOverlayAndStart, 300);
    }
}

btnPlay.addEventListener('click', (e) => {
    e.stopPropagation(); // Don't trigger skipToMenu
    startGame();
});

// Prevent other menu buttons from triggering skip
document.querySelectorAll('.menu-btn').forEach(btn => {
    btn.addEventListener('click', (e) => e.stopPropagation());
});

// Start the loading sequence
preloadAssets();
```

- [ ] **Step 6: Verify full flow in browser**

```bash
open index.html
```

Expected sequence:
1. Progress bar fills as assets load
2. Bar fades, logos slide together
3. Splash panel expands, logos scale out
4. Menu buttons stagger in
5. Clicking "Play Game" transitions to the game canvas

- [ ] **Step 7: Commit**

```bash
git add app.js
git commit -m "feat: implement loading animation sequencer with 4-phase flow"
```

---

### Task 6: Final Polish & Manual QA

**Files:**
- All files (read-only review)

- [ ] **Step 1: Test skip mechanism**

Open the page and immediately press Space. Expected: Skip straight to the menu.

- [ ] **Step 2: Test on narrow viewport**

Open browser dev tools, toggle device toolbar, set to 375px wide (iPhone). Expected: Logos and progress bar scale down, panel fits viewport, buttons are tappable.

- [ ] **Step 3: Test asset failure**

Temporarily rename one asset file and reload. Expected: Loading still completes, splash shows with missing image gracefully.

- [ ] **Step 4: Test View Transitions fallback**

Open in Firefox (doesn't support View Transitions API). Expected: "Play Game" still works with opacity fallback.

- [ ] **Step 5: Verify game still works**

After clicking "Play Game", play the game. Expected: Ball physics, scoring, levels, game over — all unchanged.

- [ ] **Step 6: Final commit**

If any fixes were needed:
```bash
git add -A
git commit -m "fix: loading animation polish and edge cases"
```
