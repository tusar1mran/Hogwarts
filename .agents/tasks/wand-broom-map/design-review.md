# Design Review — Wand-Aimed Casting, Broomstick Flight, World Map

Reviewer: design-review subagent (fresh context). Scope: `design.md` for the `wand-broom-map`
feature set in `eldoria-academy`. I read the real worktree source to verify the design's claims
rather than taking its word. I did **not** run the build or test suites.

**Verdict: APPROVED** (0 HIGH, 0 MEDIUM, 4 NIT).

This is a third-iteration design whose body claims every earlier finding is resolved and that
"every claim cites the file and symbol it came from." I independently re-derived the substantive
claims from source and they hold. The design is implementable as written; the gating/wiring,
save-migration, map-derivation, and no-per-frame-render constraints are all specified concretely
and match the real code. The remaining items are accuracy/scoping NITs that do not change what gets
built.

---

## Findings

### 1. [NIT] The world-space pitch clamp is effectively inert during normal ground aiming — justification overstates its role

**Where:** §5 step 3 ("Pitch clamp (pinned)"), §5 Edge cases ("Aiming straight up/down: pitch is
clamped so the wand stays in a plausible range"), AC-1.

**What:** The clamp operates on `runtime.aim.direction`. In ground state that direction is the camera
forward `_dir`, built in `CameraRig` as
`_dir.set(-sin(yaw)cos(pitch), sin(pitch), -cos(yaw)cos(pitch))`, and `cam.pitch` is **already** clamped
to `CAMERA_LIMITS.groundPitch` on the line above (`cam.pitch = clamp(cam.pitch, limits[0], limits[1])`,
verified in `CameraRig.tsx`). Therefore `asin(aimDir.y) === cam.pitch` is always within
`[-1.2, 0.55]` during ground aiming, so `clampWorldAimPitch` is a no-op on live gameplay input — it
only ever changes synthetic out-of-range vectors (which is exactly what the AC-1 unit test feeds it).
The feature is still correct; the clamp just never fires in practice because the camera prevents
out-of-range aim. The design presents it as a meaningful "stays in a plausible range" guard.

**Fix:** Keep the clamp (it is cheap and makes the helper independently correct/testable), but soften
the prose to "the clamp is defensive — the camera already constrains ground pitch to the same limits,
so it is a no-op for live aim and matters only if the direction is ever sourced from elsewhere." No
code change required.

### 2. [NIT] "no existing event uses a bare `id`" is factually wrong

**Where:** §6 ("Event field name"), §8 (events paragraph), §13.1 finding 5.

**What:** The design justifies naming the event field `broomId` by asserting the `events.ts`
convention is `itemId`/`questId`/`npcId`/`locationId` and that "no existing event uses a bare `id`."
Verified against `events.ts`: the `interact` event is `{ type: 'interact'; id: string }` — a bare
`id`. The chosen name `broomId` is still fine and consistent with the dominant `<noun>Id` pattern;
only the stated rationale is inaccurate.

**Fix:** Reword to "the dominant convention is `<noun>Id` (`itemId`/`questId`/`npcId`/`locationId`);
`broomId` follows it." Keep the field name `broomId`.

### 3. [NIT] `questMap` maps the `collect` kind to a single hard-coded codex position for all items

**Where:** §7.4 ("`collect` → `CODEX_POSITION`"), the quest-marker resolver.

**What:** The resolver maps every `collect` objective to `CODEX_POSITION` regardless of `o.itemId`.
This is correct **today** because `questData.ts` has exactly one `collect` objective (`find-codex`,
`itemId: 'astral-codex'`), verified. But the helper encodes "collect == codex," which silently
breaks if a second collectible quest is ever added. New quests are explicitly out of scope (§4), so
this is not a blocker.

**Fix:** Add a one-line comment at the `collect` case noting the assumption ("only one collect
objective exists — `astral-codex`; revisit if more are added"), or key off `o.itemId` with a small
item→position lookup that currently contains just the codex. Either is acceptable; prefer the
comment to stay in scope.

### 4. [NIT] Several "Files touched" entries omit the real path, and one is slightly off

**Where:** §7.5 and §12 ("Modified: ... `HUD.tsx` ...").

**What:** The compass lives at `src/ui/hud/HUD.tsx` (verified), not `src/ui/HUD.tsx`; the design
lists it as bare `HUD.tsx`. Likewise a few modified files are named without their directory. This
will not mislead an implementer (the symbols are unambiguous) but the file list is the one place the
design is meant to be a precise checklist.

**Fix:** Qualify the paths: `src/ui/hud/HUD.tsx`, `src/game/core/Systems.tsx`, `src/ui/menus/GameMenus.tsx`,
etc., matching the actual tree.

---

## Judgement against the six focus questions

1. **Does the current-state audit cite real files/symbols (so working systems aren't rebuilt)?**
   Yes. Every audited claim I checked resolves to real source: the flight machine's Grounded gate,
   `InputManager`/`SpellRuntime` cast path, the `Overlay` union, `DEFAULT_BINDINGS` (KeyM unused,
   `toggleBroom: KeyF`), `WorldItems` collectible pattern, `HudSync` 10 Hz patch, and the wand
   hierarchy. The design correctly frames F1/F2 as gap-filling, not greenfield.

2. **Are save-system/versioning migration implications spelled out?** Yes, and correctly. Current
   `SAVE_VERSION` is **2** (verified). §8 bumps 2→3, keeps **v1/v2/v3** loadable with explicit
   `parseSave` branches, defaults `hasBroom:false`/`broomsCollected:[]` via `sanitizeProgression`
   (which already spreads `createProgression()` first), drops unknown broom ids like `artifacts`,
   and rejects `version > 3` as `unsupported`. AC-8/AC-9 assert the v2-string regression and
   `hasValidSave()` staying true. This resolves the prior HIGH convincingly.

3. **Does the map derive positions from `layout.ts` rather than duplicating coordinates?** Yes.
   All landmark shapes pass through `worldToMap` from `layout.ts` symbols (`LAKE`, `FOREST`,
   `PLATEAU`, `COURTYARD`, `GRAND_HALL`, `LIBRARY`, `TRAINING_YARD`, `BRIDGE`, `FLIGHT_PLATFORM`,
   `TOWERS`, `WORLD_HALF_SIZE` — all verified present). Broom positions and the new `CODEX_POSITION`
   are defined once in `layout.ts` and consumed by both world entity and map. AC-10 forbids numeric
   landmark literals in the component.

4. **Is the broom-pickup → flight-gate wiring unambiguous?** Yes. `collectBroom(id)` sets
   `hasBroom:true` + appends to `broomsCollected` + notifies + emits `broom:collected` + saves
   (idempotent, modelled on the verified `addArtifact`). `PlayerController` threads
   `hasBroom: useProgression.getState().progression.hasBroom` into the existing `stepFlightMachine`
   input object (verified it is built there), the `Grounded` case returns a `blocked` message when
   false, and the existing `if (machine.blocked) useHud.getState().fizzle(...)` (verified at
   `PlayerController.tsx:177`) surfaces it. The gate is checked before the grounded/overWater checks;
   adding `hasBroom:true` to `flight.test.ts`'s `idle` keeps all existing cases green (verified by
   reading the test).

5. **Is the throttled-snapshot (no per-frame React re-render) constraint respected?** Yes. The map
   reads `playerX/playerZ/playerFacing` from `hudStore`, patched by `HudSync` on its existing 10 Hz
   tick (verified `HudSync` patches `heading: runtime.camera.yaw` at `timer = 0.1`). The new fields
   are added to the `HudStore` interface + initial state so `patch` (typed `Partial<Omit<...>>`)
   type-checks. The player marker uses `runtime.player.facing` (verified it exists), not camera yaw.

6. **Is the verification plan concrete?** Yes. `typecheck/test/lint/build` are named (AC-12), unit
   tests are enumerated with concrete assertions (clamp returns `sin(0.55)`/`sin(-1.2)`; gate
   transitions; save v1/v2/v3/v4; projection round-trip; quest-marker kinds), and six code-path
   traces cover the non-unit-testable behaviours (3D wand orient, SVG render, M-key toggle, pickup
   interaction). The design sensibly instructs recording the green baseline via `npm test` before
   editing instead of asserting a stale count.

---

## Verified Assumptions

Checked directly against worktree source:

- `CAMERA_LIMITS.groundPitch = [-1.2, 0.55] as const` is exported from `camera/CameraRig.tsx`.
  Importing it (not re-hardcoding) is possible.
- Wand hierarchy in `HumanoidRig.tsx`: `<group rotation-x={0.25} position={[0,-0.02,-0.02]}>`
  containing the wand mesh and the `wandTip` empty at `position={[0,-0.36,0]}`. The group currently
  has no ref; exposing it as `wandRoot` is a small additive change. (Tip-axis = group local −Y: correct.)
- `SpellRuntime` copies `runtime.wandTip` into `ctx.origin` (`SpellRuntime.tsx:397`); `PlayerAvatar`
  writes `runtime.wandTip` from the rig's `wandTip` world position after the pose blend, with a
  fallback when the node is absent. So orienting `wandRoot` before that read keeps the origin on the
  tip with no `SpellRuntime` change.
- `BroomModel` is defined in `PlayerAvatar.tsx` (line 41) and used by `Broom` (line 113). Extracting
  it to a shared module is viable and avoids an import cycle.
- `flightMachine.ts` `Grounded` case allows `Summoning` on `toggle && grounded && !overWater` with no
  broom concept; `FlightMachineInput` shape matches the design's extension point. `flight.test.ts`
  `idle` constant exists and adding `hasBroom:true` keeps existing cases passing.
- `questData.ts`: six `ObjectiveDef` kinds (`talk|spellHit|collect|flightState|rings|reach`);
  flight-initiation's `summon-broom` is `kind:'flightState', state:'Summoning'`; givers are
  `mentor`/`librarian`/`flight-instructor`.
- `NPCS[0].id === 'mentor'`, which equals `first-spark`'s giver — so the HUD's hard-coded
  `first-spark → NPCS[0]` available case is consistent with a generic giver lookup.
- `HUD.tsx` `objectivePosition` handles `talk/spellHit/collect/rings/reach` with `default → null`
  (so `flightState` yields null today), `collect` returns the placeholder `[-43,-40]`, `spellHit`
  uses `TRAINING_YARD` center. The design's "byte-identical except corrected `collect`" claim is
  accurate.
- `WorldItems.Codex` sits at `new Vector3(-43.3, LIBRARY_BALCONY_Y + 1.05, -40.2)` — matches the
  proposed `CODEX_POSITION` exactly; the `[-43,-40]` compass value really is ~0.36 m off.
- `collected` derivation pattern (`useProgression(s => ...includes(id))`) matches `Codex`/`ShrineEmber`;
  `sessionId` is only used by transient-physics items (`PracticeTarget`/`Crate`/`Sentinel`).
- `DEFAULT_BINDINGS` has no `KeyM` (verified); `toggleBroom: ['KeyF']`; `keyLabel` is exported;
  `ACTIONS = Object.keys(DEFAULT_BINDINGS)` so a new `map` action is picked up automatically.
- `hudStore` has no `playerX/playerZ/playerFacing`; `patch` is `Partial<Omit<HudStore, ...>>`;
  `notify` supports `kind:'reward'`; `fizzle(text)` exists.
- `HudSync` patches at 10 Hz (`timer = 0.1`) with `heading: runtime.camera.yaw`.
- `App.useMenuKeys` uses a local `const map = { spellbook, journal, inventory }` and an explicit
  `||` open-guard allow-list — exactly as the design describes; adding `map: b.map` + `'map'` to the
  guard (and renaming the table to `toggles`) is accurate and complete.
- `Overlay` union is `null|'pause'|'spellbook'|'journal'|'inventory'|'settings'|'dialogue'`;
  `GameOverlays` renders `overlay === X && <Panel/>` inside `overlay-backdrop`; panels use
  `className="panel modal" role="dialog" aria-label` + `CloseButton`.
- `progressionStore.addArtifact` is the exact idempotent/notify/dispatch/save pattern `collectBroom`
  should mirror.
- `PlayerController` builds the `stepFlightMachine` input object inline and already calls
  `useHud.getState().fizzle(machine.blocked)`.
- `questEngine` exports `questStatus`, `currentObjective`, `activeQuests`, `objectiveTarget`,
  `createProgression`, and the `Progression` interface — all needed by the new helper.
- `SAVE_VERSION` is currently `2`; `parseSave` currently accepts only v1 and v2.

## Unverified / Wrong Assumptions

- **WRONG (minor):** "no existing event uses a bare `id`" — the `interact` event uses `{ id: string }`
  (Finding 2). Does not affect the chosen `broomId` name.
- **MISLEADING (minor):** the world-space pitch clamp is described as a live safety range, but the
  camera already clamps ground pitch to the same limits, making the clamp a no-op for real aim input
  (Finding 1). Behaviourally harmless.
- **Hedged, acceptable:** `RealisticAvatar` exposing no settable wand group — the design applies the
  correction only when a wand group is exposed and otherwise keeps the current approximation. I
  confirmed `CharacterAvatar`/`characterModel` expose `wandTip` but did not exhaustively confirm the
  absence of a settable wand group; the design's conditional + documented fallback make this safe,
  and the procedural path is the shipped default (`characterLibraryAvailable()` is false).
- **Not independently re-counted:** the exact passing-test total. The design deliberately does not
  assert it and instructs recording the baseline via `npm test` before editing — appropriate.
