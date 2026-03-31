# TODOS

## Online Play (Phase 11)

**Priority:** P1
- [ ] Define lobby-to-game transition model (URL redirect vs SPA view swap)
- [ ] Specify all 11 missing UI states (loading, empty, error for each component)
- [ ] Define post-game flow (result -> AI analysis CTA -> new game / lobby)
- [ ] Add Firebase Security Rules for nickname sanitization (max 20 chars, textContent only)
- [ ] Add Firebase transaction for concurrent move submission
- [ ] Specify timer synchronization strategy (server timestamps)
- [ ] Document 8 unspecified error paths (see Error & Rescue Map in autoplan review)
- [ ] Add mobile-responsive lobby design
- [ ] Add sound notification for opponent move

**Priority:** P2
- [ ] Specify scoring disagreement resolution for online play
- [ ] Define max spectators per room (Firebase listener limits)
- [ ] Add Firebase debug logging strategy
- [ ] Specify deployment hosting (Firebase Hosting / Cloudflare Pages / other)
- [ ] Optimize boardHistory to use incremental diffs instead of full clones
- [ ] Fix timer to use wall-clock timestamps instead of setInterval

## Architecture (Pre-Phase 11)

**Priority:** P1
- [ ] Introduce command/event abstraction layer (actions produce events, applied locally + sent to Firebase)
- [ ] Eliminate dual-state pattern (module-level let vars + GameState store -> single source of truth)
- [ ] Ensure only ui.js touches DOM (AI controller currently bypasses UI layer)

## Future Features

**Priority:** P3
- [ ] Ranked matchmaking (needs user accounts + Elo system)
- [ ] In-game chat
- [ ] Game replay sharing via URL

## Completed
(none yet)
