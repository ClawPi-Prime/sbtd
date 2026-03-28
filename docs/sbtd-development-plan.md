# SquadBattleTD — Development Plan

> Version: 0.1 | Status: Draft | Date: 2026-03-28

This is a phased plan from zero to alpha. Each phase has clear deliverables and a "done when" definition. Phases are sequential — don't start Phase N+1 until Phase N is shippable.

---

## Phase 0 — Foundation
**Goal:** Working repo, CI, local Docker stack, and a live (blank) page at sbtd.io.  
**No gameplay. Just the scaffolding.**  
**Estimated scope: 1 week**

### Deliverables

**Repo setup**
- [ ] Create `sbtd` monorepo on GitHub (ClawPi-Prime/sbtd)
- [ ] Add `client/`, `server/`, `shared/`, `k8s/`, `docs/` directories
- [ ] `client/`: Vite + TypeScript scaffold (`npm create vite@latest`)
- [ ] `server/`: Colyseus TypeScript scaffold (`npm create colyseus-app@latest`)
- [ ] `shared/`: TypeScript project with basic type stubs
- [ ] TypeScript project references wiring (`tsconfig.json` in each, `tsconfig.base.json` at root)
- [ ] ESLint + Prettier config shared via root config
- [ ] `.gitignore`, `README.md`

**CI**
- [ ] GitHub Actions workflow: on push to `main` → `npm ci && npm run build` in client, server, shared
- [ ] Fail on TypeScript errors or lint errors
- [ ] No test suite yet (Phase 5)

**Docker**
- [ ] `client/Dockerfile`: `vite build` → nginx:alpine serving `dist/`
- [ ] `server/Dockerfile`: TypeScript build → `node dist/index.js`
- [ ] `db/`: Official postgres:16 image
- [ ] `docker-compose.yml`: all three services, local networking, env file support
- [ ] `docker compose up` → game server reachable at `localhost:2567`, blank Vite page at `localhost:5173`

**k3s deploy**
- [ ] Apply namespace, client deployment, server deployment, db statefulset
- [ ] Services wired up (ClusterIP internal)
- [ ] Server can connect to DB via `POSTGRES_URL` secret

**Cloudflare Tunnel**
- [ ] Tunnel created in Cloudflare dashboard (requires Morbror account — see owner decisions)
- [ ] `cloudflared` pod deployed in k3s with tunnel credentials secret
- [ ] sbtd.io resolves and returns a page (even if just "coming soon")

**Done when:** `git push` triggers green CI. `docker compose up` runs cleanly. sbtd.io is live.

---

## Phase 1 — Game Framework Skeleton
**Goal:** A running game loop with scene flow, map rendering, and units you can place — but no combat.  
**Estimated scope: 2–3 weeks**

### Deliverables

**Phaser scenes**
- [ ] `BootScene`: Sets Phaser config (canvas size, physics off). Transitions to Preload.
- [ ] `PreloadScene`: Loads all assets (placeholder colored rectangles as sprites, map JSON). Progress bar. Transitions to MainMenu.
- [ ] `MainMenuScene`: "Play vs CPU", "Play vs Human", Settings (stubbed). HTML overlay for buttons.
- [ ] `LobbyScene`: Race selection panel (one race: Human Alliance). Ready button. HTML overlay.
- [ ] `GameScene`: Map renders. Build panel visible. Units placeable (no combat). Wave timer (not functional).
- [ ] `GameOverScene`: "You win / You lose". Back to menu.

**Colyseus rooms (basic)**
- [ ] `LobbyRoom`: State schema with players, race, ready. Messages: `set_name`, `select_race`, `set_ready`. Countdown on all-ready.
- [ ] `GameRoom`: State schema with players, phase (`build`), waveNumber. Messages: `place_unit`, `sell_unit`. Gold tracked server-side.
- [ ] Client Colyseus wrapper: `ColyseusClient` class, `joinOrCreate` helpers, typed message sends.
- [ ] Schema change callbacks wired to HUD updates.

**Map system**
- [ ] `MapConfig` JSON for one map (simple 1-lane layout)
- [ ] `MapRenderer` (client): renders tile grid from config, marks spawn/exit/buildable zones with colored overlays
- [ ] `LaneRouter` (shared): returns waypoint array from map config

**Unit system (placement only)**
- [ ] `UnitDefinition` interface defined in `shared/`
- [ ] `UnitRegistry`: loads unit JSON files at startup
- [ ] Build panel: shows available units for selected race, costs, click-to-place
- [ ] `UnitFactory` (server): validates placement (buildable zone? enough gold?), creates `UnitState`, deducts gold
- [ ] Client: spawns colored placeholder `UnitSprite` on schema add

**Race system**
- [ ] `RaceDefinition` interface in `shared/`
- [ ] One race config: Human Alliance (5–6 unit types, placeholder stats)
- [ ] Race loading at server startup and client build panel

**Done when:** You can open sbtd.io, join a lobby, select a race, enter the game, place units on the map, and see gold deducted. No combat.

---

## Phase 2 — Combat Engine
**Goal:** Units fight. Waves spawn. Kings take damage. Someone wins.  
**Estimated scope: 2–3 weeks**

### Deliverables

**Wave spawning**
- [ ] `WaveSpawner` (server): reads wave config (unit types, count, interval), spawns `UnitState` objects at spawn zone each wave
- [ ] Wave definitions in JSON (or procedural for early testing)
- [ ] Build phase ends → combat phase begins automatically

**Unit movement**
- [ ] `MovementSystem` (server): advances units along lane waypoints at their defined speed each tick
- [ ] `UnitState` position fields updated every tick
- [ ] Client interpolation: Phaser `update()` lerps sprite position between ticks (20Hz server, 60fps client)

**Combat resolution**
- [ ] `CombatSystem` (server): units in range → attack at `attackRate`, deal damage accounting for armor type table
- [ ] `AttackType` × `ArmorType` damage multiplier table (shared constant)
- [ ] Units die when HP ≤ 0 → `UnitState.state = "dead"` → removed from schema
- [ ] Client: dead units play placeholder death animation (flash + remove)

**Armor system**
- [ ] 5 attack types × 6 armor types damage multiplier table
- [ ] Defined as constant in `shared/`

**Special abilities (4 types)**
- [ ] `AbilitySystem` (server): resolves abilities by type
- [ ] **Charge**: unit increases speed by X for Y seconds on combat start
- [ ] **Splash**: attacks deal % damage to units within radius
- [ ] **Heal**: unit restores HP to nearby friendlies per second
- [ ] **Aura**: passive multiplier to nearby unit stats (attack, speed, armor)
- [ ] Abilities defined in unit JSON, resolved generically by system

**King's Chamber**
- [ ] Units reaching exit zone deal 1 damage to King HP (or per-unit damage value)
- [ ] King HP tracked in `PlayerState.kingHp`
- [ ] King HP ≤ 0 → `GameRoom` sets `phase = "result"`, winner determined
- [ ] Clients transition to `GameOverScene`

**Done when:** Two waves of enemy units spawn, walk down the lane, get attacked by placed units, some die, some reach the King. King dies after enough get through. Game over screen shows.

---

## Phase 3 — Multiplayer
**Goal:** Two humans can play against each other synchronised over the network.  
**Estimated scope: 2–3 weeks**

### Deliverables

**Authoritative game state**
- [ ] Both players' units tracked in `GameRoomState` under their `PlayerState`
- [ ] Server validates all unit placements (no client-side cheating)
- [ ] Wave start/end synchronized — both sides advance together

**Two-player synchronised waves**
- [ ] Build phase: both players place units simultaneously (shared countdown)
- [ ] "Vote to start early": if both players send `ready_early`, skip remaining build time
- [ ] Combat phase: both sides' combat runs simultaneously, server-authoritative
- [ ] Wave income sent to both players simultaneously after each wave

**Opponent rendering**
- [ ] Opponent's side rendered on client (right side of canvas or mirrored)
- [ ] Opponent `UnitState` changes trigger sprite creation/destruction on client
- [ ] Linear interpolation applied to opponent units too
- [ ] King HP bars for both players visible in HUD

**Disconnect handling**
- [ ] `allowReconnection(client, 30)` — 30s reconnect window
- [ ] HUD shows "Opponent disconnected — waiting..." during window
- [ ] After window expires: opponent forfeits, winner declared
- [ ] If player fails to reconnect: rejoin flow sends them to `GameOverScene` with result

**Lobby to game flow**
- [ ] `LobbyRoom` countdown → `GameRoom` `onCreate` with `MatchConfig`
- [ ] Both players seamlessly transition from Lobby to Game scene
- [ ] Player names shown in HUD throughout match

**Done when:** Two players in different browsers on the same Pi can play a full match, see each other's units, and get a winner screen.

---

## Phase 4 — CPU Player
**Goal:** Play against the computer.  
**Estimated scope: 2 weeks**

### Deliverables

**Interface**
- [ ] `ICPUPlayer` interface: `onBuildPhaseStart(state, budget): PlacementAction[]`, `onWaveResult(result): void`
- [ ] `CPUPlayerSlot`: wraps `ICPUPlayer`, plugs into `GameRoom` as a synthetic player
- [ ] `GameRoom` detects `mode === "1vCPU"` → creates `CPUPlayerSlot` for P2

**Easy — Rule-based**
- [ ] Finds cheapest affordable unit in race, fills available build tiles
- [ ] No adaptation between waves

**Medium — Threat map + greedy heuristic**
- [ ] Scores opponent's units by attack type and volume
- [ ] Picks units whose armor type counters the dominant threat
- [ ] Greedy fill within budget
- [ ] Light adaptation: if King took heavy damage last wave, prioritises tanky units

**Hard — Simulation-based**
- [ ] `HeadlessCombatSimulator`: cloned combat engine (no Phaser, no Colyseus, pure TypeScript)
- [ ] On build phase start: generates N candidate builds (random + heuristic seeded)
- [ ] Simulates each candidate against a model of opponent's current build
- [ ] Picks build with best outcome (king HP preserved / most enemies killed)
- [ ] Time-boxed: max 200ms computation per build phase

**Done when:** 1vCPU mode is selectable from main menu. All three difficulties produce distinct, sensible behavior.

---

## Phase 5 — Alpha Polish
**Goal:** The game is safe, presentable, and robust enough for strangers to play.  
**Estimated scope: 1–2 weeks**

### Deliverables

**Identity**
- [ ] UUID cookie generated on first visit, persisted in `localStorage` + cookie
- [ ] Display name: text input in lobby, saved to `localStorage`, sent to `LobbyRoom`
- [ ] Anonymous players persist match history under their UUID in PostgreSQL

**Security hardening**
- [ ] `helmet` middleware on Colyseus HTTP server
- [ ] Rate limiting: max 10 join attempts per IP per minute
- [ ] Input validation: display name length/char limits, unit placement validation already server-side
- [ ] CORS: only allow `sbtd.io` origin in production

**Leaderboard**
- [ ] PostgreSQL query: wins, losses, win rate per UUID
- [ ] `/api/leaderboard` endpoint (top 20 by win rate, min 5 games)
- [ ] Simple HTML table in main menu (no React, DOM manipulation)

**Error handling**
- [ ] Global error boundary on Phaser scenes (catch unhandled exceptions, show error screen)
- [ ] Colyseus reconnection retry loop in client wrapper (3 retries, exponential backoff)
- [ ] "Server unavailable" screen if Colyseus unreachable on startup

**Version display**
- [ ] `VITE_APP_VERSION` injected from `package.json` version at build time
- [ ] Shown in main menu footer and `GameOver` screen

**Done when:** A stranger can visit sbtd.io, pick a name, play a game against CPU, see their record on the leaderboard, and the server doesn't crash under normal use.

---

## Phase 6 — Alpha Release
**Goal:** Ship it.

### Checklist

**Infrastructure**
- [ ] Domain `sbtd.io` registered (requires Morbror action — credit card / Cloudflare account)
- [ ] Cloudflare Tunnel confirmed working at sbtd.io with valid certificate
- [ ] PostgreSQL daily backup CronJob running and tested (restore drill)
- [ ] Resource limits set on all k8s pods (prevent Pi OOM)
- [ ] Horizontal pod autoscaler considered (or note: Pi single-node, no HPA needed yet)

**Smoke test checklist**
- [ ] Visit sbtd.io on mobile + desktop: page loads < 3s
- [ ] Set display name → enter lobby → select race → ready
- [ ] 1vCPU: Easy, Medium, Hard — all complete without crash
- [ ] 1v1: two browsers on Pi LAN — full match, winner screen
- [ ] Disconnect test: player disconnects mid-game, reconnects within 30s
- [ ] Leaderboard: shows data after 3+ matches played
- [ ] Version number visible in footer

**Announce alpha**
- [ ] Write brief announcement post (Discord / wherever Morbror wants)
- [ ] Note known limitations (placeholder art, no sound, limited races)
- [ ] Invite testers

---

## Velocity Notes

This plan assumes solo or near-solo development with occasional product owner review. Estimates are loose — they represent realistic minimums assuming focused sessions, not continuous 8-hour days.

**Total estimated time to alpha:** ~10–14 weeks from Phase 0 start.

Phase 0: 1 week  
Phase 1: 2–3 weeks  
Phase 2: 2–3 weeks  
Phase 3: 2–3 weeks  
Phase 4: 2 weeks  
Phase 5: 1–2 weeks  
Phase 6: 1 week (mostly checklist + coordination)

The biggest risk is Phase 2–3 (combat + multiplayer). These are where the hardest design decisions happen. Build phase 2 in single-player mode first (1vCPU CPU player is dumb placeholder), then layer multiplayer on top in Phase 3.
