const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

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

    const failedAssets = new Set();
    const timeoutId = setTimeout(() => {
        if (!loadingComplete) {
            loadingComplete = true;
            progressFill.style.width = '100%';
            applyAssetFallbacks(failedAssets);
            startPhase2();
        }
    }, LOAD_TIMEOUT);

    ASSETS_TO_LOAD.forEach((src) => {
        const img = new Image();
        img.onload = () => {
            loadedCount++;
            progressFill.style.width = (loadedCount / totalAssets) * 100 + '%';
            if (loadedCount >= totalAssets && !loadingComplete) {
                loadingComplete = true;
                clearTimeout(timeoutId);
                applyAssetFallbacks(failedAssets);
                startPhase2();
            }
        };
        img.onerror = () => {
            loadedCount++;
            failedAssets.add(src);
            progressFill.style.width = (loadedCount / totalAssets) * 100 + '%';
            if (loadedCount >= totalAssets && !loadingComplete) {
                loadingComplete = true;
                clearTimeout(timeoutId);
                applyAssetFallbacks(failedAssets);
                startPhase2();
            }
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
        // Expand panel
        splashPanel.classList.add('visible');
        // Move logos to splash position
        loadingRow.classList.add('splash-position');

        // Wait for splash expand, then show menu
        setTimeout(startPhase4, 500 + 1500); // 500ms expand + 1500ms hold
    }, 200);
}

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

// Game constants
const GRAVITY = 0.3;
const KICK_FORCE = -10;
const BALL_SIZE = 24;
const GROUND_Y = canvas.height - 40;

// Hit zone: starts from ground to halfway, shrinks to 5% at bottom
const PLAY_HEIGHT = GROUND_Y;                    // full playable height
const ZONE_HEIGHT_START = PLAY_HEIGHT * 0.5;     // starts at 50% of screen
const ZONE_HEIGHT_MIN = PLAY_HEIGHT * 0.05;      // shrinks to 5%
const ZONE_SHRINK_SCORE = 50;                    // score at which zone reaches minimum

// ── LEVEL SYSTEM ──
const LEVELS = [
    { name: 'TRAINING FIELD', threshold: 0,  bg: '#0f0e17', ground: '#2e7d32', groundDark: '#1b5e20', groundLine: '#4caf50' },
    { name: 'LOCAL STADIUM',  threshold: 20, bg: '#0a0a1a', ground: '#1b6e1f', groundDark: '#145216', groundLine: '#3d9b40' },
    { name: 'BIG STADIUM',    threshold: 40, bg: '#060612', ground: '#166b19', groundDark: '#0f4a12', groundLine: '#2e8630' },
    { name: 'WORLD CUP',      threshold: 60, bg: '#030308', ground: '#0f5c12', groundDark: '#0a3f0d', groundLine: '#228025' },
];

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
let ball = { x: canvas.width / 2, y: canvas.height / 2, vy: 0, vx: 0 };
let score = 0;
let highScore = parseInt(localStorage.getItem('keepballup_high') || '0');
let state = 'start'; // 'start', 'playing', 'over', 'leveltransition'
let particles = [];
let screenShake = 0;
let canKick = true;        // only one kick per ball rise
let wasGoingDown = false;  // track when ball starts falling

// Hit zone (where you must tap)
let zoneHeight = ZONE_HEIGHT_START;
let zoneTop = GROUND_Y - zoneHeight;

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
    ball = { x: canvas.width / 2, y: GROUND_Y - BALL_SIZE - 50, vy: 0, vx: 0 };
    canKick = true;
    wasGoingDown = false;
    updateZone();
    particles = [];
}

function getZoneBottom() {
    return zoneTop + zoneHeight;
}

function ballInZone() {
    return ball.y >= zoneTop - BALL_SIZE && ball.y <= getZoneBottom() + BALL_SIZE;
}

function updateZone() {
    // Zone always anchored to ground, shrinks from top down
    let progress = Math.min(score / ZONE_SHRINK_SCORE, 1); // 0 to 1
    zoneHeight = ZONE_HEIGHT_START - (ZONE_HEIGHT_START - ZONE_HEIGHT_MIN) * progress;
    zoneTop = GROUND_Y - zoneHeight;
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
    ctx.font = `bold ${size}px monospace`;
    ctx.fillStyle = COLORS.textShadow;
    ctx.fillText(text, x + 2, y + 2);
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
        resetGame();
        // First kick is free
        ball.vy = KICK_FORCE;
        ball.vx = (Math.random() - 0.5) * 4;
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
            if (score > highScore) {
                highScore = score;
                localStorage.setItem('keepballup_high', highScore.toString());
            }
            return;
        }

        ball.vy = KICK_FORCE;
        ball.vx = (Math.random() - 0.5) * 4;
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
        state = 'start';
    }
}

document.addEventListener('keydown', function(e) {
    if (e.code === 'Space') {
        if (overlay.style.display !== 'none') return;
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

// Draw the hit zone
function drawZone() {
    let inZone = ballInZone();
    let bottom = getZoneBottom();

    if (canKick) {
        // Active zone
        ctx.fillStyle = inZone ? COLORS.zoneActive : COLORS.zone;
        ctx.fillRect(0, zoneTop, canvas.width, zoneHeight);

        // Dashed pixel borders
        ctx.fillStyle = COLORS.zoneBorder;
        for (let x = 0; x < canvas.width; x += 8) {
            ctx.fillRect(x, zoneTop, 4, 2);
            ctx.fillRect(x, bottom - 2, 4, 2);
        }
        // Side markers
        ctx.fillRect(0, zoneTop, 2, zoneHeight);
        ctx.fillRect(canvas.width - 2, zoneTop, 2, zoneHeight);
    } else {
        // Locked zone (already kicked)
        ctx.fillStyle = COLORS.zoneLocked;
        ctx.fillRect(0, zoneTop, canvas.width, zoneHeight);

        ctx.fillStyle = COLORS.zoneBorderLocked;
        for (let x = 0; x < canvas.width; x += 8) {
            ctx.fillRect(x, zoneTop, 4, 2);
            ctx.fillRect(x, bottom - 2, 4, 2);
        }
    }
}

function drawGround() {
    const lv = LEVELS[currentLevel];
    ctx.fillStyle = lv.ground;
    ctx.fillRect(0, GROUND_Y, canvas.width, canvas.height - GROUND_Y);
    ctx.fillStyle = lv.groundDark;
    for (let x = 0; x < canvas.width; x += 8) {
        let h = (x * 7 + 3) % 5;
        ctx.fillRect(x, GROUND_Y, 4, 2 + h);
    }
    ctx.fillStyle = lv.groundLine;
    ctx.fillRect(0, GROUND_Y, canvas.width, 2);

    // Field markings (white lines on grass)
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(canvas.width / 2 - 1, GROUND_Y, 2, canvas.height - GROUND_Y);
}

// ── STADIUM BACKGROUNDS ──
function drawTrainingField() {
    // Simple: cones on the ground
    ctx.fillStyle = '#ff6600';
    for (let i = 0; i < 5; i++) {
        const cx = 40 + i * 80;
        // Small pixel cone
        ctx.fillRect(cx, GROUND_Y - 8, 6, 8);
        ctx.fillRect(cx - 2, GROUND_Y - 2, 10, 2);
    }
    // Simple fence in background
    ctx.fillStyle = '#444444';
    for (let x = 0; x < canvas.width; x += 20) {
        ctx.fillRect(x + 9, GROUND_Y - 50, 2, 50);
    }
    ctx.fillStyle = '#555555';
    ctx.fillRect(0, GROUND_Y - 50, canvas.width, 2);
    ctx.fillRect(0, GROUND_Y - 30, canvas.width, 2);
}

function drawSmallStadium() {
    const standY = GROUND_Y - 60;
    const standH = 60;
    // Left stand
    ctx.fillStyle = '#2a2a3a';
    ctx.fillRect(0, standY, 50, standH);
    // Right stand
    ctx.fillRect(canvas.width - 50, standY, 50, standH);

    // Pixel crowd on stands
    const crowdColors = ['#e94560', '#f9d71c', '#54a0ff', '#ff9ff3', '#ffffff', '#00d2d3'];
    for (let side = 0; side < 2; side++) {
        const baseX = side === 0 ? 4 : canvas.width - 46;
        for (let row = 0; row < 6; row++) {
            for (let col = 0; col < 5; col++) {
                const px = baseX + col * 9;
                const py = standY + 4 + row * 9;
                // Head
                ctx.fillStyle = '#ffcc99';
                ctx.fillRect(px + 1, py, 4, 4);
                // Shirt
                ctx.fillStyle = crowdColors[(row * 5 + col + side * 3) % crowdColors.length];
                ctx.fillRect(px, py + 4, 6, 4);
            }
        }
    }

    // Floodlights
    ctx.fillStyle = '#666666';
    ctx.fillRect(55, GROUND_Y - 120, 3, 120);
    ctx.fillRect(canvas.width - 58, GROUND_Y - 120, 3, 120);
    ctx.fillStyle = '#ffff99';
    ctx.fillRect(50, GROUND_Y - 124, 12, 4);
    ctx.fillRect(canvas.width - 62, GROUND_Y - 124, 12, 4);
}

function drawBigStadium() {
    // Full stands behind the field
    const standY = GROUND_Y - 100;

    // Back wall
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, standY - 40, canvas.width, 140);

    // Upper tier
    ctx.fillStyle = '#222236';
    ctx.fillRect(0, standY - 40, canvas.width, 40);

    // Lower tier
    ctx.fillStyle = '#2a2a40';
    ctx.fillRect(0, standY, canvas.width, 60);

    // Crowd - dense pixel people
    const crowdColors = ['#e94560', '#f9d71c', '#54a0ff', '#ff9ff3', '#ffffff', '#00d2d3', '#ff6b81', '#2ecc71'];
    for (let tier = 0; tier < 2; tier++) {
        const baseY = tier === 0 ? standY - 36 : standY + 4;
        const rows = tier === 0 ? 4 : 6;
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < 40; col++) {
                const px = 4 + col * 10;
                const py = baseY + row * 9;
                // Animate: some people stand up randomly
                const bounce = Math.sin(Date.now() * 0.003 + col * 0.7 + row * 1.3) > 0.7 ? -2 : 0;
                ctx.fillStyle = '#ffcc99';
                ctx.fillRect(px + 1, py + bounce, 4, 3);
                ctx.fillStyle = crowdColors[(row * 40 + col + tier * 7) % crowdColors.length];
                ctx.fillRect(px, py + 3 + bounce, 6, 4);
            }
        }
    }

    // Floodlights
    ctx.fillStyle = '#555555';
    ctx.fillRect(20, standY - 100, 3, 100);
    ctx.fillRect(canvas.width - 23, standY - 100, 3, 100);
    ctx.fillStyle = '#ffff88';
    ctx.fillRect(12, standY - 104, 18, 4);
    ctx.fillRect(canvas.width - 30, standY - 104, 18, 4);

    // Roof edge
    ctx.fillStyle = '#333348';
    ctx.fillRect(0, standY - 44, canvas.width, 4);
}

function drawWorldCup() {
    drawBigStadium();

    // Extra: banners and flags
    const flagColors = ['#e94560', '#f9d71c', '#54a0ff', '#2ecc71', '#ff9ff3'];
    for (let i = 0; i < 8; i++) {
        const fx = 20 + i * 50;
        const fy = GROUND_Y - 160;
        // Pole
        ctx.fillStyle = '#888888';
        ctx.fillRect(fx, fy, 2, 20);
        // Flag waving
        const wave = Math.sin(Date.now() * 0.004 + i * 1.5) * 2;
        ctx.fillStyle = flagColors[i % flagColors.length];
        ctx.fillRect(fx + 2, fy + wave, 12, 8);
    }

    // "WORLD CUP" banner
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(canvas.width / 2 - 70, GROUND_Y - 150, 140, 16);
    ctx.fillStyle = '#f9d71c';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('★ WORLD CUP ★', canvas.width / 2, GROUND_Y - 140);

    // Confetti particles
    const confettiColors = ['#e94560', '#f9d71c', '#54a0ff', '#2ecc71', '#ff9ff3'];
    for (let i = 0; i < 15; i++) {
        const cx = (Date.now() * 0.02 + i * 37) % canvas.width;
        const cy = (Math.sin(Date.now() * 0.001 + i * 2.1) * 0.5 + 0.5) * (GROUND_Y - 180);
        ctx.fillStyle = confettiColors[i % confettiColors.length];
        ctx.fillRect(Math.round(cx), Math.round(cy), 3, 3);
    }
}

function drawBackground() {
    const lv = LEVELS[currentLevel];
    ctx.fillStyle = lv.bg;
    ctx.fillRect(-5, -5, canvas.width + 10, canvas.height + 10);

    if (currentLevel === 0) {
        drawStars();
        drawGround();
        drawTrainingField();
    } else if (currentLevel === 1) {
        drawGround();
        drawSmallStadium();
    } else if (currentLevel === 2) {
        drawGround();
        drawBigStadium();
    } else {
        drawGround();
        drawWorldCup();
    }
}

// ── LEVEL TRANSITION SCREEN ──
function drawLevelTransition() {
    levelTransTimer++;
    const lv = LEVELS[currentLevel];

    ctx.fillStyle = '#0f0e17';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const progress = levelTransTimer / LEVEL_TRANS_DURATION;

    // Flash effect
    if (levelTransTimer < 10) {
        ctx.fillStyle = `rgba(255,255,255,${0.5 - levelTransTimer * 0.05})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.globalAlpha = Math.min(levelTransTimer / 15, 1);

    drawText('NEXT LEVEL!', canvas.width / 2, canvas.height / 2 - 60, 32, '#f9d71c');
    drawText(lv.name, canvas.width / 2, canvas.height / 2, 28, '#ffffff');
    drawText('Score: ' + score, canvas.width / 2, canvas.height / 2 + 50, 20, '#00d2d3');

    // Stars animation
    for (let i = 0; i < 5; i++) {
        const angle = (Date.now() * 0.002 + i * Math.PI * 2 / 5);
        const radius = 80 + Math.sin(Date.now() * 0.003) * 10;
        const sx = canvas.width / 2 + Math.cos(angle) * radius;
        const sy = canvas.height / 2 - 30 + Math.sin(angle) * radius;
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
        canKick = false;
        wasGoingDown = false;
    }
}

// Pre-render a soccer ball: draw smooth, then pixelate
let soccerBallCanvas = null;
function renderSoccerBall() {
    // Step 1: Draw a nice soccer ball at high res
    const hiRes = 128;
    const tmp = document.createElement('canvas');
    tmp.width = hiRes;
    tmp.height = hiRes;
    const t = tmp.getContext('2d');
    const cx = hiRes / 2, cy = hiRes / 2, r = hiRes / 2 - 2;

    // White ball base
    t.beginPath();
    t.arc(cx, cy, r, 0, Math.PI * 2);
    t.fillStyle = '#ffffff';
    t.fill();
    t.strokeStyle = '#000000';
    t.lineWidth = 3;
    t.stroke();

    // Draw black pentagons (classic Telstar pattern)
    function drawPentagon(px, py, size) {
        t.beginPath();
        for (let i = 0; i < 5; i++) {
            const angle = (Math.PI * 2 / 5) * i - Math.PI / 2;
            const x = px + Math.cos(angle) * size;
            const y = py + Math.sin(angle) * size;
            if (i === 0) t.moveTo(x, y); else t.lineTo(x, y);
        }
        t.closePath();
        t.fillStyle = '#000000';
        t.fill();
    }

    // Center pentagon
    drawPentagon(cx, cy, r * 0.28);

    // Surrounding pentagons (partially visible at edges)
    for (let i = 0; i < 5; i++) {
        const angle = (Math.PI * 2 / 5) * i - Math.PI / 2;
        const px = cx + Math.cos(angle) * r * 0.75;
        const py = cy + Math.sin(angle) * r * 0.75;
        drawPentagon(px, py, r * 0.22);
    }

    // Draw seam lines from center pentagon to outer pentagons
    t.strokeStyle = '#333333';
    t.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
        const angle = (Math.PI * 2 / 5) * i - Math.PI / 2;
        t.beginPath();
        t.moveTo(cx + Math.cos(angle) * r * 0.28, cy + Math.sin(angle) * r * 0.28);
        t.lineTo(cx + Math.cos(angle) * r * 0.53, cy + Math.sin(angle) * r * 0.53);
        t.stroke();
    }

    // Light shading gradient
    const grad = t.createRadialGradient(cx - r*0.3, cy - r*0.3, r*0.1, cx, cy, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.4)');
    grad.addColorStop(0.7, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.2)');
    t.beginPath();
    t.arc(cx, cy, r, 0, Math.PI * 2);
    t.fillStyle = grad;
    t.fill();

    // Clip to circle
    const clipped = document.createElement('canvas');
    clipped.width = hiRes;
    clipped.height = hiRes;
    const cc = clipped.getContext('2d');
    cc.beginPath();
    cc.arc(cx, cy, r, 0, Math.PI * 2);
    cc.clip();
    cc.drawImage(tmp, 0, 0);

    // Step 2: Pixelate by downscaling then upscaling
    const loRes = 16; // low res for pixel look
    const small = document.createElement('canvas');
    small.width = loRes;
    small.height = loRes;
    const s = small.getContext('2d');
    s.imageSmoothingEnabled = true;
    s.drawImage(clipped, 0, 0, loRes, loRes);

    // Step 3: Scale back up with no smoothing
    const finalSize = 64;
    soccerBallCanvas = document.createElement('canvas');
    soccerBallCanvas.width = finalSize;
    soccerBallCanvas.height = finalSize;
    const f = soccerBallCanvas.getContext('2d');
    f.imageSmoothingEnabled = false;
    f.drawImage(small, 0, 0, finalSize, finalSize);
}
renderSoccerBall();

function drawBall() {
    let shadowScale = 1 - (GROUND_Y - ball.y) / canvas.height;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(ball.x - BALL_SIZE * shadowScale / 2, GROUND_Y + 4, BALL_SIZE * shadowScale, 4);

    // Draw the 8-bit soccer ball sprite
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
        soccerBallCanvas,
        Math.round(ball.x - BALL_SIZE),
        Math.round(ball.y - BALL_SIZE),
        BALL_SIZE * 2,
        BALL_SIZE * 2
    );
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

let stars = [];
for (let i = 0; i < 40; i++) {
    stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * (GROUND_Y - 20),
        blink: Math.random() * 100
    });
}

function drawStars() {
    ctx.fillStyle = '#ffffff';
    for (let s of stars) {
        s.blink += 0.5;
        if (Math.sin(s.blink * 0.05) > 0.3) {
            ctx.fillRect(s.x, s.y, 2, 2);
        }
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
        // Show zone preview
        drawZone();
        drawBall();
        drawText('Lv.0 TRAINING FIELD', 8, 16, 10, '#888888', 'left');
        drawText('KEEP THE BALL UP', canvas.width / 2, 100, 24, COLORS.score);
        drawText('Hit the ball in the', canvas.width / 2, 170, 14, COLORS.text);
        drawText('ZONE only!', canvas.width / 2, 190, 18, COLORS.zoneBorder);
        drawText('One tap per bounce', canvas.width / 2, 220, 14, COLORS.text);
        drawText('SPACE / TAP to start', canvas.width / 2, 260, 16, COLORS.text);
        if (highScore > 0) {
            drawText('Best: ' + highScore, canvas.width / 2, 300, 20, COLORS.score);
        }
    }

    if (state === 'playing') {
        // Physics
        ball.vy += GRAVITY;
        ball.y += ball.vy;
        ball.x += ball.vx;

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

        // Bounce off walls
        if (ball.x < BALL_SIZE) {
            ball.x = BALL_SIZE;
            ball.vx = -ball.vx * 0.8;
        }
        if (ball.x > canvas.width - BALL_SIZE) {
            ball.x = canvas.width - BALL_SIZE;
            ball.vx = -ball.vx * 0.8;
        }

        // Bounce off ceiling
        if (ball.y < BALL_SIZE) {
            ball.y = BALL_SIZE;
            ball.vy = Math.abs(ball.vy) * 0.5;
        }

        // Hit ground = game over
        if (ball.y >= GROUND_Y - BALL_SIZE) {
            ball.y = GROUND_Y - BALL_SIZE;
            state = 'over';
            if (score > highScore) {
                highScore = score;
                localStorage.setItem('keepballup_high', highScore.toString());
            }
        }

        drawZone();
        drawBall();
        updateParticles();
        drawParticles();

        // Score
        drawText(score.toString(), canvas.width / 2, 50, 48, COLORS.score);

        // Level name top-left
        drawText('Lv.' + currentLevel + ' ' + LEVELS[currentLevel].name, 8, 16, 10, '#888888', 'left');

        // Level-up banner (fades out during gameplay)
        if (levelTransTimer > 0) {
            levelTransTimer--;
            const alpha = Math.min(levelTransTimer / 30, 1);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(0, canvas.height / 2 - 40, canvas.width, 80);
            drawText('NEXT LEVEL!', canvas.width / 2, canvas.height / 2 - 15, 28, '#f9d71c');
            drawText(LEVELS[currentLevel].name, canvas.width / 2, canvas.height / 2 + 18, 20, '#ffffff');
            ctx.globalAlpha = 1;
        }

        // Kick status indicator
        if (canKick && ballInZone()) {
            drawText('HIT!', canvas.width / 2, 85, 14, COLORS.zoneBorder);
        } else if (!canKick) {
            drawText('WAIT...', canvas.width / 2, 85, 12, COLORS.zoneBorderLocked);
        }
    }

    if (state === 'over') {
        drawZone();
        drawBall();
        drawParticles();
        updateParticles();

        drawText('GAME OVER', canvas.width / 2, 140, 36, COLORS.ball);
        drawText('Score: ' + score, canvas.width / 2, 200, 28, COLORS.text);
        if (score >= highScore && score > 0) {
            drawText('NEW BEST!', canvas.width / 2, 240, 20, COLORS.score);
        } else {
            drawText('Best: ' + highScore, canvas.width / 2, 240, 20, COLORS.score);
        }
        drawText('TAP or SPACE to retry', canvas.width / 2, 310, 16, COLORS.text);
    }

    ctx.restore();
    requestAnimationFrame(update);
}

// Game loop is started by the loading overlay when "Play Game" is clicked
