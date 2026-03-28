# SquadBattleTD — Architecture Document

> Version: 0.1 | Status: Draft | Date: 2026-03-28

---

## 1. Stack Overview

### Frontend
| Concern | Technology |
|---|---|
| Rendering engine | Phaser 3 (TypeScript) |
| Bundler | Vite |
| Language | TypeScript |
| UI / Menus | Custom HTML + CSS + TypeScript (no React) |
| Identity | Anonymous UUID stored in cookie, free-choice display name |

### Backend
| Concern | Technology |
|---|---|
| Game server framework | Colyseus 0.17 (Node.js) |
| Language | TypeScript |
| Transport | WebSocket (default), upgradeable to uWebSockets.js |
| HTTP layer | Built-in Colyseus HTTP routes (or Express for extras) |

### Data
| Concern | Technology |
|---|---|
| Primary database | PostgreSQL 16 |
| ORM / query | pg (node-postgres) or Prisma |

### Infrastructure
| Concern | Technology |
|---|---|
| Containers | Docker |
| Orchestration | k3s (Raspberry Pi 4, cloud-portable) |
| Public access | Cloudflare Tunnel → sbtd.io |
| TLS | Cloudflare (terminates at edge) |
| Secrets | Kubernetes Secrets + env injection |

---

## 2. Repository Structure

Monorepo — single Git repository, no build tooling coupling between packages unless shared types require it.

```
sbtd/
├── client/                   # Phaser 3 game (Vite + TypeScript)
│   ├── src/
│   │   ├── scenes/           # Phaser Scene subclasses
│   │   ├── systems/          # Gameplay systems (combat, unit, race)
│   │   ├── ui/               # HUD components, lobby screens
│   │   ├── net/              # Colyseus client wrapper, room handlers
│   │   └── assets/           # Sprites, tilemaps, audio (gitignored large files)
│   ├── public/               # Static HTML shell
│   ├── vite.config.ts
│   └── tsconfig.json
│
├── server/                   # Colyseus game server (TypeScript)
│   ├── src/
│   │   ├── rooms/            # LobbyRoom, GameRoom
│   │   ├── state/            # Colyseus Schema definitions
│   │   ├── systems/          # Server-side combat engine, wave spawner, AI
│   │   ├── db/               # PostgreSQL queries / Prisma schema
│   │   └── index.ts          # Entry point
│   └── tsconfig.json
│
├── shared/                   # Shared TypeScript interfaces (imported by both)
│   ├── types/
│   │   ├── unit.ts           # UnitDefinition, AbilityDefinition
│   │   ├── race.ts           # RaceDefinition
│   │   ├── map.ts            # MapConfig
│   │   └── match.ts          # MatchConfig, GameMode
│   └── tsconfig.json
│
├── k8s/                      # Kubernetes manifests (k3s compatible)
│   ├── namespace.yaml
│   ├── client-deployment.yaml
│   ├── server-deployment.yaml
│   ├── db-statefulset.yaml
│   ├── services.yaml
│   ├── secrets.yaml          # Template only — actual secrets in k3s cluster
│   └── cloudflare-tunnel.yaml
│
├── docs/                     # Architecture, development plan, decisions
├── docker-compose.yml        # Local development stack
├── .github/
│   └── workflows/
│       └── ci.yml            # Build check on push
└── README.md
```

### Shared types strategy

`shared/` contains pure TypeScript interfaces and enums — no runtime dependencies. Both `client/` and `server/` import from `shared/` via TypeScript project references or path aliases. This ensures unit definitions, map configs, and match configs are type-safe on both sides without duplication.

---

## 3. Game Framework Layers

### 3.1 Engine Layer (Client)
**Responsibility:** Phaser 3 infrastructure — scene lifecycle, asset loading, rendering pipeline.

- `SceneManager`: Phaser's built-in scene stack. Custom `BaseScene` class adds shared utilities (event bus, debug overlay).
- `AssetLoader`: Centralized in `PreloadScene`. Loads spritesheets, tilemaps, audio, JSON configs. Placeholder sprites swappable without code changes.
- `SpriteSystem`: Factory for creating Phaser `Sprite` / `Image` objects from unit definitions. Handles animations defined in spritesheet metadata.
- `AnimationRegistry`: Registers Phaser animations from config JSON on startup. Units reference animation keys by string.

### 3.2 Map Layer
**Responsibility:** Configurable map definitions, tile grid rendering, lane routing.

- Maps defined as JSON (`MapConfig`) — loaded at runtime, not hardcoded.
- Each map specifies: grid dimensions, tile size, spawn zones, exit zones (King's Chamber), lane waypoints, decoration tiles.
- `MapRenderer` (client): Reads `MapConfig`, renders tile grid using Phaser `TilemapLayer`. Shows opponent side mirrored or separate.
- `LaneRouter` (server + shared): Computes waypoints for unit pathfinding given a map config. Used by both combat engine and client for movement prediction.

### 3.3 Unit System
**Responsibility:** Data-driven unit definitions, spawning, lifecycle.

- `UnitDefinition` (shared interface): name, race, cost, HP, damage, armor type, attack type, speed, range, abilities[], sprite key.
- `UnitFactory` (server): Takes `UnitDefinition` + owner + position → creates live `UnitState` (Colyseus schema). No hardcoded unit logic.
- `UnitRegistry` (shared): Map of `unitId → UnitDefinition`. Loaded from JSON at startup on both client and server.
- Client spawns visual `UnitSprite` from schema state. Server owns authoritative position and health.

### 3.4 Race System
**Responsibility:** Race configuration — determines available units per player.

- `RaceDefinition` (shared interface): name, theme, available unit IDs[], lore string, color palette hint.
- Races loaded from JSON at runtime. Adding a new race = adding a JSON file, no code change required.
- Race selection happens in `LobbyRoom` before match starts. Locked into `MatchConfig` at game start.
- Client filters `UnitRegistry` to available race units for the build panel.

### 3.5 Game Mode System
**Responsibility:** 1v1, 1vCPU, team vs team — match configuration.

- `MatchConfig` (shared interface): mode (`"1v1" | "1vCPU" | "2v2"`), map ID, wave count, income rate, starting gold.
- `GameRoom` reads `MatchConfig` to wire up the correct player slots (human or CPU), team assignments, and win conditions.
- CPU player slot is transparent to the room — it implements the same `IPlayer` interface as a human socket connection.

### 3.6 Combat Engine (Server-Authoritative)
**Responsibility:** Update loop, unit movement, damage resolution, win conditions.

- Runs on server inside `GameRoom` at fixed tickrate (e.g., 20 Hz).
- `CombatSystem.update(dt)`: iterates all live units, advances movement along lane waypoints, resolves attacks, applies damage/armor.
- Armor types and attack types interact via a lookup table (e.g., Normal vs Fortified = 70% damage).
- Special abilities are resolved as `AbilityEffect` objects triggered by combat events.
- King's Chamber: units reaching exit zone deal damage to the King's HP. When HP reaches 0, round is lost.
- All state mutations happen via Colyseus schema objects → automatically delta-encoded and pushed to clients.

### 3.7 AI System (CPU Player)
**Responsibility:** Simulate a human player for single-player and mixed modes.

- `ICPUPlayer` interface: `onBuildPhaseStart(state, budget)`, `onWaveResult(result)`, `onMatchEnd()`.
- **Easy**: Rule-based. Buys the cheapest affordable unit, fills the lane.
- **Medium**: Threat map. Scores opponent units by threat level, picks counter units greedily within budget.
- **Hard**: Simulation-based. Runs headless combat simulation for candidate builds, picks highest win-rate build within budget and time limit.
- CPU player runs server-side. No client involvement. Plugs into same `IPlayer` slot as a human.

### 3.8 Multiplayer Layer (Colyseus)
**Responsibility:** Room lifecycle, state synchronisation, reconnection.

See Section 4 for detailed room design.

- Colyseus handles WebSocket connections, room matchmaking, and delta-encoded state sync automatically.
- Only schema-decorated fields are synced. Local-only fields (client animation state, visual effects) stay on the client.
- Colyseus v0.17 supports TypeScript natively — server project is scaffolded with TS out of the box.

---

## 4. Colyseus Room Design

### 4.1 LobbyRoom

**Purpose:** Pre-game gathering point. Players select races, declare ready, game countdown.

**State Schema:**
```typescript
class LobbyPlayerState extends Schema {
  @type("string") sessionId: string;
  @type("string") displayName: string;
  @type("string") selectedRace: string;
  @type("boolean") ready: boolean;
}

class LobbyRoomState extends Schema {
  @type({ map: LobbyPlayerState }) players = new MapSchema<LobbyPlayerState>();
  @type("string") status: "waiting" | "countdown" | "starting";
  @type("number") countdownSeconds: number;
}
```

**Lifecycle:**
1. `onCreate`: Initialize state, set maxClients (2 for 1v1, 4 for 2v2).
2. `onJoin`: Add player to `players` map, assign UUID from cookie or generate.
3. Messages: `select_race`, `set_ready`, `set_name`.
4. When all players ready → start countdown → `broadcast` `game_starting` → transition to `GameRoom`.
5. `onLeave`: Remove player, cancel countdown if active.

**What's local (not synced):** UI animations, hover states.

---

### 4.2 GameRoom

**Purpose:** Authoritative game state. Runs the combat engine. Owns the full match lifecycle.

**State Schema:**
```typescript
class UnitState extends Schema {
  @type("string") id: string;
  @type("string") unitDefId: string;
  @type("string") ownerId: string;
  @type("number") x: number;
  @type("number") y: number;
  @type("number") hp: number;
  @type("number") maxHp: number;
  @type("string") state: "idle" | "moving" | "attacking" | "dead";
}

class PlayerState extends Schema {
  @type("string") sessionId: string;
  @type("string") displayName: string;
  @type("string") race: string;
  @type("number") gold: number;
  @type("number") kingHp: number;
  @type("boolean") ready: boolean;
  @type({ map: UnitState }) units = new MapSchema<UnitState>();
}

class GameRoomState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type("string") phase: "build" | "combat" | "result";
  @type("number") waveNumber: number;
  @type("number") buildTimeRemaining: number;
  @type("string") winner: string; // sessionId or ""
}
```

**Phases:**
- **Build phase**: Timer running. Players send `place_unit` / `sell_unit` messages. Server validates gold and placement.
- **Combat phase**: Server runs `CombatSystem.update()` at fixed tickrate. Schema mutations flow to clients automatically.
- **Result phase**: Winner determined, stats recorded to PostgreSQL, clients shown `GameOver` screen.

**Reconnection:** Colyseus has built-in reconnection token support. Players who disconnect during combat are held for 30s; if they reconnect, their state is restored.

**What's local (not synced):** Visual effects (death particles, hit flashes), animation frames, predicted unit positions between ticks (client-side interpolation), HUD transition states.

---

## 5. Client Architecture

### 5.1 Phaser Scene Flow

```
Boot
 └── Preload              (load all assets, show progress bar)
      └── MainMenu        (play, settings, credits)
           └── Lobby      (race select, ready, countdown)
                └── Game  (main gameplay scene)
                     └── GameOver  (results, rematch, back to menu)
```

Each scene is a class extending Phaser `Scene`. Shared game state (Colyseus room reference, match config) is passed via scene `init()` data or a singleton `GameContext` object.

### 5.2 HUD Layer

The HUD is **HTML overlay** on top of the Phaser canvas (CSS `position: absolute`). This approach:
- Avoids complexity of rendering text/buttons in Phaser
- Allows standard CSS for layout (flexbox, grid)
- Keeps Phaser canvas purely for game world rendering

HUD elements: gold counter, wave timer, king HP bar, unit build panel, opponent status strip.

The HUD is driven by a `HUDController` class that subscribes to Colyseus schema change callbacks and updates DOM elements directly.

### 5.3 Opponent Rendering

The opponent's units are rendered on the same Phaser canvas (separate layer/group). Client receives opponent unit positions via the synced `GameRoomState`. Between server ticks, client applies **linear interpolation** to smooth unit movement (standard technique, documented in Colyseus Phaser tutorial series Part 2).

Opponent lane is rendered on the right side of the canvas (or a mirrored layout depending on map config).

---

## 6. Data Models

### 6.1 MapConfig (JSON)
```typescript
interface MapConfig {
  id: string;
  name: string;
  gridWidth: number;
  gridHeight: number;
  tileSize: number;              // pixels
  lanes: LaneConfig[];
  spawnZone: ZoneRect;
  exitZone: ZoneRect;            // King's Chamber
  buildableZones: ZoneRect[];
  decorationTiles: TilePlacement[];
  backgroundKey: string;         // spritesheet key
}

interface LaneConfig {
  id: string;
  waypoints: { x: number; y: number }[];
}

interface ZoneRect {
  x: number; y: number; width: number; height: number;
}
```

### 6.2 UnitDefinition (TypeScript — shared/)
```typescript
interface UnitDefinition {
  id: string;
  name: string;
  raceId: string;
  cost: number;
  hp: number;
  damage: number;
  attackType: AttackType;
  armorType: ArmorType;
  speed: number;
  range: number;
  attackRate: number;            // attacks per second
  abilities: AbilityRef[];
  spriteKey: string;
  description: string;
}

type AttackType = "normal" | "pierce" | "siege" | "magic" | "chaos";
type ArmorType = "unarmored" | "light" | "medium" | "heavy" | "fortified" | "divine";

interface AbilityRef {
  abilityId: string;
  params?: Record<string, number>;
}
```

### 6.3 RaceDefinition
```typescript
interface RaceDefinition {
  id: string;
  name: string;
  theme: string;
  lore: string;
  availableUnitIds: string[];
  colorPrimary: string;          // CSS hex — for placeholder sprites
  colorSecondary: string;
}
```

### 6.4 MatchConfig
```typescript
interface MatchConfig {
  mode: "1v1" | "1vCPU" | "2v2";
  mapId: string;
  totalWaves: number;
  buildPhaseDurationSec: number;
  startingGold: number;
  incomePerWave: number;
  cpuDifficulty?: "easy" | "medium" | "hard";
}
```

### 6.5 Player Record (PostgreSQL)
```sql
CREATE TABLE players (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name VARCHAR(32) NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE match_results (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  played_at    TIMESTAMPTZ DEFAULT NOW(),
  mode         VARCHAR(8) NOT NULL,
  map_id       VARCHAR(64) NOT NULL,
  winner_id    UUID REFERENCES players(id),
  duration_sec INT
);

CREATE TABLE match_players (
  match_id   UUID REFERENCES match_results(id),
  player_id  UUID REFERENCES players(id),
  race_id    VARCHAR(64),
  final_king_hp INT,
  waves_cleared INT,
  PRIMARY KEY (match_id, player_id)
);
```

---

## 7. Deployment Architecture

### 7.1 Container Overview

Three containers, all defined in `docker-compose.yml` for local dev and mirrored in k8s manifests for production.

```
┌─────────────────────────────────────────────────────┐
│ Cloudflare Edge (sbtd.io)                           │
│  ↓ HTTPS / WSS                                      │
├─────────────────────────────────────────────────────┤
│ Cloudflare Tunnel (cloudflared pod)                 │
│  ↓ routes / → client, /api → server, /ws → server  │
├───────────────┬─────────────────┬───────────────────┤
│  client       │  server         │  db               │
│  nginx:alpine │  node:lts-alpine│  postgres:16      │
│  serves Vite  │  Colyseus +     │  data volume      │
│  build output │  HTTP routes    │  persistent PVC   │
└───────────────┴────────┬────────┴───────────────────┘
                         │ TCP 5432 (internal only)
```

### 7.2 k8s Manifests Summary

```
k8s/
├── namespace.yaml          # namespace: sbtd
├── client-deployment.yaml  # Deployment + ClusterIP Service (port 80)
├── server-deployment.yaml  # Deployment + ClusterIP Service (port 2567)
├── db-statefulset.yaml     # StatefulSet + PVC + ClusterIP Service (port 5432)
├── services.yaml           # (consolidated if preferred)
├── secrets.yaml            # TEMPLATE — values injected by kubectl or CI
└── cloudflare-tunnel.yaml  # cloudflared Deployment + ConfigMap
```

Key manifest notes:
- Server deployment: `POSTGRES_URL` injected from Secret.
- DB uses `PersistentVolumeClaim` with `local-path` storage class (k3s default).
- `cloudflared` config routes by hostname/path prefix to k8s ClusterIP services.

### 7.3 Cloudflare Tunnel Config
```yaml
# cloudflared config.yaml (mounted as ConfigMap)
tunnel: <tunnel-id>
credentials-file: /etc/cloudflared/credentials.json

ingress:
  - hostname: sbtd.io
    path: /ws
    service: http://server:2567
  - hostname: sbtd.io
    path: /api
    service: http://server:2567
  - hostname: sbtd.io
    service: http://client:80
```

WebSocket upgrade is handled transparently by Cloudflare Tunnel — no special nginx config needed.

### 7.4 Environment Variables

| Variable | Container | Description |
|---|---|---|
| `POSTGRES_URL` | server | Full DSN, from Secret |
| `COLYSEUS_PORT` | server | Default 2567 |
| `NODE_ENV` | server | `production` |
| `VITE_SERVER_URL` | client (build arg) | WebSocket server URL |
| `POSTGRES_PASSWORD` | db | From Secret |

Secrets managed as Kubernetes `Secret` objects. Never committed to Git. CI injects via `kubectl apply` with values from environment.

### 7.5 Daily Backup
PostgreSQL backup via `pg_dump` in a CronJob pod, output to a persistent volume or object storage (S3-compatible). Schedule: `0 3 * * *` (3am daily).

---

## Colyseus Research Notes

**Version:** 0.17 (current as of March 2026)

**TypeScript:** Natively supported. `npm create colyseus-app@latest` scaffolds a TypeScript project by default. Room classes extend `Room<StateType>`. Schema decorators use `@type(...)` from `@colyseus/schema`.

**Room lifecycle methods:**
- `onCreate(options)` — room initialised
- `onJoin(client, options)` — player connected
- `onMessage(client, type, message)` — client sent a message
- `onLeave(client, consented)` — player disconnected (reconnect window available)
- `onDispose()` — room being destroyed

**State sync:** Schema-based with `@type` decorators. Only decorated fields are delta-encoded and pushed to clients. Collections: `MapSchema`, `ArraySchema`, `SetSchema`. Maps are recommended for tracking entities by ID.

**Phaser integration:** Official tutorial series (4 parts) covering basic movement, linear interpolation, client-predicted input, and fixed tickrate. The pattern is: Phaser scene connects to Colyseus room → subscribes to schema change callbacks → updates sprite positions in Phaser's `update()` loop.

**Reconnection:** Built-in token-based reconnection. `allowReconnection(client, seconds)` holds the slot open.
