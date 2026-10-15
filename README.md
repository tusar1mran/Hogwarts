# Eldoria: Academy of Arcane Arts

A third-person fantasy academy exploration game that runs in a desktop browser. Original setting, characters, spells
and music. Built with React, TypeScript, Vite, three.js, React Three Fiber, Drei, Rapier physics, Zustand and Web Audio.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (use --port to change)
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
npm test           # Vitest unit and UI tests
npm run typecheck  # TypeScript only
npm run lint       # oxlint
```

Requires a desktop browser with WebGL 2 (current Chrome, Edge or Firefox) and hardware acceleration enabled.

## Controls

| Action | Default |
| --- | --- |
| Move / steer | W A S D |
| Sprint / flight boost | Shift |
| Jump | Space |
| Look | Mouse (click the view to capture the pointer) |
| Aim / cast | Right mouse / left mouse |
| Select spell | 1-6, or Z / X to cycle |
| Interact / talk | E |
| Summon broom / land | F |
| Climb / descend (flying) | Space / Ctrl or C |
| Spellbook / journal / artefacts | B / J / I |
| Pause, release pointer | Esc |
| Performance overlay | F3 |

All keys except Esc can be rebound in Settings > Controls. Browsers reserve Ctrl+W, so **C** is also bound to Descend.

## What is in the game

- **World**: a mountain-top academy with a gated entrance courtyard, battlement walkway, Grand Hall (columns, arcades,
  chandeliers, floating candles, window light), the Starlit Library (upper gallery, hidden nook), Practice Grounds,
  Skyward Platform, a bridge over a ravine, a lake with cliffs, the bioluminescent Glimmerwood forest, a ruined chapel
  and four secrets. Interactive doors, lighting that dims indoors, fog, layered mist and particles.
- **Player**: kinematic character controller (slopes, steps, coyote time, jump buffering), over-the-shoulder camera
  with collision, aim zoom and speed-based FOV. Procedural jointed character with blended animations for every state.
- **Spells** (registry-driven, pooled effects): Arc Bolt, Force Wave, Aegis Shield, Luminous Orb, Mystic Pull,
  Blink Step. Mana, cooldowns, targets that break and respawn, physics crates, and a sentinel that fights back.
- **Flight**: explicit state machine (Grounded, Summoning, Mounting, TakingOff, Flying, Landing, Dismounting), arcade
  flight model with sub-stepping, banking and collision, a ring course and landing pads.
- **NPCs and quests**: four NPCs with authored dialogue; First Spark, The Lost Archive and Flight Initiation; XP,
  unlocks, artefacts, checkpoints and a versioned local save.
- **Audio**: generative music per area with hysteresis crossfades, synthesised effects, spatial sound, room reverb.
- **UI**: main menu over the live castle, HUD with compass and objective tracker, pause menu, spellbook, journal,
  artefacts, graphics/audio/controls settings, dialogue panel, notifications and a performance overlay.

## Project layout

```
src/
  App.tsx                    phases: boot checks -> loading -> menu -> playing
  game/
    GameCanvas.tsx           Canvas, physics, post-processing, adaptive resolution
    session.ts               new game / continue / resume / return to menu
    core/                    runtime state (non-React), events, systems, math, noise
    input/                   InputManager (keyboard, mouse, pointer lock), bindings
    state/                   Zustand stores: game, settings, HUD, progression, dialogue
    world/                   layout.ts (single source of truth), terrain, architecture, areas, environment
    player/                  controller, procedural rig, animation state machine, avatar
    camera/                  third-person camera and menu camera
    spells/                  registry, pure spell economy, runtime, pooled effects
    flight/                  flight state machine, flight model, ring course
    npc/                     NPCs and dialogue data
    quests/                  quest data, quest engine, save system
    audio/                   engine, synth cues, themes, music director, scene bridge
    assets/                  optional asset manifest and probing
  ui/                        menus, HUD, dialogue, overlays
```

High-frequency state (transforms, velocities, aim) lives in `game/core/runtime.ts` and is updated in the frame loop;
React only re-renders from throttled HUD snapshots (10 Hz) and discrete events.

## Assets and licensing

See [ASSETS.md](ASSETS.md). No third-party art or audio is bundled; optional GLB and OGG replacements can be dropped
into `public/assets/`.
