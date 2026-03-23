# Loading Animation & Splash Screen Spec

## Overview

A 4-phase loading sequence for the Patta x Nike Soccer Tournament game. The loading screen preloads assets while showing progress, then transitions through a logo animation into the splash screen and finally the main menu.

## Phase 1: Loading (Progress Bar)

### Initial State
- Full black screen (#000000)
- Three elements vertically centered on screen, horizontally arranged:
  - **Patta logo** (left): 65x39px
  - **Progress bar** (center): 305x13px container
  - **Nike swoosh** (right): 60x25px

### Progress Bar
- Container: 305px wide, 13px tall
- Border: 1px solid white, small rounded corners
- Fill: white rectangle, left-aligned inside container
- Fill width: starts at 0%, updates proportionally per loaded asset

### Asset Loading
- Preload via `new Image()`:
  1. Patta logo (`image 3`)
  2. Nike swoosh (`image 6`)
  3. Background pattern (tournament pattern tile)
  4. Tournament title graphic ("International Patta Soccer Tournament")
- Each asset load completion updates fill width (4 assets = 25% increments)
- On all complete: fill snaps to 100%

## Phase 2: Logo Convergence

### Trigger
All assets loaded, progress bar at 100%.

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
   - Scales from 0 to full size: 403x698px
   - Contains: repeating pattern background (Patta logos + soccer ball icons on dark background) and "International Patta Soccer Tournament" title in red/orange retro pixel-style typography, centered
   - Duration: 500ms, ease-out
3. **Logos scale up and slide outward** simultaneously:
   - Patta: 65x39px → 125x76px, slides to far left
   - Nike: 60x25px → 113x46px, slides to far right
   - Duration: 500ms (synchronized with panel expand)

## Phase 4: Menu Transition

### Trigger
Splash reveal animation completes.

### Animation Sequence
1. **Hold splash** for 1.5 seconds
2. **Buttons fade in with staggered slide-up**, 100ms delay between each:
   - **Play Game** (green) — first
   - **Sign Up** (blue)
   - **View Product/Collection** (orange)
   - **View Leaderboard** (red)
   - Per button: opacity 0 → 1, translateY 20px → 0, 300ms ease-out
3. **Footer fades in** 200ms after last button:
   - Text: "© 2026 Patta. All rights reserved."
   - Opacity 0 → 1, 200ms ease-out

### Final State
Buttons centered horizontally in panel, stacked vertically below tournament title. Panel, pattern background, and logos remain in splash positions.

## Technical Approach

**CSS-only animations with JS asset loader:**
- JS preloads images via `new Image()`, updates progress bar width via CSS variable (`--progress`)
- All transitions (logo slide, splash reveal, menu fade-in) are CSS transitions/keyframes
- Animation phases chained via `transitionend`/`animationend` event listeners
- No external dependencies

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
| 4. Button stagger (4 buttons) | 300ms + 3x100ms = 600ms | +3700ms |
| 4. Footer fade | 200ms after last button | +3900ms |

Total post-load animation: ~3.9 seconds
