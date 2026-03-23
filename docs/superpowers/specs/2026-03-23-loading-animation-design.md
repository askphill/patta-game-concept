# Loading Animation & Splash Screen Spec

## Overview

A 4-phase loading sequence for the Patta x Nike Soccer Tournament game. The loading screen preloads assets while showing progress, then transitions through a logo animation into the splash screen and finally the main menu.

This loading/menu system replaces the existing canvas-drawn splash screen. The HTML title should be updated from "Keep The Ball Up" to "Patta International Soccer Tournament".

## Architecture Decision: DOM Overlay (not Canvas)

The loading animation and menu are implemented as **DOM elements overlaying the canvas**, not drawn on the canvas itself. Rationale:

- CSS transitions/keyframes handle the choreographed animation sequence naturally
- DOM buttons are accessible and interactive without custom hit-testing
- The canvas remains dedicated to gameplay
- The overlay is removed/hidden once the game starts

Structure: A `<div id="loading-overlay">` is added to `index.html`, positioned absolutely over the canvas. It contains all loading/splash/menu elements. When "Play Game" is clicked, the overlay fades out and the canvas game begins.

## Prerequisites: Assets

The following assets are pulled directly from Figma using the Figma MCP (`get_design_context` / `get_screenshot`) during implementation. The current repo only has old T-Rex images which should be replaced.

| Asset | Filename | Figma Source |
|-------|----------|-------------|
| Patta script logo (white) | `assets/patta-logo.png` | Node `0:161` via Figma MCP |
| Nike swoosh (white) | `assets/nike-swoosh.png` | Node `0:162` via Figma MCP |
| Tournament pattern tile | `assets/pattern-tile.png` | Frame 17 (`0:6`) via Figma MCP |
| Tournament title graphic | `assets/tournament-title.png` | Title element via Figma MCP |

Assets are exported using the Figma MCP tools at implementation time — no manual export step needed.

## Phase 1: Loading (Progress Bar)

### Initial State
- Full black screen (#000000) covering the entire viewport
- Three elements vertically centered on screen, horizontally arranged:
  - **Patta logo** (left): 65x39px
  - **Progress bar** (center): 305px wide, 13px tall
  - **Nike swoosh** (right): 60x25px

### Progress Bar
- Container: 305px wide, 13px tall
- Border: 1px solid white, small rounded corners (2px border-radius)
- Fill: white rectangle, left-aligned inside container
- Fill width: starts at 0%, updates proportionally per loaded asset via inline style

### Asset Loading
- Preload via `new Image()`:
  1. `assets/patta-logo.png`
  2. `assets/nike-swoosh.png`
  3. `assets/pattern-tile.png`
  4. `assets/tournament-title.png`
- Each successful load updates fill width (4 assets = 25% increments)
- On all complete: fill snaps to 100%

### Error Handling
- **Timeout:** If total loading exceeds 10 seconds, skip to Phase 4 (menu) with fallback styling (no pattern, text-only title)
- **Individual asset failure:** Continue loading remaining assets. On completion, proceed with whatever loaded successfully. Missing assets are omitted from the splash (e.g., no pattern if tile fails)
- Mirrors existing behavior in `app.js` where `pattaLogo.onerror` skips the splash

### Responsive Scaling
All pixel dimensions in this spec reference the 1440x900 Figma desktop artboard. At implementation:
- The loading overlay fills the viewport (`100vw x 100vh`)
- Inner elements scale proportionally based on viewport width
- On viewports narrower than 500px, the progress bar shrinks to `75vw` and logos scale down proportionally
- All positions use flexbox centering, not absolute pixel coordinates

## Phase 2: Logo Convergence

### Trigger
All assets loaded (or timeout/error fallback), progress bar at 100%.

### Animation Sequence
1. **Pause** 300ms at 100% fill — user registers completion
2. **Progress bar fades out** — opacity 1 → 0, 200ms ease-out
3. **Logos slide to center** — both logos move horizontally to form a centered lockup with ~19px gap between them
   - Duration: 400ms, ease-in-out
   - Logo sizes remain 65x39px (Patta) and 60x25px (Nike)

## Phase 3: Splash Reveal

### Trigger
Logo convergence completes.

### Animation Sequence
1. **Pause** 200ms after logos meet
2. **Center panel expands** from behind the logo lockup:
   - Scales from 0 to full size: min(403px, 90vw) wide, aspect ratio preserved (~403:698)
   - Contains: repeating pattern background (`assets/pattern-tile.png`) and tournament title (`assets/tournament-title.png`), centered
   - Duration: 500ms, ease-out
3. **Logos scale up and slide outward** simultaneously:
   - Patta: 65x39px → 125x76px, slides to left edge of panel (20px outside panel left)
   - Nike: 60x25px → 113x46px, slides to right edge of panel (20px outside panel right)
   - Duration: 500ms (synchronized with panel expand)

## Phase 4: Menu Transition

### Trigger
Splash reveal animation completes.

### Animation Sequence
1. **Hold splash** for 1.5 seconds
2. **Buttons fade in with staggered slide-up** — first button starts immediately, then 100ms delay between subsequent buttons:
   - **Play Game** (green, `#4CAF50`) — appears first (0ms)
   - **Sign Up** (blue, `#2196F3`) — 100ms
   - **View Product/Collection** (orange, `#FF9800`) — 200ms
   - **View Leaderboard** (red, `#F44336`) — 300ms
   - Per button: opacity 0 → 1, translateY 20px → 0, 300ms ease-out
3. **Footer fades in** 200ms after last button completes:
   - Text: "© 2026 Patta. All rights reserved." (hardcoded year to match branding)
   - Opacity 0 → 1, 200ms ease-out

### Button Behavior
- All buttons are `<button>` elements for accessibility
- "Play Game" hides the overlay and starts the canvas game
- "Sign Up", "View Product/Collection", "View Leaderboard" are placeholder — implementation TBD (can link to external URLs or open modals)

### Final State
Buttons centered horizontally in panel, stacked vertically below tournament title. Panel, pattern background, and logos remain in splash positions.

## Skip Mechanism

At any point during Phases 1-3, the user can **tap anywhere or press Space** to skip directly to the final menu state (Phase 4 complete). This mirrors the existing tap-to-skip behavior and prevents frustration for returning users.

## Technical Approach

**DOM overlay with CSS animations and JS asset loader:**
- `<div id="loading-overlay">` contains all loading/splash/menu DOM elements
- JS preloads images via `new Image()`, updates progress bar width via CSS variable (`--progress`)
- All transitions within the loading sequence (logo slide, splash reveal, menu fade-in) are CSS transitions/keyframes
- Animation phases chained via `transitionend`/`animationend` event listeners
- No external dependencies

**CSS View Transitions API for page-level transitions:**
- The transition from menu → game uses `document.startViewTransition()` for a smooth cross-fade
- "Play Game" button triggers a view transition: the overlay fades out while the canvas fades in
- Fallback: if `View Transitions API` is unsupported, fall back to a simple opacity transition
- View transitions may also be used for future screen changes (e.g., game → leaderboard) if needed

## Timing Summary

| Phase | Duration | Cumulative |
|-------|----------|------------|
| 1. Progress bar fill | Variable (asset-dependent) | Variable |
| 1→2. Pause at 100% | 300ms | +300ms |
| 2. Bar fade out | 200ms | +500ms |
| 2. Logo convergence | 400ms | +900ms |
| 2→3. Pause | 200ms | +1100ms |
| 3. Splash reveal + logo scale | 500ms | +1600ms |
| 3→4. Hold splash | 1500ms | +3100ms |
| 4. Button stagger (4 buttons) | 600ms (first at 0ms, last starts at 300ms + 300ms anim) | +3700ms |
| 4. Footer fade | 200ms after last button | +3900ms |

Total post-load animation: ~3.9 seconds (skippable)
