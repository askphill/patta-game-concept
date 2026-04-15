const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// ── HAPTIC FEEDBACK ──
let haptics = null;
import("https://cdn.jsdelivr.net/npm/web-haptics/+esm")
  .then((m) => {
    haptics = new m.WebHaptics();
  })
  .catch(() => {});

function haptic(type, scoreIntensity) {
  if (!haptics) return;
  // Scale intensity with score: 0.3 at score 0, up to 1.0 at score 50+
  const intensity = scoreIntensity
    ? 0.3 + 0.7 * Math.min(scoreIntensity / 50, 1)
    : undefined;
  const opts = intensity !== undefined ? { intensity } : undefined;
  haptics.trigger(type, opts);
}

// ── RETINA / HiDPI SUPPORT ──
const DPR = window.devicePixelRatio || 1;
const CSS_W = 403;
const CSS_H = 698;
canvas.width = CSS_W * DPR;
canvas.height = CSS_H * DPR;
canvas.style.width = "100%";
canvas.style.height = "100%";
ctx.scale(DPR, DPR);

// ── LOADING OVERLAY CONTROLLER ──
const overlay = document.getElementById("loading-overlay");
const progressFill = document.querySelector(".progress-fill");
const loadingRow = document.querySelector(".loading-row");
const splashPanel = document.querySelector(".splash-panel");
const menuButtons = document.querySelectorAll(".menu-btn");
const menuFooter = document.querySelector(".menu-footer");
const btnPlay = document.querySelector(".btn-play");
const gameOverOverlay = document.querySelector(".game-over-overlay");
const gameOverScore = document.querySelector(".game-over-score");
const btnSubmitScore = document.querySelector(".btn-submit-score");

// ── LEADERBOARD & SUBMISSION ──
// Replace with your Cloudflare Turnstile site key
const TURNSTILE_SITE_KEY = "0x4AAAAAAC9ZjGD-cgxoZ_Qv";

const scoreSubmitOverlay = document.querySelector(".score-submit-overlay");
const scoreSubmitScore = document.querySelector(".score-submit-score");
const scoreSubmitForm = document.querySelector(".score-submit-form");
const scoreSubmitError = document.querySelector(".score-submit-error");
const btnContinue = document.querySelector(".btn-continue");
const leaderboardOverlay = document.querySelector(".leaderboard-overlay");
const leaderboardRows = document.querySelector(".leaderboard-rows");
const leaderboardGradient = document.querySelector(".leaderboard-gradient");
const btnBack = document.querySelector(".btn-back");
const btnLeaderboard = document.querySelector(".btn-leaderboard");

let currentSessionId = null;
let turnstileToken = null;
let turnstileWidgetId = null;

async function startSession() {
  try {
    const res = await fetch("/api/start-session", { method: "POST" });
    const data = await res.json();
    currentSessionId = data.sessionId;
  } catch (e) {
    currentSessionId = null;
  }
}

function showScoreSubmit() {
  scoreSubmitScore.textContent = score;
  scoreSubmitError.textContent = "";
  btnContinue.disabled = false;

  // Pre-fill from localStorage
  const savedName = localStorage.getItem("patta_game_name");
  const savedEmail = localStorage.getItem("patta_game_email");
  const nameInput = scoreSubmitForm.querySelector('[name="name"]');
  const emailInput = scoreSubmitForm.querySelector('[name="email"]');
  if (savedName) nameInput.value = savedName;
  if (savedEmail) emailInput.value = savedEmail;

  splashPanel.classList.remove("game-over");
  splashPanel.classList.add("score-submit-active");

  // Reset Turnstile for a fresh token if already initialized
  if (window.turnstile && turnstileWidgetId) {
    turnstile.reset(turnstileWidgetId);
    turnstileToken = null;
  }
}

// Clear error when user edits the form
scoreSubmitForm.addEventListener("input", () => {
  scoreSubmitError.textContent = "";
});

scoreSubmitForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  scoreSubmitError.textContent = "";
  btnContinue.disabled = true;

  // Wait for Turnstile token if not ready yet (max 5 seconds)
  if (!turnstileToken && window.turnstile) {
    for (var i = 0; i < 25; i++) {
      await new Promise(function(r) { setTimeout(r, 200); });
      if (turnstileToken) break;
    }
  }

  const formData = new FormData(scoreSubmitForm);
  const name = (formData.get("name") || "").trim();
  const email = (formData.get("email") || "").trim();

  // Client-side validation
  if (!name || name.length > 16) {
    scoreSubmitError.textContent = "NAME MUST BE 1-16 CHARACTERS";
    btnContinue.disabled = false;
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    scoreSubmitError.textContent = "INVALID EMAIL ADDRESS";
    btnContinue.disabled = false;
    return;
  }

  // Save to localStorage for pre-fill
  localStorage.setItem("patta_game_name", name);
  localStorage.setItem("patta_game_email", email);

  try {
    const res = await fetch("/api/submit-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      scoreSubmitError.textContent = (
        data.error || "SUBMISSION FAILED"
      ).toUpperCase();
      btnContinue.disabled = false;
      // Reset Turnstile for retry
      if (window.turnstile && turnstileWidgetId) {
        turnstile.reset(turnstileWidgetId);
        turnstileToken = null;
      }
      return;
    }

    // Store user entry and invalidate leaderboard cache
    localStorage.setItem("patta_game_entry", JSON.stringify(data.userEntry));
    leaderboardLoaded = false;

    // Show leaderboard with user highlight
    showLeaderboard(data.topTen, data.userEntry);
  } catch (err) {
    scoreSubmitError.textContent = "NETWORK ERROR. TRY AGAIN.";
    btnContinue.disabled = false;
  }
});

function showLeaderboard(topTen, userEntry) {
  splashPanel.classList.remove(
    "score-submit-active",
    "game-over",
    "game-active",
    "game-playing",
  );
  canvas.classList.remove("active");
  splashPanel.classList.add("leaderboard-active");
  overlay.classList.add("leaderboard-bg-active");
  renderLeaderboard(topTen, userEntry);
}

function getTrophySvg(rank) {
  var colors = { 1: '#FDDB05', 2: '#C0C0C0', 3: '#CD7F32' };
  var fill = colors[rank];
  if (!fill) return '';
  return '<div class="lb-cell lb-cell-trophy"><svg width="17" height="16" viewBox="0 0 17.4167 15.8333" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13.4583 1.58333V0H3.95833V1.58333H0V5.54167H0.791667V7.125H1.58333V7.91667H2.375V8.70833H3.16667V9.5H3.95833V10.2917H6.33333V11.0833H7.91667V13.4583H4.75V15.8333H12.6667V13.4583H9.5V11.0833H11.0833V10.2917H13.4583V9.5H14.25V8.70833H15.0417V7.91667H15.8333V7.125H16.625V5.54167H17.4167V1.58333H13.4583ZM5.54167 8.70833H3.95833V7.91667H3.16667V7.125H2.375V5.54167H1.58333V3.16667H3.16667V3.95833H3.95833V5.54167H4.75V7.91667H5.54167V8.70833ZM5.54167 5.54167V1.58333H11.875V5.54167H11.0833V7.91667H10.2917V9.5H7.125V7.91667H6.33333V5.54167H5.54167ZM15.0417 5.54167V7.125H14.25V7.91667H13.4583V8.70833H11.875V7.91667H12.6667V6.33333H13.4583V3.95833H14.25V3.16667H15.8333V5.54167H15.0417Z" fill="' + fill + '"/></svg></div>';
}

function buildRowHtml(entry, isUserRow) {
  var trophy = getTrophySvg(entry.rank);
  var arrowSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="11" viewBox="0 0 12 11" fill="none" style="transform:scaleX(-1)"><path d="M6.53711 3.27094H7.62793V6.54144H6.53711V8.72211H4.35742V7.63226H3.26953V2.18011H4.35742V1.09027H6.53711V3.27094ZM3.2666 6.54144H2.17676V5.4516H1.08594V4.36078H2.17676V3.27094H3.2666V6.54144ZM9.80859 6.54144H7.62891V3.27094H9.80859V6.54144ZM10.8994 6.54144H9.80957V3.27094H10.8994V6.54144Z" fill="white"/></svg>';
  var rankDisplay = (isUserRow && entry.rank > 10) ? arrowSvg : entry.rank;
  return '<div class="lb-cell lb-cell-rank">' + rankDisplay + '</div>' +
    '<div class="lb-cell lb-cell-name"><span class="lb-name-text">' + escapeHtml(entry.name) + '</span></div>' +
    trophy +
    '<div class="lb-cell lb-cell-score">' + entry.score + '</div>';
}

const leaderboardHeader = '<div class="leaderboard-table-header"><span class="lb-header-rank">#</span><span class="lb-header-name">Name</span><span class="lb-header-score">Score</span></div>';

function updateLeaderboardGradient() {
  var el = leaderboardOverlay;
  var canScroll = el.scrollHeight > el.clientHeight;
  var atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 5;
  leaderboardGradient.style.opacity = (canScroll && !atBottom) ? '1' : '0';
}

leaderboardGradient.style.opacity = '0'; // hidden by default
leaderboardOverlay.addEventListener('scroll', updateLeaderboardGradient);

function renderLeaderboard(topTen, userEntry) {
  leaderboardRows.innerHTML = leaderboardHeader;

  topTen.forEach(function(entry) {
    var row = document.createElement("div");
    row.className = "leaderboard-row";
    var isUser = userEntry && entry.name === userEntry.name;
    if (isUser) {
      row.classList.add("user-row");
    }
    row.innerHTML = buildRowHtml(entry, isUser);
    leaderboardRows.appendChild(row);
  });

  // If user is outside top 10, add separator + user row
  var userInTopTen = userEntry && topTen.some(function(e) { return e.name === userEntry.name; });
  if (userEntry && !userInTopTen) {
    var sep = document.createElement("div");
    sep.className = "leaderboard-row separator-row";
    leaderboardRows.appendChild(sep);

    var userRow = document.createElement("div");
    userRow.className = "leaderboard-row user-row";
    userRow.innerHTML = buildRowHtml(userEntry, true);
    leaderboardRows.appendChild(userRow);
  }

  // Check if gradient should show after render (short delay to avoid jump)
  setTimeout(updateLeaderboardGradient, 300);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

const ASSETS_TO_LOAD = [
  "assets/patta-logo.png",
  "assets/nike-swoosh.png",
  "assets/pattern-tile.png",
  "assets/tournament-title.png",
  "assets/btn-play.png",
  "assets/btn-signup.png",
  "assets/btn-collection.png",
  "assets/btn-leaderboard.png",
  "assets/soccer-ball.png",
  "assets/bg-level1.jpg",
  "assets/bg-level2.jpg",
  "assets/bg-level3.jpg",
  "assets/bg-level4.jpg",
  "assets/key-space.png",
  "assets/btn-submit.png",
  "assets/patta-nike-marquee.png",
];

let loadedCount = 0;
let loadingComplete = false;
const LOAD_TIMEOUT = 10000; // 10 seconds
const MIN_LOAD_TIME = 2000; // minimum 2 seconds for the loading bar

function preloadAssets() {
  const totalAssets = ASSETS_TO_LOAD.length;
  const failedAssets = new Set();
  const loadStart = Date.now();
  let allAssetsReady = false;

  const timeoutId = setTimeout(() => {
    if (!loadingComplete) {
      loadingComplete = true;
      progressFill.style.width = "100%";
      applyAssetFallbacks(failedAssets);
      startPhase2();
    }
  }, LOAD_TIMEOUT);

  function onAssetDone() {
    if (loadingComplete) return;

    // Animate progress bar based on time elapsed + actual progress
    const realProgress = loadedCount / totalAssets;
    const timeProgress = Math.min((Date.now() - loadStart) / MIN_LOAD_TIME, 1);
    const displayProgress = Math.min(realProgress, timeProgress) * 100;
    progressFill.style.width = displayProgress + "%";

    if (loadedCount >= totalAssets) {
      allAssetsReady = true;
      const elapsed = Date.now() - loadStart;
      const remaining = Math.max(0, MIN_LOAD_TIME - elapsed);

      // Smoothly fill the remaining progress over the remaining time
      if (remaining > 0) {
        progressFill.style.transition = `width ${remaining}ms linear`;
        progressFill.style.width = "100%";
      }

      setTimeout(() => {
        if (!loadingComplete) {
          loadingComplete = true;
          clearTimeout(timeoutId);
          applyAssetFallbacks(failedAssets);
          startPhase2();
        }
      }, remaining);
    }
  }

  // Tick the progress bar forward even while waiting for assets
  const tickInterval = setInterval(() => {
    if (loadingComplete || allAssetsReady) {
      clearInterval(tickInterval);
      return;
    }
    const timeProgress = Math.min((Date.now() - loadStart) / MIN_LOAD_TIME, 1);
    const realProgress = loadedCount / totalAssets;
    const displayProgress = Math.min(realProgress, timeProgress) * 100;
    progressFill.style.width = displayProgress + "%";
  }, 50);

  ASSETS_TO_LOAD.forEach((src) => {
    const img = new Image();
    img.onload = () => {
      loadedCount++;
      onAssetDone();
    };
    img.onerror = () => {
      loadedCount++;
      failedAssets.add(src);
      onAssetDone();
    };
    img.src = src;
  });
}

// Hide broken images for failed asset loads
function applyAssetFallbacks(failedAssets) {
  if (failedAssets.size === 0) return;
  const titleImg = document.querySelector(".tournament-title");
  if (failedAssets.has("assets/tournament-title.png") && titleImg) {
    titleImg.style.display = "none";
  }
  if (failedAssets.has("assets/pattern-tile.png")) {
    splashPanel.style.backgroundImage = "none";
    splashPanel.style.background = "#111";
  }
}

function startPhase2() {
  // Pause 300ms at 100%, then converge
  setTimeout(() => {
    loadingRow.querySelector(".progress-bar").style.opacity = "0";

    setTimeout(() => {
      loadingRow.classList.add("converged");
      // Wait for convergence transition (400ms) to finish
      phase3Timeout = setTimeout(startPhase3, 450);
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
    // Expand panel and move logos outward
    splashPanel.classList.add("visible");
    loadingRow.classList.add("splash-position");

    // Wait for splash expand, then show menu
    setTimeout(startPhase4, 500 + 1500); // 500ms expand + 1500ms hold
  }, 200);
}

function startPhase4() {
  sessionStorage.setItem("patta-loaded", "1");

  // Animate title from center to top
  splashPanel.classList.add("menu-active");

  // Stagger buttons in after title starts moving (300ms delay)
  setTimeout(() => {
    menuButtons.forEach((btn, i) => {
      setTimeout(() => {
        btn.classList.add("visible");
      }, i * 100);
    });

    // Footer after last button
    setTimeout(
      () => {
        menuFooter.classList.add("visible");
      },
      (menuButtons.length - 1) * 100 + 300 + 200,
    );
  }, 300);
}

// Skip to final menu state on tap/space during phases 1-3
function skipToMenu() {
  if (loadingComplete && menuButtons[0].classList.contains("visible")) return;

  loadingComplete = true;
  progressFill.style.width = "100%";
  phase3Started = true;

  // Instantly set all states
  loadingRow.classList.add("converged", "splash-position");
  loadingRow.querySelector(".progress-bar").style.opacity = "0";
  splashPanel.classList.add("visible", "menu-active");

  // Show buttons immediately
  menuButtons.forEach((btn) => btn.classList.add("visible"));
  menuFooter.classList.add("visible");
}

overlay.addEventListener("click", (e) => {
  if (!splashPanel.classList.contains("game-active")) {
    skipToMenu();
  }
});
document.addEventListener("keydown", (e) => {
  if (
    e.code === "Space" &&
    !splashPanel.classList.contains("game-active") &&
    overlay.style.display !== "none"
  ) {
    e.preventDefault();
    skipToMenu();
  }
});

let gameOverTime = 0;
const GAME_OVER_COOLDOWN = 600; // ms before tap-to-retry works

function showGameOver() {
  if (score > highScore) {
    highScore = score;
    localStorage.setItem("keepballup_high", highScore.toString());
  }
  gameOverScore.textContent = score;
  splashPanel.classList.add("game-over");
  gameOverTime = Date.now();
}

function hideGameOver() {
  splashPanel.classList.remove("game-over");
}

// Turnstile calls this global callback when the script finishes loading
window.onTurnstileLoad = function() {
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
};

function startGame() {
  startSession();
  // Show canvas + start overlay inside the panel, hide menu content
  splashPanel.classList.add("game-active");
  canvas.classList.add("active");
  // Cancel any existing game loop to prevent stacking
  if (rafId) cancelAnimationFrame(rafId);
  // Reset frame timer to avoid dt spike
  lastFrameTime = 0;
  // Draw first frame (background + ball) but don't start playing yet
  update();
}

btnPlay.addEventListener("click", (e) => {
  e.stopPropagation(); // Don't trigger skipToMenu
  startGame();
});

// Prevent other menu buttons from triggering skip
document.querySelectorAll(".menu-btn").forEach((btn) => {
  btn.addEventListener("click", (e) => e.stopPropagation());
});

// Submit score button → show submission form
btnSubmitScore.addEventListener("click", (e) => {
  e.stopPropagation();
  showScoreSubmit();
});

function backToMenu() {
  hideGameOver();
  splashPanel.classList.remove("game-active", "game-playing", "score-submit-active", "leaderboard-active");
  canvas.classList.remove("active");
  overlay.classList.remove("leaderboard-bg-active");
  state = "start";
  resetGame();
}

// Back button → return to menu
btnBack.addEventListener("click", (e) => {
  e.stopPropagation();
  leaderboardGradient.style.opacity = '0';
  splashPanel.classList.remove("leaderboard-active");
  overlay.classList.remove("leaderboard-bg-active");
  state = "start";
  resetGame();
});

// Menu leaderboard button → fetch and show leaderboard (no user highlight)
var leaderboardLoaded = false;

btnLeaderboard.addEventListener("click", async (e) => {
  e.stopPropagation();
  leaderboardGradient.style.opacity = '0';
  splashPanel.classList.add("leaderboard-active");
  overlay.classList.add("leaderboard-bg-active");
  leaderboardOverlay.scrollTop = 0;

  // Don't re-fetch if already loaded
  if (leaderboardLoaded) {
    setTimeout(updateLeaderboardGradient, 300);
    return;
  }

  leaderboardRows.innerHTML = leaderboardHeader + '<div class="leaderboard-loading">LOADING...</div>';

  var storedEntry = null;
  try {
    storedEntry = JSON.parse(localStorage.getItem("patta_game_entry"));
  } catch (e) {}

  try {
    const res = await fetch("/api/leaderboard");
    const data = await res.json();
    renderLeaderboard(data.topTen, storedEntry);
    leaderboardLoaded = true;
  } catch (err) {
    leaderboardRows.innerHTML = leaderboardHeader + '<div class="leaderboard-loading">FAILED TO LOAD</div>';
  }
});

document.addEventListener("keydown", (e) => {
  // Enter = Play Game (from menu) or Submit Score (game over)
  if (e.code === "Enter") {
    if (state === "over" && splashPanel.classList.contains("game-over")) {
      btnSubmitScore.click();
    } else if (
      !splashPanel.classList.contains("game-active") &&
      menuButtons[0].classList.contains("visible")
    ) {
      startGame();
    }
  }
  // Escape = back to menu
  if (e.code === "Escape" && splashPanel.classList.contains("game-active")) {
    backToMenu();
  }
});

// Skip loading animation on repeat visits (session)
if (sessionStorage.getItem("patta-loaded")) {
  overlay.classList.add("skip-intro");
  // Set final state instantly (no transitions on inner elements)
  loadingComplete = true;
  phase3Started = true;
  progressFill.style.width = "100%";
  loadingRow.classList.add("converged");
  loadingRow.querySelector(".progress-bar").style.opacity = "0";
  splashPanel.classList.add("menu-active");
  menuButtons.forEach((btn) => btn.classList.add("visible"));
  menuFooter.classList.add("visible");
  // Animate panel scale + logo outward slide on next frame
  requestAnimationFrame(() => {
    splashPanel.classList.add("visible");
    loadingRow.classList.add("splash-position");
  });
} else {
  preloadAssets();
}

// Game constants
const GRAVITY = 0.5;
const KICK_FORCE = -12;
const BALL_SIZE = 24;
const GROUND_Y = CSS_H - 40;

// Hit zone: full-width rectangle, shrinks in height toward a 6px line
const DEBUG_HARD_MODE = false; // SET TO true TO TEST ENDGAME DIFFICULTY
const ZONE_CENTER_Y_BASE = CSS_H * 0.455;
const ZONE_HEIGHT_START = DEBUG_HARD_MODE ? 10 : 400;
const ZONE_HEIGHT_FLOOR = 40; // initial shrink target
const ZONE_SHRINK_SCORE = 100;
const ZONE_ENDLESS_SHRINK = 0.15; // px per point after ZONE_SHRINK_SCORE
const ZONE_BOB_AMPLITUDE = 60; // max vertical bob in px at smallest zone
const ZONE_BOB_SPEED_BASE = 0.02; // base oscillation speed (same as original)
const ZONE_BOB_SPEED_PER_LEVEL = 0.003; // gentle increase per level
let zoneBobPhase = 0;
let ZONE_CENTER_Y = ZONE_CENTER_Y_BASE;

// ── LEVEL SYSTEM ──
const LEVELS = [
  {
    name: "TRAINING FIELD",
    threshold: 0,
    bgSrc: "assets/bg-level1.jpg",
    bgImg: null,
  },
  {
    name: "LOCAL STADIUM",
    threshold: 30,
    bgSrc: "assets/bg-level2.jpg",
    bgImg: null,
  },
  {
    name: "BIG STADIUM",
    threshold: 70,
    bgSrc: "assets/bg-level3.jpg",
    bgImg: null,
  },
  {
    name: "WORLD CUP",
    threshold: 120,
    bgSrc: "assets/bg-level4.jpg",
    bgImg: null,
  },
];

// Preload level backgrounds
LEVELS.forEach((lv) => {
  const img = new Image();
  img.src = lv.bgSrc;
  lv.bgImg = img;
});

let currentLevel = 0;
let levelTransition = false;
let levelTransTimer = 0;
const LEVEL_TRANS_DURATION = 90;

function getLevel(s) {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (s >= LEVELS[i].threshold) return i;
  }
  return 0;
}

// Game state
const BALL_START_Y = CSS_H * 0.76; // Figma: ball at ~76% from top
let ball = { x: CSS_W / 2, y: BALL_START_Y, vy: 0, vx: 0, angle: 0, spin: 0 };
let score = 0;
let highScore = parseInt(localStorage.getItem("keepballup_high") || "0");
let state = "start"; // 'start', 'playing', 'over', 'leveltransition'
let particles = [];
let screenShake = 0;
let canKick = true; // only one kick per ball rise
let wasGoingDown = false; // track when ball starts falling

// Hit zone (rectangular)
let zoneHeight = ZONE_HEIGHT_START;

// 8-bit color palette
const COLORS = {
  bg: "#0f0e17",
  ground: "#2e7d32",
  groundDark: "#1b5e20",
  ball: "#e94560",
  ballHighlight: "#ff6b81",
  text: "#fffffe",
  textShadow: "#0f0e17",
  score: "#f9d71c",
  zone: "rgba(0, 210, 211, 0.15)",
  zoneBorder: "#00d2d3",
  zoneActive: "rgba(0, 210, 211, 0.35)",
  zoneLocked: "rgba(255, 50, 50, 0.1)",
  zoneBorderLocked: "#ff4444",
  particle: ["#000000", "#ffffff", "#222222", "#dddddd", "#666666"],
};

function resetGame() {
  score = 0;
  currentLevel = 0;
  ball = { x: CSS_W / 2, y: BALL_START_Y, vy: 0, vx: 0, angle: 0, spin: 0 };
  canKick = true;
  wasGoingDown = false;
  zoneHeight = ZONE_HEIGHT_START;
  zoneBobPhase = 0;
  ZONE_CENTER_Y = ZONE_CENTER_Y_BASE;
  particles = [];
}

function ballInZone() {
  const zoneTop = ZONE_CENTER_Y - zoneHeight / 2;
  const zoneBottom = ZONE_CENTER_Y + zoneHeight / 2;
  return ball.y >= zoneTop && ball.y <= zoneBottom;
}

function updateZone(zoneDt) {
  zoneDt = zoneDt || 1;
  let progress = DEBUG_HARD_MODE ? 1 : Math.min(score / ZONE_SHRINK_SCORE, 1);
  var baseHeight = ZONE_HEIGHT_START - (ZONE_HEIGHT_START - ZONE_HEIGHT_FLOOR) * progress;
  // Keep shrinking slowly past score 100 — no plateau
  var endlessShrink = score > ZONE_SHRINK_SCORE ? (score - ZONE_SHRINK_SCORE) * ZONE_ENDLESS_SHRINK : 0;
  zoneHeight = Math.max(4, baseHeight - endlessShrink);

  // Bob the zone — speed increases per level + gradual creep after score 80
  var extraSpeed = score > 60 ? (score - 60) * 0.0003 : 0;
  var bobSpeed = DEBUG_HARD_MODE ? 0.06 : ZONE_BOB_SPEED_BASE + (currentLevel * ZONE_BOB_SPEED_PER_LEVEL) + extraSpeed;
  zoneBobPhase += bobSpeed * zoneDt;
  const bobAmount = ZONE_BOB_AMPLITUDE * progress;
  ZONE_CENTER_Y = ZONE_CENTER_Y_BASE + Math.sin(zoneBobPhase) * bobAmount;
}

// Draw an 8-bit style circle (pixelated)
function drawPixelCircle(cx, cy, r, color) {
  ctx.fillStyle = color;
  for (let y = -r; y <= r; y += 2) {
    for (let x = -r; x <= r; x += 2) {
      if (x * x + y * y <= r * r) {
        ctx.fillRect(Math.round(cx + x), Math.round(cy + y), 2, 2);
      }
    }
  }
}

function drawText(text, x, y, size, color, align) {
  ctx.textAlign = align || "center";
  ctx.textBaseline = "middle";
  ctx.font = `${size}px 'Neue Pixel Grotesk', monospace`;
  ctx.fillStyle = color || COLORS.text;
  ctx.fillText(text, x, y);
}

function spawnParticles(x, y) {
  for (let i = 0; i < 8; i++) {
    particles.push({
      x: x,
      y: y,
      vx: (Math.random() - 0.5) * 6,
      vy: (Math.random() - 0.5) * 6,
      life: 20 + Math.random() * 10,
      color:
        COLORS.particle[Math.floor(Math.random() * COLORS.particle.length)],
      size: 2 + Math.random() * 3,
    });
  }
}

// Handle input
function kick() {
  if (state === "start") {
    state = "playing";
    splashPanel.classList.add("game-playing");
    resetGame();
    // First kick is free — in hard mode start ball at zone center
    if (DEBUG_HARD_MODE) ball.y = ZONE_CENTER_Y_BASE;
    ball.vy = KICK_FORCE;
    ball.vx = (Math.random() - 0.5) * 4;
    ball.spin = ball.vx * 0.08;
    score = 1;
    canKick = false;
    screenShake = 4;
    spawnParticles(ball.x, ball.y);
    haptic("success", score);
    return;
  }

  if (state === "playing") {
    if (!canKick) return; // already used your one tap

    // One tap per fall — used up whether in zone or not
    canKick = false;

    if (!ballInZone()) {
      // Tapped outside zone — game over!
      state = "over";
      showGameOver();
      haptic("error");
      return;
    }

    ball.vy = KICK_FORCE;
    ball.vx = (Math.random() - 0.5) * 4;
    ball.spin = ball.vx * 0.08;
    score++;
    screenShake = 4;
    spawnParticles(ball.x, ball.y);
    haptic("success", score);
    updateZone();

    // Check for level up
    const newLevel = getLevel(score);
    if (newLevel > currentLevel) {
      currentLevel = newLevel;
      levelTransTimer = LEVEL_TRANS_DURATION; // show banner
      haptic([
        { duration: 80, intensity: 1 },
        { delay: 40, duration: 120, intensity: 1 },
      ]);
    }
    return;
  }

  if (state === "over") {
    // Don't auto-restart — user must go through submit flow
    return;
  }
}

document.addEventListener("keydown", function (e) {
  if (e.code === "Space") {
    if (!splashPanel.classList.contains("game-active")) return;
    e.preventDefault();
    kick();
  }
});

canvas.addEventListener("touchstart", function (e) {
  e.preventDefault();
  kick();
});

canvas.addEventListener("mousedown", function (e) {
  kick();
});

// Draw the hit zone (full-width rectangle, shrinks to 4px line)
function drawZone() {
  const zoneTop = ZONE_CENTER_Y - zoneHeight / 2;

  // Green fill — visible but not opaque
  ctx.fillStyle = "rgba(0, 255, 0, 0.12)";
  ctx.fillRect(0, zoneTop, CSS_W, zoneHeight);

  // Bright neon green border lines (matching Figma)
  ctx.strokeStyle = "#00ff00";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, zoneTop);
  ctx.lineTo(CSS_W, zoneTop);
  ctx.moveTo(0, zoneTop + zoneHeight);
  ctx.lineTo(CSS_W, zoneTop + zoneHeight);
  ctx.stroke();
}

function drawBackground() {
  const lv = LEVELS[currentLevel];
  const img = lv.bgImg;

  if (img && img.complete && img.naturalWidth > 0) {
    // Draw Figma background scaled to cover the canvas (object-cover)
    ctx.imageSmoothingEnabled = false;
    const scale = Math.max(CSS_W / img.naturalWidth, CSS_H / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    const x = (CSS_W - w) / 2;
    const y = (CSS_H - h) / 2;
    ctx.drawImage(img, x, y, w, h);
  } else {
    // Fallback: solid black
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, CSS_W, CSS_H);
  }
}

// ── LEVEL TRANSITION SCREEN ──
function drawLevelTransition() {
  levelTransTimer++;
  const lv = LEVELS[currentLevel];

  ctx.fillStyle = "#0f0e17";
  ctx.fillRect(0, 0, CSS_W, CSS_H);

  const progress = levelTransTimer / LEVEL_TRANS_DURATION;

  // Flash effect
  if (levelTransTimer < 10) {
    ctx.fillStyle = `rgba(255,255,255,${0.5 - levelTransTimer * 0.05})`;
    ctx.fillRect(0, 0, CSS_W, CSS_H);
  }

  ctx.globalAlpha = Math.min(levelTransTimer / 15, 1);

  drawText("NEXT LEVEL!", CSS_W / 2, CSS_H / 2 - 60, 32, "#f9d71c");
  drawText(lv.name, CSS_W / 2, CSS_H / 2, 28, "#ffffff");
  drawText("Score: " + score, CSS_W / 2, CSS_H / 2 + 50, 20, "#00d2d3");

  // Stars animation
  for (let i = 0; i < 5; i++) {
    const angle = Date.now() * 0.002 + (i * Math.PI * 2) / 5;
    const radius = 80 + Math.sin(Date.now() * 0.003) * 10;
    const sx = CSS_W / 2 + Math.cos(angle) * radius;
    const sy = CSS_H / 2 - 30 + Math.sin(angle) * radius;
    drawText("★", sx, sy, 16, "#f9d71c");
  }

  ctx.globalAlpha = 1;

  if (levelTransTimer >= LEVEL_TRANS_DURATION) {
    state = "playing";
    levelTransition = false;
    levelTransTimer = 0;
    // Resume with a free kick
    ball.vy = KICK_FORCE;
    ball.vx = (Math.random() - 0.5) * 3;
    ball.spin = ball.vx * 0.08;
    canKick = false;
    wasGoingDown = false;
  }
}

// Load marquee strip
const marqueeImg = new Image();
marqueeImg.src = "assets/patta-nike-marquee.png";
const MARQUEE_H = 56;
const MARQUEE_Y = CSS_H * 0.55 - 2;
let marqueeX = 0;

function drawMarquee(marqueeDt) {
  if (!marqueeImg.complete) return;
  const imgW = (marqueeImg.width / marqueeImg.height) * MARQUEE_H;
  marqueeX -= 1 * marqueeDt; // scroll speed
  if (marqueeX <= -imgW) marqueeX += imgW;
  let x = marqueeX;
  while (x < CSS_W) {
    ctx.drawImage(marqueeImg, x, MARQUEE_Y, imgW, MARQUEE_H);
    x += imgW;
  }
}

// Load soccer ball from Figma asset
const soccerBallImg = new Image();
soccerBallImg.src = "assets/soccer-ball.png";

function drawBall() {
  let shadowScale = 1 - (GROUND_Y - ball.y) / CSS_H;
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(
    ball.x - (BALL_SIZE * shadowScale) / 2,
    GROUND_Y + 4,
    BALL_SIZE * shadowScale,
    4,
  );

  // Draw the soccer ball sprite rotated by velocity
  ctx.save();
  ctx.translate(Math.round(ball.x), Math.round(ball.y));
  ctx.rotate(ball.angle);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    soccerBallImg,
    -BALL_SIZE,
    -BALL_SIZE,
    BALL_SIZE * 2,
    BALL_SIZE * 2,
  );
  ctx.restore();
}

function updateParticles(pDt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    let p = particles[i];
    p.x += p.vx * pDt;
    p.y += p.vy * pDt;
    p.life -= pDt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  for (let p of particles) {
    ctx.fillStyle = p.color;
    let s = Math.ceil(p.size * (p.life / 30));
    ctx.fillRect(Math.round(p.x), Math.round(p.y), s, s);
  }
}

// Main game loop
let rafId = null;
let lastFrameTime = 0;
const TARGET_DT = 1000 / 60; // 16.67ms — physics tuned for 60fps
function update(timestamp) {
  if (!timestamp) timestamp = performance.now();
  if (!lastFrameTime) lastFrameTime = timestamp;
  const rawDt = timestamp - lastFrameTime;
  lastFrameTime = timestamp;
  // dt = how many 60fps frames worth of time elapsed (1.0 at 60fps, ~0.5 at 120fps)
  const dt = Math.min(rawDt / TARGET_DT, 3); // cap at 3× to avoid spiral after tab-switch

  let shakeX = 0,
    shakeY = 0;
  if (screenShake > 0) {
    shakeX = (Math.random() - 0.5) * screenShake;
    shakeY = (Math.random() - 0.5) * screenShake;
    screenShake *= Math.pow(0.8, dt);
    if (screenShake < 0.5) screenShake = 0;
  }

  ctx.save();
  ctx.translate(shakeX, shakeY);

  drawBackground();
  drawMarquee(dt);

  if (state === "start") {
    drawBall();
  }

  if (state === "playing") {
    // Physics (scaled by dt for frame-rate independence)
    ball.vy += GRAVITY * dt;
    // Clamp velocity to prevent runaway speed
    ball.vy = Math.max(-18, Math.min(18, ball.vy));
    ball.vx = Math.max(-10, Math.min(10, ball.vx));
    ball.y += ball.vy * dt;
    ball.x += ball.vx * dt;

    // Spin physics: angular velocity with air friction
    ball.angle += ball.spin * dt;
    ball.spin *= Math.pow(0.997, dt); // air drag on spin

    // Update zone bob every frame
    updateZone(dt);

    // Track ball direction: only re-enable kick after ball went UP then starts falling
    if (ball.vy < -2) {
      // Ball is going up with force — mark it
      wasGoingDown = false;
    }
    if (!wasGoingDown && ball.vy > 0) {
      // Ball just peaked and started falling — allow one new tap
      wasGoingDown = true;
      canKick = true;
    }

    // Bounce off walls — reverse spin on impact
    if (ball.x < BALL_SIZE) {
      ball.x = BALL_SIZE;
      ball.vx = -ball.vx * 0.8;
      ball.spin = -ball.spin * 0.6 + ball.vy * 0.03;
      haptic("nudge");
    }
    if (ball.x > CSS_W - BALL_SIZE) {
      ball.x = CSS_W - BALL_SIZE;
      ball.vx = -ball.vx * 0.8;
      ball.spin = -ball.spin * 0.6 - ball.vy * 0.03;
      haptic("nudge");
    }

    // Bounce off ceiling
    if (ball.y < BALL_SIZE) {
      ball.y = BALL_SIZE;
      ball.vy = Math.abs(ball.vy) * 0.5;
      ball.spin += ball.vx * 0.04;
      haptic("nudge");
    }

    // Ball fell below zone = game over (grace period for first 2 kicks)
    if (score > 2) {
      const zoneBottom = ZONE_CENTER_Y + zoneHeight / 2;
      if (ball.y > zoneBottom) {
        state = "over";
        showGameOver();
        haptic("error");
      }
    }

    // Clamp to ground
    if (ball.y >= GROUND_Y - BALL_SIZE) {
      ball.y = GROUND_Y - BALL_SIZE;
      if (state !== "over") {
        state = "over";
        showGameOver();
      }
    }

    drawZone();

    // Level-up banner (drawn behind ball and particles)
    if (levelTransTimer > 0) {
      levelTransTimer -= dt;
      if (levelTransTimer > 0) {
        const alpha = Math.min(levelTransTimer / 30, 1);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "rgba(0,0,0,0.8)";
        ctx.fillRect(0, CSS_H / 2 - 60, CSS_W, 120);
        drawText("NEXT LEVEL!", CSS_W / 2, CSS_H / 2 - 15, 28, "#f9d71c");
        drawText(
          LEVELS[currentLevel].name,
          CSS_W / 2,
          CSS_H / 2 + 18,
          20,
          "#ffffff",
        );
        ctx.globalAlpha = 1;
      }
    }

    drawBall();
    updateParticles(dt);
    drawParticles();

    // Score — bottom-left, 63px white
    drawText(score.toString(), 20, CSS_H - 40, 63, "#ffffff", "left");
  }

  if (state === "over") {
    // Just draw last frame — CSS filter handles desaturation
    drawBall();
  }

  ctx.restore();
  rafId = requestAnimationFrame(update);
}

// ── LOGO PARALLAX (desktop only) ──
if (window.matchMedia('(pointer: fine)').matches) {
  var logoPatta = document.querySelector('.loading-row .logo-patta');
  var logoNike = document.querySelector('.loading-row .logo-nike');
  document.addEventListener('mousemove', function(e) {
    var cx = (e.clientX / window.innerWidth - 0.5) * 2;  // -1 to 1
    var cy = (e.clientY / window.innerHeight - 0.5) * 2;  // -1 to 1
    var pattaX = cx * -8;
    var pattaY = cy * -5;
    var nikeX = cx * 8;
    var nikeY = cy * 5;
    // Only apply if logos are in splash position (visible on sides)
    if (loadingRow.classList.contains('splash-position')) {
      logoPatta.style.translate = pattaX + 'px ' + pattaY + 'px';
      logoNike.style.translate = nikeX + 'px ' + nikeY + 'px';
    }
  });
}

// Game loop is started by the loading overlay when "Play Game" is clicked
