const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// ── RETINA / HiDPI SUPPORT ──
const DPR = window.devicePixelRatio || 1;
const CSS_W = 403;
const CSS_H = 698;
canvas.width = CSS_W * DPR;
canvas.height = CSS_H * DPR;
canvas.style.width = CSS_W + 'px';
canvas.style.height = CSS_H + 'px';
ctx.scale(DPR, DPR);

// ── LOADING OVERLAY CONTROLLER ──
const overlay = document.getElementById('loading-overlay');
const progressFill = document.querySelector('.progress-fill');
const loadingRow = document.querySelector('.loading-row');
const splashPanel = document.querySelector('.splash-panel');
const menuButtons = document.querySelectorAll('.menu-btn');
const menuFooter = document.querySelector('.menu-footer');
const btnPlay = document.querySelector('.btn-play');
const gameOverOverlay = document.querySelector('.game-over-overlay');
const gameOverScore = document.querySelector('.game-over-score');
const btnSubmitScore = document.querySelector('.btn-submit-score');

const ASSETS_TO_LOAD = [
    'assets/patta-logo.png',
    'assets/nike-swoosh.png',
    'assets/pattern-tile.png',
    'assets/tournament-title.png',
    'assets/btn-play.png',
    'assets/btn-signup.png',
    'assets/btn-collection.png',
    'assets/btn-leaderboard.png',
    'assets/soccer-ball.png',
    'assets/bg-level1.jpg',
    'assets/bg-level2.jpg',
    'assets/bg-level3.jpg',
    'assets/bg-level4.jpg',
    'assets/key-space.png',
    'assets/btn-submit.png',
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
            progressFill.style.width = '100%';
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
        progressFill.style.width = displayProgress + '%';

        if (loadedCount >= totalAssets) {
            allAssetsReady = true;
            const elapsed = Date.now() - loadStart;
            const remaining = Math.max(0, MIN_LOAD_TIME - elapsed);

            // Smoothly fill the remaining progress over the remaining time
            if (remaining > 0) {
                progressFill.style.transition = `width ${remaining}ms linear`;
                progressFill.style.width = '100%';
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
        progressFill.style.width = displayProgress + '%';
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
    const titleImg = document.querySelector('.tournament-title');
    if (failedAssets.has('assets/tournament-title.png') && titleImg) {
        titleImg.style.display = 'none';
    }
    if (failedAssets.has('assets/pattern-tile.png')) {
        splashPanel.style.backgroundImage = 'none';
        splashPanel.style.background = '#111';
    }
}

function startPhase2() {
    // Pause 300ms at 100%, then converge
    setTimeout(() => {
        loadingRow.querySelector('.progress-bar').style.opacity = '0';

        setTimeout(() => {
            loadingRow.classList.add('converged');
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
        splashPanel.classList.add('visible');
        loadingRow.classList.add('splash-position');

        // Wait for splash expand, then show menu
        setTimeout(startPhase4, 500 + 1500); // 500ms expand + 1500ms hold
    }, 200);
}

function startPhase4() {
    sessionStorage.setItem('patta-loaded', '1');

    // Animate title from center to top
    splashPanel.classList.add('menu-active');

    // Stagger buttons in after title starts moving (300ms delay)
    setTimeout(() => {
        menuButtons.forEach((btn, i) => {
            setTimeout(() => {
                btn.classList.add('visible');
            }, i * 100);
        });

        // Footer after last button
        setTimeout(() => {
            menuFooter.classList.add('visible');
        }, (menuButtons.length - 1) * 100 + 300 + 200);
    }, 300);
}

// Skip to final menu state on tap/space during phases 1-3
function skipToMenu() {
    if (loadingComplete && menuButtons[0].classList.contains('visible')) return;

    loadingComplete = true;
    progressFill.style.width = '100%';
    phase3Started = true;

    // Instantly set all states
    loadingRow.classList.add('converged', 'splash-position');
    loadingRow.querySelector('.progress-bar').style.opacity = '0';
    splashPanel.classList.add('visible', 'menu-active');

    // Show buttons immediately
    menuButtons.forEach(btn => btn.classList.add('visible'));
    menuFooter.classList.add('visible');
}

overlay.addEventListener('click', (e) => {
    if (!splashPanel.classList.contains('game-active')) {
        skipToMenu();
    }
});
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !splashPanel.classList.contains('game-active') && overlay.style.display !== 'none') {
        e.preventDefault();
        skipToMenu();
    }
});

let gameOverTime = 0;
const GAME_OVER_COOLDOWN = 600; // ms before tap-to-retry works

function showGameOver() {
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('keepballup_high', highScore.toString());
    }
    gameOverScore.textContent = score;
    splashPanel.classList.add('game-over');
    gameOverTime = Date.now();
}

function hideGameOver() {
    splashPanel.classList.remove('game-over');
}

function startGame() {
    // Show canvas + start overlay inside the panel, hide menu content
    splashPanel.classList.add('game-active');
    canvas.classList.add('active');
    // Draw first frame (background + ball) but don't start playing yet
    update();
}

btnPlay.addEventListener('click', (e) => {
    e.stopPropagation(); // Don't trigger skipToMenu
    startGame();
});

// Prevent other menu buttons from triggering skip
document.querySelectorAll('.menu-btn').forEach(btn => {
    btn.addEventListener('click', (e) => e.stopPropagation());
});

// Submit score button
btnSubmitScore.addEventListener('click', (e) => {
    e.stopPropagation();
    // TODO: implement score submission
});

function backToMenu() {
    hideGameOver();
    splashPanel.classList.remove('game-active', 'game-playing');
    canvas.classList.remove('active');
    state = 'start';
    resetGame();
}

document.addEventListener('keydown', (e) => {
    // Enter = Play Game (from menu) or Submit Score (game over)
    if (e.code === 'Enter') {
        if (state === 'over' && splashPanel.classList.contains('game-over')) {
            btnSubmitScore.click();
        } else if (!splashPanel.classList.contains('game-active') && menuButtons[0].classList.contains('visible')) {
            startGame();
        }
    }
    // Escape = back to menu
    if (e.code === 'Escape' && splashPanel.classList.contains('game-active')) {
        backToMenu();
    }
});

// Skip loading animation on repeat visits (session)
if (sessionStorage.getItem('patta-loaded')) {
    overlay.classList.add('skip-intro');
    // Set final state instantly (no transitions on inner elements)
    loadingComplete = true;
    phase3Started = true;
    progressFill.style.width = '100%';
    loadingRow.classList.add('converged');
    loadingRow.querySelector('.progress-bar').style.opacity = '0';
    splashPanel.classList.add('menu-active');
    menuButtons.forEach(btn => btn.classList.add('visible'));
    menuFooter.classList.add('visible');
    // Animate panel scale + logo outward slide on next frame
    requestAnimationFrame(() => {
        splashPanel.classList.add('visible');
        loadingRow.classList.add('splash-position');
    });
} else {
    preloadAssets();
}

// Game constants
const GRAVITY = 0.3;
const KICK_FORCE = -10;
const BALL_SIZE = 24;
const GROUND_Y = CSS_H - 40;

// Hit zone: full-width rectangle, shrinks in height toward a 6px line
const DEBUG_HARD_MODE = false;   // SET TO true TO TEST ENDGAME DIFFICULTY
const ZONE_CENTER_Y_BASE = CSS_H * 0.455;
const ZONE_HEIGHT_START = DEBUG_HARD_MODE ? 6 : 550;
const ZONE_HEIGHT_MIN = 6;       // shrinks to a thin line
const ZONE_SHRINK_SCORE = 50;
const ZONE_BOB_AMPLITUDE = 40;   // max vertical bob in px at smallest zone
const ZONE_BOB_SPEED = 0.02;     // oscillation speed (radians per frame)
let zoneBobPhase = 0;
let ZONE_CENTER_Y = ZONE_CENTER_Y_BASE;

// ── LEVEL SYSTEM ──
const LEVELS = [
    { name: 'TRAINING FIELD', threshold: 0,  bgSrc: 'assets/bg-level1.jpg', bgImg: null },
    { name: 'LOCAL STADIUM',  threshold: 20, bgSrc: 'assets/bg-level2.jpg', bgImg: null },
    { name: 'BIG STADIUM',    threshold: 40, bgSrc: 'assets/bg-level3.jpg', bgImg: null },
    { name: 'WORLD CUP',      threshold: 60, bgSrc: 'assets/bg-level4.jpg', bgImg: null },
];

// Preload level backgrounds
LEVELS.forEach(lv => {
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
let highScore = parseInt(localStorage.getItem('keepballup_high') || '0');
let state = 'start'; // 'start', 'playing', 'over', 'leveltransition'
let particles = [];
let screenShake = 0;
let canKick = true;        // only one kick per ball rise
let wasGoingDown = false;  // track when ball starts falling

// Hit zone (rectangular)
let zoneHeight = ZONE_HEIGHT_START;

// 8-bit color palette
const COLORS = {
    bg: '#0f0e17',
    ground: '#2e7d32',
    groundDark: '#1b5e20',
    ball: '#e94560',
    ballHighlight: '#ff6b81',
    text: '#fffffe',
    textShadow: '#0f0e17',
    score: '#f9d71c',
    zone: 'rgba(0, 210, 211, 0.15)',
    zoneBorder: '#00d2d3',
    zoneActive: 'rgba(0, 210, 211, 0.35)',
    zoneLocked: 'rgba(255, 50, 50, 0.1)',
    zoneBorderLocked: '#ff4444',
    particle: ['#e94560', '#f9d71c', '#00d2d3', '#ff9ff3', '#54a0ff']
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

function updateZone() {
    let progress = DEBUG_HARD_MODE ? 1 : Math.min(score / ZONE_SHRINK_SCORE, 1);
    zoneHeight = ZONE_HEIGHT_START - (ZONE_HEIGHT_START - ZONE_HEIGHT_MIN) * progress;

    // Bob the zone up and down — amplitude scales with shrink progress
    zoneBobPhase += ZONE_BOB_SPEED;
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
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${size}px 'Neue Pixel Grotesk', monospace`;
    ctx.fillStyle = color || COLORS.text;
    ctx.fillText(text, x, y);
}

function spawnParticles(x, y) {
    for (let i = 0; i < 8; i++) {
        particles.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * 6,
            vy: (Math.random() - 0.5) * 6,
            life: 20 + Math.random() * 10,
            color: COLORS.particle[Math.floor(Math.random() * COLORS.particle.length)],
            size: 2 + Math.random() * 3
        });
    }
}

// Handle input
function kick() {
    if (state === 'start') {
        state = 'playing';
        splashPanel.classList.add('game-playing');
        resetGame();
        // First kick is free
        ball.vy = KICK_FORCE;
        ball.vx = (Math.random() - 0.5) * 4;
        ball.spin = ball.vx * 0.08;
        score = 1;
        canKick = false;
        screenShake = 4;
        spawnParticles(ball.x, ball.y);
        return;
    }

    if (state === 'playing') {
        if (!canKick) return;         // already used your one tap

        // One tap per fall — used up whether in zone or not
        canKick = false;

        if (!ballInZone()) {
            // Tapped outside zone — game over!
            state = 'over';
            showGameOver();
            return;
        }

        ball.vy = KICK_FORCE;
        ball.vx = (Math.random() - 0.5) * 4;
        ball.spin = ball.vx * 0.08;
        score++;
        screenShake = 4;
        spawnParticles(ball.x, ball.y);
        updateZone();

        // Check for level up
        const newLevel = getLevel(score);
        if (newLevel > currentLevel) {
            currentLevel = newLevel;
            levelTransTimer = LEVEL_TRANS_DURATION; // show banner
        }
        return;
    }

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
}

document.addEventListener('keydown', function(e) {
    if (e.code === 'Space') {
        if (!splashPanel.classList.contains('game-active')) return;
        e.preventDefault();
        kick();
    }
});

canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    kick();
});

canvas.addEventListener('mousedown', function(e) {
    kick();
});

// Draw the hit zone (full-width rectangle, shrinks to 4px line)
function drawZone() {
    const zoneTop = ZONE_CENTER_Y - zoneHeight / 2;

    // Green fill — visible but not opaque
    ctx.fillStyle = 'rgba(0, 255, 0, 0.12)';
    ctx.fillRect(0, zoneTop, CSS_W, zoneHeight);

    // Bright neon green border lines (matching Figma)
    ctx.strokeStyle = '#00ff00';
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
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, CSS_W, CSS_H);
    }
}

// ── LEVEL TRANSITION SCREEN ──
function drawLevelTransition() {
    levelTransTimer++;
    const lv = LEVELS[currentLevel];

    ctx.fillStyle = '#0f0e17';
    ctx.fillRect(0, 0, CSS_W, CSS_H);

    const progress = levelTransTimer / LEVEL_TRANS_DURATION;

    // Flash effect
    if (levelTransTimer < 10) {
        ctx.fillStyle = `rgba(255,255,255,${0.5 - levelTransTimer * 0.05})`;
        ctx.fillRect(0, 0, CSS_W, CSS_H);
    }

    ctx.globalAlpha = Math.min(levelTransTimer / 15, 1);

    drawText('NEXT LEVEL!', CSS_W / 2, CSS_H / 2 - 60, 32, '#f9d71c');
    drawText(lv.name, CSS_W / 2, CSS_H / 2, 28, '#ffffff');
    drawText('Score: ' + score, CSS_W / 2, CSS_H / 2 + 50, 20, '#00d2d3');

    // Stars animation
    for (let i = 0; i < 5; i++) {
        const angle = (Date.now() * 0.002 + i * Math.PI * 2 / 5);
        const radius = 80 + Math.sin(Date.now() * 0.003) * 10;
        const sx = CSS_W / 2 + Math.cos(angle) * radius;
        const sy = CSS_H / 2 - 30 + Math.sin(angle) * radius;
        drawText('★', sx, sy, 16, '#f9d71c');
    }

    ctx.globalAlpha = 1;

    if (levelTransTimer >= LEVEL_TRANS_DURATION) {
        state = 'playing';
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

// Load soccer ball from Figma asset
const soccerBallImg = new Image();
soccerBallImg.src = 'assets/soccer-ball.png';

function drawBall() {
    let shadowScale = 1 - (GROUND_Y - ball.y) / CSS_H;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(ball.x - BALL_SIZE * shadowScale / 2, GROUND_Y + 4, BALL_SIZE * shadowScale, 4);

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
        BALL_SIZE * 2
    );
    ctx.restore();
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
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
function update() {
    let shakeX = 0, shakeY = 0;
    if (screenShake > 0) {
        shakeX = (Math.random() - 0.5) * screenShake;
        shakeY = (Math.random() - 0.5) * screenShake;
        screenShake *= 0.8;
        if (screenShake < 0.5) screenShake = 0;
    }

    ctx.save();
    ctx.translate(shakeX, shakeY);

    drawBackground();

    if (state === 'start') {
        drawBall();
    }

    if (state === 'playing') {
        // Physics
        ball.vy += GRAVITY;
        ball.y += ball.vy;
        ball.x += ball.vx;

        // Spin physics: angular velocity with air friction
        ball.angle += ball.spin;
        ball.spin *= 0.997; // air drag on spin

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
        }
        if (ball.x > CSS_W - BALL_SIZE) {
            ball.x = CSS_W - BALL_SIZE;
            ball.vx = -ball.vx * 0.8;
            ball.spin = -ball.spin * 0.6 - ball.vy * 0.03;
        }

        // Bounce off ceiling
        if (ball.y < BALL_SIZE) {
            ball.y = BALL_SIZE;
            ball.vy = Math.abs(ball.vy) * 0.5;
            ball.spin += ball.vx * 0.04;
        }

        // Ball fell below zone = game over
        const zoneBottom = ZONE_CENTER_Y + zoneHeight / 2;
        if (ball.y > zoneBottom) {
            state = 'over';
            showGameOver();
        }

        // Clamp to ground
        if (ball.y >= GROUND_Y - BALL_SIZE) {
            ball.y = GROUND_Y - BALL_SIZE;
            if (state !== 'over') {
                state = 'over';
                showGameOver();
            }
        }

        drawZone();
        drawBall();
        updateParticles();
        drawParticles();

        // Score — bottom-left, 63px white
        drawText(score.toString(), 20, CSS_H - 40, 63, '#ffffff', 'left');

        // Level-up banner (fades out during gameplay)
        if (levelTransTimer > 0) {
            levelTransTimer--;
            const alpha = Math.min(levelTransTimer / 30, 1);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(0, CSS_H / 2 - 40, CSS_W, 80);
            drawText('NEXT LEVEL!', CSS_W / 2, CSS_H / 2 - 15, 28, '#f9d71c');
            drawText(LEVELS[currentLevel].name, CSS_W / 2, CSS_H / 2 + 18, 20, '#ffffff');
            ctx.globalAlpha = 1;
        }
    }

    if (state === 'over') {
        // Just draw last frame — CSS filter handles desaturation
        drawBall();
    }

    ctx.restore();
    requestAnimationFrame(update);
}

// Game loop is started by the loading overlay when "Play Game" is clicked
