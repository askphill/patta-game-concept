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

// ── MUTE STATE ──
// Persisted across sessions. Gates both SFX and background music.
let muted = (() => {
  try {
    const stored = localStorage.getItem("muted");
    return stored === null ? true : stored === "1";
  } catch { return true; }
})();

// ── SOUND EFFECTS ──
// Web Audio API: decode once, polyphonic playback with no per-clip load lag.
const KICK_SOUND_SRCS = ["assets/kick-1.wav", "assets/kick-2.wav", "assets/kick-3.wav"];
const BONUS_SOUND_SRCS = ["assets/bonus-hit.mp3"];
const LEVEL_UP_SOUND_SRCS = ["assets/level-up.mp3"];
const DEATH_SOUND_SRCS = ["assets/death.mp3"];
const KICK_VOLUME = 0.35;
const BONUS_VOLUME = 0.55;
const LEVEL_UP_VOLUME = 0.6;
const DEATH_VOLUME = 0.65;
const AudioCtxCtor = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
const sfxBuffers = { kick: [], bonus: [], levelUp: [], death: [] };
let sfxLoading = false;

function loadSfxBuffers() {
  if (sfxLoading || !audioCtx) return;
  sfxLoading = true;
  const groups = [
    { key: "kick", srcs: KICK_SOUND_SRCS },
    { key: "bonus", srcs: BONUS_SOUND_SRCS },
    { key: "levelUp", srcs: LEVEL_UP_SOUND_SRCS },
    { key: "death", srcs: DEATH_SOUND_SRCS },
  ];
  groups.forEach(({ key, srcs }) => {
    srcs.forEach((src, i) => {
      fetch(src)
        .then((r) => r.arrayBuffer())
        .then((buf) => audioCtx.decodeAudioData(buf))
        .then((decoded) => {
          sfxBuffers[key][i] = decoded;
        })
        .catch(() => {});
    });
  });
}

// Browsers require a user gesture to start an AudioContext; call this from any tap/click.
function ensureAudio() {
  if (!AudioCtxCtor) return;
  if (!audioCtx) audioCtx = new AudioCtxCtor();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  loadSfxBuffers();
}

function playSfx(group, volume) {
  if (muted) return;
  ensureAudio();
  const bank = sfxBuffers[group];
  if (!audioCtx || !bank || !bank.length) return;
  const buf = bank[Math.floor(Math.random() * bank.length)];
  if (!buf) return;
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const gain = audioCtx.createGain();
  gain.gain.value = volume;
  src.connect(gain).connect(audioCtx.destination);
  src.start(0);
}

function playKickSound() { playSfx("kick", KICK_VOLUME); }
function playBonusSound() { playSfx("bonus", BONUS_VOLUME); }
function playLevelUpSound() { playSfx("levelUp", LEVEL_UP_VOLUME); }
function playDeathSound() { playSfx("death", DEATH_VOLUME); }

// ── BACKGROUND MUSIC ──
// Lazy-init: don't fetch the 2MB MP3 until the user makes a gesture.
// iOS Safari aggressively buffers Audio() with preload="auto", which
// otherwise dominates first-load time on cellular.
let bgMusic = null;
let musicStarted = false;
function ensureBgMusic() {
  if (bgMusic) return bgMusic;
  bgMusic = new Audio("assets/music-victory-lap.mp3");
  bgMusic.loop = true;
  bgMusic.volume = 0.25;
  bgMusic.muted = muted;
  return bgMusic;
}
function startMusic() {
  if (musicStarted) return;
  ensureBgMusic().play().then(() => { musicStarted = true; }).catch(() => {});
}
// Browsers block audio until a user gesture; unlock the AudioContext on the first one,
// but don't start music automatically — it only starts when the user presses Play.
function primeOnFirstGesture() {
  ensureAudio();
  window.removeEventListener("pointerdown", primeOnFirstGesture);
  window.removeEventListener("keydown", primeOnFirstGesture);
}
window.addEventListener("pointerdown", primeOnFirstGesture);
window.addEventListener("keydown", primeOnFirstGesture);

// ── MUTE TOGGLE UI ──
const soundToggleBtn = document.querySelector(".sound-toggle");
const soundToggleIcon = document.querySelector(".sound-toggle-icon");
function applyMuteState() {
  if (bgMusic) bgMusic.muted = muted;
  if (soundToggleIcon) {
    soundToggleIcon.src = muted ? "assets/icon-sound-off.png" : "assets/icon-sound-on.png";
  }
  if (soundToggleBtn) {
    soundToggleBtn.setAttribute("aria-pressed", muted ? "true" : "false");
    soundToggleBtn.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
  }
}
function setMuted(next) {
  muted = !!next;
  try { localStorage.setItem("muted", muted ? "1" : "0"); } catch {}
  applyMuteState();
  if (!muted) startMusic();
}
applyMuteState();
if (soundToggleBtn) {
  soundToggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setMuted(!muted);
  });
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
const btnCollection = document.querySelector(".btn-collection");
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
const btnBack = document.querySelector(".leaderboard-overlay .btn-back");
const btnLeaderboard = document.querySelector(".btn-leaderboard");
const btnSignup = document.querySelector(".btn-signup");
const subscribeOverlay = document.querySelector(".subscribe-overlay");
const subscribeForm = document.querySelector(".subscribe-form");
const subscribeError = document.querySelector(".subscribe-error");
const btnSubscribeSubmit = document.querySelector(".btn-subscribe-submit");
const btnBackSubscribe = document.querySelector(".btn-back-subscribe");

let currentSessionId = null;
let currentSessionSecret = null;

function encodeScores(score, baseScore, secret) {
  const buf = new Uint8Array(8);
  buf[0] = (score >>> 24) & 0xff; buf[1] = (score >>> 16) & 0xff;
  buf[2] = (score >>> 8) & 0xff;  buf[3] = score & 0xff;
  buf[4] = (baseScore >>> 24) & 0xff; buf[5] = (baseScore >>> 16) & 0xff;
  buf[6] = (baseScore >>> 8) & 0xff;  buf[7] = baseScore & 0xff;
  for (var i = 0; i < 8; i++) {
    buf[i] ^= parseInt(secret.slice((i % 8) * 2, (i % 8) * 2 + 2), 16);
  }
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}
let turnstileToken = null;
let turnstileWidgetId = null;
let turnstileSubscribeToken = null;
let turnstileSubscribeWidgetId = null;

// Lazy-load the Turnstile script — it's a third-party origin (~30KB + DNS/TLS),
// only needed when the user opens the score-submit or subscribe form.
let turnstileScriptInjected = false;
function loadTurnstile() {
  if (turnstileScriptInjected) return;
  turnstileScriptInjected = true;
  const s = document.createElement("script");
  s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad";
  s.async = true;
  s.defer = true;
  document.head.appendChild(s);
}

async function startSession() {
  try {
    const res = await fetch("/api/start-session", { method: "POST" });
    const data = await res.json();
    currentSessionId = data.sessionId;
    currentSessionSecret = data.secret;
  } catch (e) {
    currentSessionId = null;
    currentSessionSecret = null;
  }
}

function showScoreSubmit() {
  // Pause the game loop while the form is open — Safari can't type smoothly at 60fps canvas
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

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

  loadTurnstile();
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

  // Wait for Turnstile to load + issue a token (max 5 seconds).
  // Script is lazy-loaded when the form opens, so it may still be in flight here.
  if (!turnstileToken) {
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
        n: name,
        e: email,
        _s: encodeScores(score, baseScore, currentSessionSecret),
        sid: currentSessionId,
        t: turnstileToken,
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

    // Reset the form so Safari doesn't show the "unsaved changes" beforeunload prompt
    scoreSubmitForm.reset();

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
  "assets/key-space.png",
  "assets/btn-submit.png",
  "assets/patta-nike-marquee.png",
  "assets/unite-logo.png",
  "assets/bg-menu.png",
];

let loadedCount = 0;
let loadingComplete = false;
const LOAD_TIMEOUT = 10000; // 10 seconds
const MIN_LOAD_TIME = 600; // floor for the loading bar so the fill is visible

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
    setTimeout(startPhase4, 500 + 500); // 500ms expand + 500ms hold
  }, 200);
}

// Warm the cache for assets that aren't needed for first paint but cause
// visible flashes when the user navigates to them (leaderboard background,
// later level backgrounds, walker sprites). Idempotent.
let secondaryPrefetched = false;
function prefetchSecondaryAssets() {
  if (secondaryPrefetched) return;
  secondaryPrefetched = true;
  // Most likely next click — load first
  const sky = new Image();
  sky.src = "assets/bg-leaderboard-sky.jpg";
  // Game progression assets — by the time the player reaches level 2 these
  // should be in the browser cache.
  for (let i = 1; i < LEVELS.length; i++) {
    ensureLevelBg(i);
    ensureWalkerImage(i);
  }
}

function startPhase4() {
  sessionStorage.setItem("patta-loaded", "1");
  prefetchSecondaryAssets();

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
  prefetchSecondaryAssets();
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
  playDeathSound();
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
  turnstileSubscribeWidgetId = turnstile.render('#turnstile-subscribe-container', {
    sitekey: TURNSTILE_SITE_KEY,
    callback: function(token) {
      turnstileSubscribeToken = token;
    },
    'error-callback': function() {
      turnstileSubscribeToken = null;
    },
    size: 'invisible',
  });
};

function startGame() {
  startSession();
  startMusic();
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
  ensureAudio(); // unlock + start preloading kick sounds while the player is on the splash
  startGame();
});

// Prevent other menu buttons from triggering skip
document.querySelectorAll(".menu-btn").forEach((btn) => {
  btn.addEventListener("click", (e) => e.stopPropagation());
});

// Collection button → open Patta x Nike Mercurial Vapor 16 page
btnCollection.addEventListener("click", (e) => {
  e.stopPropagation();
  window.open("https://patta.nl/pages/patta-x-nike-mercurial-vapor-16", "_blank", "noopener");
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

// ── SUBSCRIBE OVERLAY ──
function showSubscribe() {
  subscribeOverlay.classList.remove("success-state");
  subscribeError.textContent = "";
  btnSubscribeSubmit.disabled = false;

  // Pre-fill from localStorage / score-submit history
  var savedFirstName = localStorage.getItem("patta_subscribe_first_name");
  var savedEmail = localStorage.getItem("patta_subscribe_email") || localStorage.getItem("patta_game_email");
  var firstNameInput = subscribeForm.querySelector('[name="firstName"]');
  var emailInput = subscribeForm.querySelector('[name="email"]');
  firstNameInput.value = savedFirstName || "";
  emailInput.value = savedEmail || "";

  splashPanel.classList.add("subscribe-active");

  loadTurnstile();
  if (window.turnstile && turnstileSubscribeWidgetId) {
    turnstile.reset(turnstileSubscribeWidgetId);
    turnstileSubscribeToken = null;
  }
}

function hideSubscribe() {
  splashPanel.classList.remove("subscribe-active");
}

btnSignup.addEventListener("click", (e) => {
  e.stopPropagation();
  showSubscribe();
});

btnBackSubscribe.addEventListener("click", (e) => {
  e.stopPropagation();
  hideSubscribe();
});

subscribeForm.addEventListener("input", () => {
  subscribeError.textContent = "";
});

subscribeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  subscribeError.textContent = "";
  btnSubscribeSubmit.disabled = true;

  // Wait for Turnstile to load + issue a token (max 5 seconds).
  if (!turnstileSubscribeToken) {
    for (var i = 0; i < 25; i++) {
      await new Promise(function(r) { setTimeout(r, 200); });
      if (turnstileSubscribeToken) break;
    }
  }

  var formData = new FormData(subscribeForm);
  var firstName = (formData.get("firstName") || "").trim();
  var email = (formData.get("email") || "").trim();

  if (!firstName || firstName.length > 32) {
    subscribeError.textContent = "FIRST NAME MUST BE 1-32 CHARACTERS";
    btnSubscribeSubmit.disabled = false;
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    subscribeError.textContent = "INVALID EMAIL ADDRESS";
    btnSubscribeSubmit.disabled = false;
    return;
  }

  localStorage.setItem("patta_subscribe_first_name", firstName);
  localStorage.setItem("patta_subscribe_email", email);

  try {
    const res = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName,
        email,
        turnstileToken: turnstileSubscribeToken,
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      subscribeError.textContent = (data.error || "SUBSCRIPTION FAILED").toUpperCase();
      btnSubscribeSubmit.disabled = false;
      if (window.turnstile && turnstileSubscribeWidgetId) {
        turnstile.reset(turnstileSubscribeWidgetId);
        turnstileSubscribeToken = null;
      }
      return;
    }

    subscribeOverlay.classList.add("success-state");
  } catch (err) {
    subscribeError.textContent = "NETWORK ERROR. TRY AGAIN.";
    btnSubscribeSubmit.disabled = false;
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
  // Animate panel scale + logo outward slide on next frame.
  // Also kick off the secondary asset prefetch here — by the time rAF fires,
  // module evaluation has finished and LEVELS / ensureWalkerImage exist.
  // Calling prefetchSecondaryAssets synchronously here would hit the TDZ
  // for the LEVELS const, abort module init, and leave rafId etc. uninitialized.
  requestAnimationFrame(() => {
    splashPanel.classList.add("visible");
    loadingRow.classList.add("splash-position");
    prefetchSecondaryAssets();
  });
} else {
  preloadAssets();
}

// Game constants
const GRAVITY = 0.5;
const KICK_FORCE = -12;
const BALL_SIZE = 24;
const GROUND_Y = CSS_H - 40;

// Hit zone: full-width rectangle, shrinks in height toward a 16px line
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
    threshold: 60,
    bgSrc: "assets/bg-level3.jpg",
    bgImg: null,
  },
  {
    name: "WORLD CUP",
    threshold: 110,
    bgSrc: "assets/bg-level4.jpg",
    bgImg: null,
  },
];

// Lazy-load level backgrounds. Only level 0 starts loading immediately;
// higher levels load when the player approaches them, to keep first paint light.
function ensureLevelBg(idx) {
  const lv = LEVELS[idx];
  if (!lv || lv.bgImg) return;
  const img = new Image();
  img.src = lv.bgSrc;
  lv.bgImg = img;
}
ensureLevelBg(0);

let currentLevel = 0;
let levelTransition = false;
let levelTransTimer = 0;
const LEVEL_TRANS_DURATION = 90;
let levelFlashTimer = 0; // white screen-flash on level up
const LEVEL_FLASH_DURATION = 22;

function getLevel(s) {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (s >= LEVELS[i].threshold) return i;
  }
  return 0;
}

// Game state
const BALL_START_Y = CSS_H * 0.76; // Figma: ball at ~76% from top
let ball = { x: CSS_W / 2, y: BALL_START_Y, vy: 0, vx: 0, angle: 0, spin: 0 };
let baseScore = 0; // drives difficulty
let bonusScore = 0; // bonus points from logo hits
let score = 0; // displayScore = baseScore + bonusScore
let highScore = parseInt(localStorage.getItem("keepballup_high") || "0");
let state = "start"; // 'start', 'playing', 'over', 'leveltransition'
let particles = [];
let screenShake = 0;
let canKick = true; // only one kick per ball rise
let wasGoingDown = false; // track when ball starts falling

// Bonus logo state
const bonusPattaImg = new Image();
bonusPattaImg.src = "assets/patta-logo.png";
const bonusUniteImg = new Image();
bonusUniteImg.src = "assets/unite-logo.png";

const BONUS_LOGO_W = 50;
const BONUS_LOGO_H = 30;
let bonusLogo = { active: false, x: 0, y: 0, alpha: 0, type: 'patta', dir: 1, speed: 2, points: 10 };
let bonusText = { active: false, x: 0, y: 0, alpha: 0, scale: 1, text: '+10' };
let lastBonusKick = 0; // track when last UNITE bonus spawned
let scorePulse = 0; // pulse timer for score animation on bonus hit
let nextUniteKick = 15 + Math.floor(Math.random() * 11); // first UNITE at 15-25 kicks

// Wind system
let wind = { active: false, dir: 0, force: 0, timer: 0, warningTimer: 0 };
let nextWindKick = 30 + Math.floor(Math.random() * 21); // first wind at 25-40 kicks
var windParticles = [];

// Storm system (rain + thunder) — rare, 1-2 per game
let storm = { active: false, timer: 0, flashTimer: 0, flashAlpha: 0 };
// Storm spawns once per level at a random point
var nextStormKick = 35 + Math.floor(Math.random() * 15); // first storm in level 1, never before kick 10
var stormsThisLevel = 0;
var rainDrops = [];
var nextWalkerKick = 12 + Math.floor(Math.random() * 9);

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
  baseScore = 0;
  bonusScore = 0;
  score = 0;
  currentLevel = 0;
  ball = { x: CSS_W / 2, y: BALL_START_Y, vy: 0, vx: 0, angle: 0, spin: 0 };
  canKick = true;
  wasGoingDown = false;
  zoneHeight = ZONE_HEIGHT_START;
  zoneBobPhase = 0;
  ZONE_CENTER_Y = ZONE_CENTER_Y_BASE;
  particles = [];
  sweetStreak = 0;
  sweetText = { active: false, x: 0, y: 0, alpha: 0, scale: 1, text: '' };
  bonusLogo.active = false;
  bonusText.active = false;
  lastBonusKick = 0;
  nextUniteKick = 15 + Math.floor(Math.random() * 11);
  wind = { active: false, dir: 0, force: 0, timer: 0, warningTimer: 0 };
  nextWindKick = 30 + Math.floor(Math.random() * 21);
  windParticles = [];
  storm = { active: false, timer: 0, flashTimer: 0, flashAlpha: 0 };
  nextStormKick = 35 + Math.floor(Math.random() * 15);
  stormsThisLevel = 0;
  rainDrops = [];
  zonePulseTimer = 0;
  walker = { active: false, x: 0, frame: 0, pendingSpawn: false, spawnedForLevel: -1 };
  nextWalkerKick = 12 + Math.floor(Math.random() * 9); // first walker in level 1 (score 12-20)
  levelTransition = false;
  levelTransTimer = 0;
  levelFlashTimer = 0;
}

function ballInZone() {
  const zoneTop = ZONE_CENTER_Y - zoneHeight / 2;
  const zoneBottom = ZONE_CENTER_Y + zoneHeight / 2;
  return ball.y >= zoneTop && ball.y <= zoneBottom;
}

function updateZone(zoneDt) {
  zoneDt = zoneDt || 1;
  let progress = DEBUG_HARD_MODE ? 1 : Math.min(baseScore / ZONE_SHRINK_SCORE, 1);
  var baseHeight = ZONE_HEIGHT_START - (ZONE_HEIGHT_START - ZONE_HEIGHT_FLOOR) * progress;
  // Keep shrinking slowly past score 100 — no plateau
  var endlessShrink = baseScore > ZONE_SHRINK_SCORE ? (baseScore - ZONE_SHRINK_SCORE) * ZONE_ENDLESS_SHRINK : 0;
  zoneHeight = Math.max(16, baseHeight - endlessShrink);

  // Bob the zone — speed increases per level + gradual creep after score 60
  var extraSpeed = baseScore > 60 ? (baseScore - 60) * 0.0003 : 0;
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
    // First kick is free and goes higher
    if (DEBUG_HARD_MODE) ball.y = ZONE_CENTER_Y_BASE;
    ball.vy = KICK_FORCE * 1.7;
    ball.vx = (Math.random() - 0.5) * 4;
    ball.spin = ball.vx * 0.08;
    baseScore = 1;
    score = baseScore + bonusScore;
    canKick = false;
    screenShake = 4;
    spawnParticles(ball.x, ball.y);
    haptic("success", score);
    playKickSound();
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

    // Check bonus logo hit
    if (bonusLogo.active && ballHitsBonusLogo()) {
      bonusScore += bonusLogo.points;
      bonusText = { active: true, x: ball.x, y: ball.y - 30, alpha: 1, scale: 1, text: '+' + bonusLogo.points };
      bonusLogo.active = false;
      scorePulse = 30; // trigger score animation
      screenShake = 6;
      spawnBonusParticles(ball.x, ball.y);
      playBonusSound();
    }

    // Check sweet spot hit
    var ssP = Math.min(baseScore / ZONE_SHRINK_SCORE, 1);
    var ssH = Math.max(SWEET_SPOT_MIN, SWEET_SPOT_START - (SWEET_SPOT_START - SWEET_SPOT_MIN) * ssP);
    var sweetTop = ZONE_CENTER_Y - ssH / 2;
    var sweetBottom = ZONE_CENTER_Y + ssH / 2;
    if (ball.y >= sweetTop && ball.y <= sweetBottom) {
      sweetStreak++;
      bonusScore += sweetStreak;
      sweetText = { active: true, x: ball.x, y: ball.y - 30, alpha: 1, scale: 1, text: '+' + sweetStreak };
    } else {
      sweetStreak = 0;
    }

    ball.vy = KICK_FORCE;
    ball.vx = (Math.random() - 0.5) * 4;
    ball.spin = ball.vx * 0.08;
    baseScore++;
    score = baseScore + bonusScore;
    screenShake = 4;
    spawnParticles(ball.x, ball.y);
    haptic("success", score);
    playKickSound();
    updateZone();

    // Spawn bonus logo at mid-level points (roughly middle of each level)
    // Patta bonus at mid-level points (+10, rare)
    var pattaTriggers = [10, 45, 95, 140];
    if (!bonusLogo.active && pattaTriggers.indexOf(baseScore) !== -1) {
      var dir = Math.random() > 0.5 ? 1 : -1;
      var yRange = zoneHeight * 0.6;
      var bonusY = ZONE_CENTER_Y + (Math.random() - 0.5) * yRange - BONUS_LOGO_H / 2;
      bonusLogo = { active: true, x: dir === 1 ? -BONUS_LOGO_W : CSS_W, y: bonusY, alpha: 0, type: 'patta', dir: dir, speed: 2.5, points: 10 };
    }

    // UNITE bonus randomly every 15-25 kicks (+5, common)
    if (!bonusLogo.active && baseScore >= nextUniteKick) {
      var dir = Math.random() > 0.5 ? 1 : -1;
      var yRange = zoneHeight * 0.6;
      var bonusY = ZONE_CENTER_Y + (Math.random() - 0.5) * yRange - BONUS_LOGO_H / 2;
      bonusLogo = { active: true, x: dir === 1 ? -BONUS_LOGO_W : CSS_W, y: bonusY, alpha: 0, type: 'unite', dir: dir, speed: 1.5, points: 5 };
      nextUniteKick = baseScore + 15 + Math.floor(Math.random() * 11);
    }

    // Wind trigger — not during bonus or storm
    if (!wind.active && !wind.warningTimer && !bonusLogo.active && !storm.active && baseScore >= nextWindKick) {
      wind.dir = Math.random() > 0.5 ? 1 : -1;
      wind.warningTimer = 60; // ~1 second warning
      wind.force = 0.15 + Math.random() * 0.1;
    }

    // Storm trigger — once per level at a random point
    if (!storm.active && !wind.active && stormsThisLevel === 0 && baseScore >= nextStormKick) {
      storm = { active: true, timer: 360, flashTimer: 30, flashAlpha: 0 };
      stormsThisLevel = 1;
      haptic("error");
    }

    // Walker trigger — level 1 only, once, around mid-level
    if (currentLevel === 0 && walker.spawnedForLevel !== 0 && baseScore >= nextWalkerKick) {
      walker.pendingSpawn = true;
      walker.spawnedForLevel = 0;
    }

    // Check for level up
    const newLevel = getLevel(baseScore);
    if (newLevel > currentLevel) {
      currentLevel = newLevel;
      levelTransTimer = LEVEL_TRANS_DURATION; // show banner
      levelFlashTimer = LEVEL_FLASH_DURATION;
      screenShake = 14;
      spawnLevelUpParticles(ball.x, ball.y);
      playLevelUpSound();
      // Pre-warm the asset cache for the level after this one so it's ready
      // by the time the player crosses the next threshold.
      ensureLevelBg(currentLevel + 1);
      ensureWalkerImage(currentLevel);
      ensureWalkerImage(currentLevel + 1);
      // Levels 2+ — walker crosses right after the banner clears
      if (walker.spawnedForLevel !== currentLevel) {
        walker.active = false;
        walker.pendingSpawn = true;
        walker.spawnedForLevel = currentLevel;
      }
      // Schedule next storm randomly within new level
      stormsThisLevel = 0;
      var nextThreshold = currentLevel < LEVELS.length - 1 ? LEVELS[currentLevel + 1].threshold : baseScore + 50;
      var levelRange = nextThreshold - baseScore;
      nextStormKick = baseScore + 5 + Math.floor(Math.random() * (levelRange - 10));
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

// Draw the hit zone (full-width rectangle, shrinks to 16px line)
let zonePulseTimer = 0;

// Sweet spot — 10px strip in center of zone
const SWEET_SPOT_START = 30;
const SWEET_SPOT_MIN = 10;
let sweetStreak = 0;
let sweetText = { active: false, x: 0, y: 0, alpha: 0, scale: 1, text: '' };

function drawZone() {
  const zoneTop = ZONE_CENTER_Y - zoneHeight / 2;

  // Onboarding pulse — keeps pulsing until the player lands ~3 successful hits, then fades
  var pulse = 0;
  if (baseScore < 5) {
    zonePulseTimer++;
    var amp = baseScore < 3 ? 1 : 1 - (baseScore - 3) / 2; // full 0-2 kicks, fade out by kick 5
    pulse = (Math.sin(zonePulseTimer * 0.15) * 0.5 + 0.5) * amp;
  }

  // Green fill — pulses brighter at start
  var fillAlpha = 0.12 + pulse * 0.15;
  ctx.fillStyle = "rgba(0, 255, 0, " + fillAlpha + ")";
  ctx.fillRect(0, zoneTop, CSS_W, zoneHeight);

  // Bright neon green border lines — pulses wider/brighter at start
  var lineWidth = 3 + pulse * 3;
  var borderAlpha = 1;
  ctx.strokeStyle = "rgba(0, 255, 0, " + borderAlpha + ")";
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(0, zoneTop);
  ctx.lineTo(CSS_W, zoneTop);
  ctx.moveTo(0, zoneTop + zoneHeight);
  ctx.lineTo(CSS_W, zoneTop + zoneHeight);
  ctx.stroke();

  // Sweet spot strip — shrinks with zone
  var ssProgress = DEBUG_HARD_MODE ? 1 : Math.min(baseScore / ZONE_SHRINK_SCORE, 1);
  var ssHeight = Math.max(SWEET_SPOT_MIN, SWEET_SPOT_START - (SWEET_SPOT_START - SWEET_SPOT_MIN) * ssProgress);
  var ssTop = ZONE_CENTER_Y - ssHeight / 2;
  var ssAlpha = 0.35 + (sweetStreak > 0 ? Math.sin(Date.now() * 0.008) * 0.15 : 0);
  ctx.fillStyle = "rgba(0, 220, 0, " + ssAlpha + ")";
  ctx.fillRect(0, ssTop, CSS_W, ssHeight);
  ctx.strokeStyle = "rgba(0, 255, 100, 0.5)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, ssTop);
  ctx.lineTo(CSS_W, ssTop);
  ctx.moveTo(0, ssTop + ssHeight);
  ctx.lineTo(CSS_W, ssTop + ssHeight);
  ctx.stroke();
}

function drawBackground() {
  ensureLevelBg(currentLevel);
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
const MARQUEE_H = 53;
const MARQUEE_BOTTOM = CSS_H * 0.7 + 2 + 56; // preserve previous bottom edge
const MARQUEE_Y = MARQUEE_BOTTOM - MARQUEE_H;
let marqueeX = 0;

// Level 4 foreground mask (crowd/tunnel overlay covering the banner)
const maskLevel4Img = new Image();
maskLevel4Img.src = "assets/mask-level4.png";

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

function drawLevelForeground() {
  if (currentLevel !== 3) return;
  if (!maskLevel4Img.complete || !maskLevel4Img.naturalWidth) return;
  const w = CSS_W;
  const h = maskLevel4Img.naturalHeight * (CSS_W / maskLevel4Img.naturalWidth);
  ctx.drawImage(maskLevel4Img, 0, CSS_H - h, w, h);
}

// ── WALKER (per-level character that walks across the screen on level entry) ──
// Sprites are 5-col × 4-row grids (20 frames). Cell size is derived per-image
// from naturalWidth/5 × naturalHeight/4, so any uniform grid size works.
const WALKER_COLS = 5;
const WALKER_ROWS = 4;
const WALKER_FRAMES = WALKER_COLS * WALKER_ROWS;
const WALKER_DISPLAY_H = [108, 108, 108, 54]; // per-level on-screen height in px
const WALKER_FEET_OFFSET = [0, 0, 0, 15];      // per-level feet Y offset (positive = down)
const WALKER_FEET_Y = CSS_H - 80; // y of feet; above the score counter
const WALKER_SPEED = 180;          // px/second — tweak to taste
const WALKER_LOOPS = 2;            // number of times the sprite sequence plays across one crossing

// Lazy-load per-level sprite sheets. Each ~140KB; only fetch when the level is
// reached. Missing files are fine — walker silently skips.
const walkerImages = LEVELS.map(() => null);
function ensureWalkerImage(idx) {
  if (idx < 0 || idx >= walkerImages.length) return;
  if (walkerImages[idx]) return;
  const img = new Image();
  img.src = `assets/walker-level${idx + 1}.png`;
  walkerImages[idx] = img;
}
ensureWalkerImage(0);

let walker = { active: false, x: 0, frame: 0, pendingSpawn: false, spawnedForLevel: -1 };

function walkerDrawSize() {
  ensureWalkerImage(currentLevel);
  const img = walkerImages[currentLevel];
  if (!img || !img.complete || img.naturalWidth === 0) return null;
  const cellW = img.naturalWidth / WALKER_COLS;
  const cellH = img.naturalHeight / WALKER_ROWS;
  const displayH = WALKER_DISPLAY_H[currentLevel] ?? 108;
  const displayW = displayH * (cellW / cellH);
  return { img, cellW, cellH, displayW, displayH };
}

function updateWalker(dt) {
  if (walker.pendingSpawn) {
    const dims = walkerDrawSize();
    const offscreenW = dims ? dims.displayW : 100;
    walker.active = true;
    walker.x = -offscreenW;
    walker.frame = 0;
    walker.pendingSpawn = false;
  }
  if (!walker.active) return;
  const dims = walkerDrawSize();
  const displayW = dims ? dims.displayW : 100;
  const realDtMs = dt * TARGET_DT;
  walker.x += (WALKER_SPEED * realDtMs) / 1000;
  // Frame progresses with screen position — sprite sequence plays WALKER_LOOPS times across the crossing.
  const travelDistance = CSS_W + displayW;
  const progress = Math.min(1, (walker.x + displayW) / travelDistance);
  const totalFrames = WALKER_FRAMES * WALKER_LOOPS;
  const step = Math.min(totalFrames - 1, Math.floor(progress * totalFrames));
  walker.frame = step % WALKER_FRAMES;
  if (walker.x > CSS_W) walker.active = false;
}

function drawWalker() {
  if (!walker.active) return;
  const dims = walkerDrawSize();
  if (!dims) return;
  const { img, cellW, cellH, displayW, displayH } = dims;
  const col = walker.frame % WALKER_COLS;
  const row = Math.floor(walker.frame / WALKER_COLS);
  ctx.imageSmoothingEnabled = false;
  const feetY = WALKER_FEET_Y + (WALKER_FEET_OFFSET[currentLevel] ?? 0);
  ctx.drawImage(
    img,
    col * cellW, row * cellH, cellW, cellH,
    walker.x, feetY - displayH, displayW, displayH
  );
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

// ── BONUS LOGO ──
function ballHitsBonusLogo() {
  var lx = bonusLogo.x, ly = bonusLogo.y;
  return ball.x + BALL_SIZE > lx && ball.x - BALL_SIZE < lx + BONUS_LOGO_W &&
         ball.y + BALL_SIZE > ly && ball.y - BALL_SIZE < ly + BONUS_LOGO_H;
}

function spawnBonusParticles(x, y) {
  var colors = ["#FF6B00", "#0051E8", "#FF6B00", "#0051E8", "#FDDB05"];
  for (var i = 0; i < 12; i++) {
    particles.push({
      x: x, y: y,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8,
      life: 25 + Math.random() * 10,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 3 + Math.random() * 4,
    });
  }
}

function spawnLevelUpParticles(x, y) {
  // Radial ring + secondary chaotic burst, brand-coloured pixel squares.
  var ringColors = ["#FDDB05", "#00d2d3", "#ffffff"];
  var burstColors = ["#FDDB05", "#00d2d3", "#FF6B00", "#0051E8", "#ffffff"];
  var ringCount = 24;
  for (var i = 0; i < ringCount; i++) {
    var a = (i / ringCount) * Math.PI * 2;
    var speed = 7 + Math.random() * 1.5;
    particles.push({
      x: x, y: y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: 40 + Math.random() * 10,
      color: ringColors[Math.floor(Math.random() * ringColors.length)],
      size: 4 + Math.random() * 2,
    });
  }
  for (var j = 0; j < 20; j++) {
    var ang = Math.random() * Math.PI * 2;
    var sp = 2 + Math.random() * 6;
    particles.push({
      x: x, y: y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp - 1,
      life: 30 + Math.random() * 20,
      color: burstColors[Math.floor(Math.random() * burstColors.length)],
      size: 2 + Math.random() * 3,
    });
  }
}

function updateBonusLogo(dt) {
  if (!bonusLogo.active) return;
  bonusLogo.x += bonusLogo.speed * bonusLogo.dir * dt;

  // Fade in/out based on direction
  var enterEdge = bonusLogo.dir === 1 ? bonusLogo.x < 40 : bonusLogo.x > CSS_W - BONUS_LOGO_W - 40;
  var exitEdge = bonusLogo.dir === 1 ? bonusLogo.x > CSS_W - BONUS_LOGO_W - 40 : bonusLogo.x < 40;

  if (enterEdge) {
    bonusLogo.alpha = Math.min(1, bonusLogo.alpha + 0.05 * dt);
  }
  if (exitEdge) {
    bonusLogo.alpha = Math.max(0, bonusLogo.alpha - 0.05 * dt);
  }

  // Remove when off screen
  if (bonusLogo.dir === 1 && bonusLogo.x > CSS_W) bonusLogo.active = false;
  if (bonusLogo.dir === -1 && bonusLogo.x < -BONUS_LOGO_W) bonusLogo.active = false;
}

function drawBonusLogo() {
  if (!bonusLogo.active || bonusLogo.alpha <= 0) return;
  var img = bonusLogo.type === 'patta' ? bonusPattaImg : bonusUniteImg;
  if (!img.complete || img.naturalWidth === 0) return;
  var cx = bonusLogo.x + BONUS_LOGO_W / 2;
  var cy = bonusLogo.y + BONUS_LOGO_H / 2;
  var bob = Math.sin(bonusLogo.x * 0.04) * 8;
  var rotation = Math.sin(bonusLogo.x * 0.025) * 0.2;
  ctx.save();
  ctx.globalAlpha = bonusLogo.alpha * 0.8;
  ctx.translate(cx, cy + bob);
  ctx.rotate(rotation);
  var w = BONUS_LOGO_W;
  var h = BONUS_LOGO_H;
  if (img.naturalWidth && img.naturalHeight) {
    var aspect = img.naturalWidth / img.naturalHeight;
    h = BONUS_LOGO_H;
    w = h * aspect;
  }
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function updateBonusText(dt) {
  if (!bonusText.active) return;
  bonusText.alpha -= 0.02 * dt;
  bonusText.scale += 0.015 * dt;
  bonusText.y -= 0.5 * dt;
  if (bonusText.alpha <= 0) bonusText.active = false;
}

function drawBonusText() {
  if (!bonusText.active) return;
  ctx.save();
  ctx.globalAlpha = bonusText.alpha;
  ctx.translate(bonusText.x, bonusText.y);
  ctx.scale(bonusText.scale, bonusText.scale);
  ctx.font = "28px 'Neue Pixel Grotesk', monospace";
  ctx.fillStyle = "#FF6B00";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(bonusText.text || "+10", 0, 0);
  ctx.restore();
}

// ── WIND SYSTEM ──
function updateWind(dt) {
  // Warning phase — arrow indicator
  if (wind.warningTimer > 0) {
    wind.warningTimer -= dt;
    if (wind.warningTimer <= 0) {
      // Start the actual wind
      wind.active = true;
      wind.timer = 120; // ~2 seconds of wind
      nextWindKick = baseScore + 30 + Math.floor(Math.random() * 21);
    }
    return;
  }

  if (!wind.active) return;

  wind.timer -= dt;

  // Apply force to ball
  ball.vx += wind.dir * wind.force * dt;

  // Spawn wind line particles
  for (var wi = 0; wi < 2; wi++) {
    if (Math.random() < 0.6 * dt) {
      var startX = wind.dir === 1 ? -10 : CSS_W + 10;
      var py = Math.random() * CSS_H;
      windParticles.push({
        x: startX, y: py,
        vx: wind.dir * (10 + Math.random() * 6),
        life: 50 + Math.random() * 30,
        len: 25 + Math.random() * 30,
      });
    }
  }

  if (wind.timer <= 0) {
    wind.active = false;
  }
}

function updateWindParticles(dt) {
  for (var i = windParticles.length - 1; i >= 0; i--) {
    var p = windParticles[i];
    p.x += p.vx * dt;
    p.life -= dt;
    if (p.life <= 0) windParticles.splice(i, 1);
  }
}

function drawWind() {
  // Draw warning arrow
  if (wind.warningTimer > 0) {
    var blink = Math.sin(wind.warningTimer * 0.3) > 0;
    if (blink) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.font = "36px 'Neue Pixel Grotesk', monospace";
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      var arrow = wind.dir === 1 ? ">>>" : "<<<";
      ctx.fillText(arrow, CSS_W / 2, ZONE_CENTER_Y_BASE);
      ctx.restore();
    }
  }

  // Draw wind line particles
  ctx.lineWidth = 3;
  for (var i = 0; i < windParticles.length; i++) {
    var p = windParticles[i];
    var alpha = Math.min(p.life / 15, 1) * 0.7;
    ctx.strokeStyle = "rgba(255, 255, 255, " + alpha + ")";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - p.vx * 0.5, p.y);
    ctx.stroke();
  }
}

// ── STORM SYSTEM ──
function updateStorm(dt) {
  if (!storm.active) return;
  storm.timer -= dt;

  // Rain intensity fades as timer runs low
  var fadeOut = 120; // last ~2 seconds fade out
  var intensity = storm.timer > fadeOut ? 1 : storm.timer / fadeOut;

  // Spawn rain drops — rate decreases during fade
  for (var ri = 0; ri < 3; ri++) {
    if (Math.random() < 0.8 * intensity * dt) {
      rainDrops.push({
        x: Math.random() * CSS_W,
        y: -5,
        vy: 12 + Math.random() * 6,
        life: 80,
        len: 8 + Math.random() * 8,
      });
    }
  }

  // Update rain
  for (var i = rainDrops.length - 1; i >= 0; i--) {
    var r = rainDrops[i];
    r.y += r.vy * dt;
    r.life -= dt;
    if (r.life <= 0 || r.y > CSS_H) rainDrops.splice(i, 1);
  }

  // Thunder flash — only at the start
  if (storm.flashTimer > 0) {
    storm.flashTimer -= dt;
    if (storm.flashTimer > 20) {
      storm.flashAlpha = 0.6;
    } else if (storm.flashTimer > 15) {
      storm.flashAlpha = 0;
    } else if (storm.flashTimer > 5) {
      storm.flashAlpha = 0.4;
    } else {
      storm.flashAlpha = Math.max(0, storm.flashAlpha - 0.05 * dt);
    }
  }

  // End when timer runs out AND all rain has fallen
  if (storm.timer <= 0 && rainDrops.length === 0) {
    storm.active = false;
  }
}

function drawStorm() {
  if (!storm.active) return;

  // Draw rain
  ctx.strokeStyle = "rgba(180, 200, 255, 0.5)";
  ctx.lineWidth = 1.5;
  for (var i = 0; i < rainDrops.length; i++) {
    var r = rainDrops[i];
    ctx.beginPath();
    ctx.moveTo(r.x, r.y);
    ctx.lineTo(r.x - 1, r.y + r.len);
    ctx.stroke();
  }

  // Lightning flash overlay
  if (storm.flashAlpha > 0) {
    ctx.fillStyle = "rgba(255, 255, 255, " + storm.flashAlpha + ")";
    ctx.fillRect(0, 0, CSS_W, CSS_H);
  }

  // Darken overlay for rain atmosphere — fades with rain
  var fadeOut = 120;
  var darkIntensity = storm.timer > fadeOut ? 1 : Math.max(0, storm.timer / fadeOut);
  if (darkIntensity > 0) {
    ctx.fillStyle = "rgba(0, 0, 30, " + (0.15 * darkIntensity) + ")";
    ctx.fillRect(0, 0, CSS_W, CSS_H);
  }
}

// ── SWEET SPOT TEXT ──
function updateSweetText(dt) {
  if (!sweetText.active) return;
  sweetText.alpha -= 0.025 * dt;
  sweetText.scale += 0.01 * dt;
  sweetText.y -= 0.8 * dt;
  if (sweetText.alpha <= 0) sweetText.active = false;
}

function drawSweetText() {
  if (!sweetText.active) return;
  ctx.save();
  ctx.globalAlpha = sweetText.alpha;
  ctx.translate(sweetText.x, sweetText.y);
  ctx.scale(sweetText.scale, sweetText.scale);
  ctx.font = "bold 28px 'Neue Pixel Grotesk', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#000";
  ctx.strokeText(sweetText.text, 0, 0);
  ctx.fillStyle = "#00ff88";
  ctx.fillText(sweetText.text, 0, 0);
  if (sweetStreak >= 3) {
    ctx.font = "bold 14px 'Neue Pixel Grotesk', monospace";
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = "#000";
    ctx.strokeText(sweetStreak + "x STREAK", 0, 18);
    ctx.fillStyle = "#00ff88";
    ctx.fillText(sweetStreak + "x STREAK", 0, 18);
  }
  ctx.restore();
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
  drawMarquee(state === "over" ? 0 : dt);
  drawLevelForeground();
  updateWalker(dt);
  drawWalker();

  if (state === "start") {
    drawZone();
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
    if (baseScore > 2) {
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

    // Level-up banner (drawn BEHIND zone so green lines read on top)
    if (levelTransTimer > 0) {
      levelTransTimer -= dt;
      if (levelTransTimer > 0) {
        const elapsed = LEVEL_TRANS_DURATION - levelTransTimer;
        const alpha = Math.min(levelTransTimer / 30, 1);
        // Pop-in scale: snap from 0.4 → 1.15 in first 8 frames, settle to 1.0 by frame 16.
        let scale;
        if (elapsed < 8) scale = 0.4 + (elapsed / 8) * 0.75;
        else if (elapsed < 16) scale = 1.15 - ((elapsed - 8) / 8) * 0.15;
        else scale = 1;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(CSS_W / 2, CSS_H / 2);
        ctx.scale(scale, scale);
        // Black bar with yellow pixel border
        ctx.fillStyle = "rgba(0,0,0,0.85)";
        ctx.fillRect(-CSS_W / 2, -60, CSS_W, 120);
        ctx.fillStyle = "#FDDB05";
        ctx.fillRect(-CSS_W / 2, -60, CSS_W, 4);
        ctx.fillRect(-CSS_W / 2, 56, CSS_W, 4);
        drawText("LEVEL UP!", 0, -18, 36, "#FDDB05");
        drawText(LEVELS[currentLevel].name, 0, 22, 22, "#ffffff");
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }

    // White screen-flash on level up (drawn over everything in this branch)
    if (levelFlashTimer > 0) {
      levelFlashTimer -= dt;
      if (levelFlashTimer > 0) {
        const a = Math.min(levelFlashTimer / LEVEL_FLASH_DURATION, 1);
        ctx.fillStyle = "rgba(255,255,255," + (a * 0.85) + ")";
        ctx.fillRect(0, 0, CSS_W, CSS_H);
      }
    }

    drawZone();

    // Wind
    updateWind(dt);
    updateWindParticles(dt);
    drawWind();

    // Storm
    updateStorm(dt);
    drawStorm();

    // Bonus logo (drawn behind ball)
    updateBonusLogo(dt);
    drawBonusLogo();

    drawBall();
    updateParticles(dt);
    drawParticles();

    // Bonus +10 text (drawn on top)
    updateBonusText(dt);
    drawBonusText();

    // Sweet spot text
    updateSweetText(dt);
    drawSweetText();

    // Score — bottom-left, 63px white, pulses on bonus hit
    if (scorePulse > 0) {
      scorePulse--;
      var pulseScale = 1 + Math.sin(scorePulse * 0.3) * 0.15;
      var pulseColor = scorePulse % 6 < 3 ? "#FF6B00" : "#FDDB05";
      ctx.save();
      ctx.font = "63px 'Neue Pixel Grotesk', monospace";
      var tw = ctx.measureText(score.toString()).width;
      var cx = 20 + tw / 2;
      var cy = CSS_H - 40;
      ctx.translate(cx, cy);
      ctx.scale(pulseScale, pulseScale);
      ctx.translate(-cx, -cy);
      drawText(score.toString(), 20, CSS_H - 40, 63, pulseColor, "left");
      ctx.restore();
    } else {
      drawText(score.toString(), 20, CSS_H - 40, 63, "#ffffff", "left");
    }

    // Personal record — top-right, beating it recolors in gold
    if (highScore > 0) {
      var beaten = score > highScore;
      var prColor = beaten ? "#FDDB05" : "#ffffff";
      var prLabel = beaten ? "NEW PR" : "PR";
      drawText(prLabel + " " + Math.max(score, highScore), CSS_W - 20, 32, 20, prColor, "right");
    }
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
