# Upstream patches for Sienci-Labs/gsender

Two self-contained patches against tag **`v1.7.0-Edge-1`**. Both apply cleanly
to a pristine checkout of that tag (verified with `git apply --check`) and are
independent — apply either or both.

```bash
git checkout v1.7.0-Edge-1        # or your Edge base
git apply patches/0001-fix-packaged-app-ui-404.patch
git apply patches/0002-add-fluidnc-controller-support.patch
```

(Use `patch -p1 < …` if you prefer; these are standard `git diff` output.)

## 0001 — Fix packaged-app UI 404 (bug fix, standalone)

`src/server/vite-server.js` resolves the production UI directory relative to
`path.resolve(__dirname, "..")`. In the packaged app the server code is bundled
into `main.js` at the asar root, so that resolves to `resources/app` — outside
the asar, where nothing exists — and **every UI route 404s** in the packaged
build. Adds `path.resolve(__dirname, "app")` as the first candidate, which is
correct in the packaged layout and harmless in the dev/dist layout.

Affects all packaged builds; no relation to FluidNC. Recommended regardless of
whether 0002 is taken.

## 0002 — Add FluidNC controller support

FluidNC (bdring/FluidNC) is Grbl-1.1 wire-compatible, so support is a thin layer
over the existing Grbl controller:

- `src/server/controllers/FluidNC/` — `FluidNCController extends GrblController`
  (`type = FLUIDNC`; state events still stream as Grbl so the whole UI drives it
  as Grbl-compatible). Surfaces the real firmware version parsed from the FluidNC
  startup banner, and extends the error/alarm tables with FluidNC's codes
  (Error.h 39–181, Alarm.h 10–18), transcribed from firmware source.
- `Connection.js` — detection routes `FluidNC` banners to the new controller
  (checked before the generic `grbl` match, since FluidNC banners contain
  "Grbl"). `GrblController` error/alarm lookups moved to instance fields so the
  subclass can extend them — behavior for Grbl/grblHAL is unchanged.
- App: `FluidNC` added to firmware constants, the firmware-fallback setting, and
  the connection firmware selector. A dedicated `controller.detectedFirmware`
  redux field preserves the detected firmware for the connection badge, because
  `controller.type` is intentionally overwritten to the Grbl-family tag by
  streaming state events (so the visualizer/jogging/rotary keep working).
- Two jest suites cover detection-ordering and the error/alarm tables.

### Not included (fork-only)

Beta packaging/identity, `commander.allowUnknownOption()`, and the standalone
FluidNC Configurator plugin live in the fork only — they are not part of this
upstream contribution.
