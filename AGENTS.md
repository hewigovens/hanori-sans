# Hanori

Hanori builds Sans and Serif fonts for English, Simplified Chinese, and Japanese.
Each has a default face whose readings require Japanese language hints and an
always-on Furigana sibling. The preview app tests native Apple rendering.

## Layout and ownership

- `tools/`: TypeScript font composition, source fetching, verification, and the
  macOS app runner. Use Node's built-in TypeScript support; no Python, shell
  runners, or standalone Swift scripts.
- `app/`: native SwiftUI app, Core Text renderer, and XCTest/UI tests. Keep Swift
  for Apple platform behavior. Font manipulation belongs in the TypeScript tools.
- `families.json`: Latin/CJK inputs and pinned variation axes for both designs.
- `sources.json`: immutable upstream URLs and SHA-256 hashes. `sources/` contains
  those inputs; preserve the fonts and upstream licenses.
- `furifont.config.json`: shared reading options. `package.json` owns the font
  version; the builder supplies family names and base paths.
- `build/`: ignored intermediates and local test results. `dist/`: checked-in
  public fonts, selector references, specimens, and build/validation reports.

Keep one tooling directory. Do not introduce Codex environment configuration;
the commands below work from the repository root in any terminal.

## Commands

Requires Node 22.18+ and npm. Apple commands additionally require Xcode.

```sh
npm ci --ignore-scripts
npm run fetch          # Verify or restore pinned source inputs; build does this too.
npm run build          # Compose both bases, then all four public faces.
npm test               # Type checking, tooling regression tests, and font verification.
npm run verify:native  # Core Text composition/renderer tests on macOS.
npm run test:app       # macOS unit and UI tests.
npm run app            # Build and open the macOS app.
npm run app -- --verify
```

`npm run app` also accepts `--debug`, `--logs`, and `--telemetry`. It stops only
the app executable in this checkout's macOS bundle; an iOS simulator can run an
executable with the same name. XcodeGen, when available, regenerates the checked-in
project from `app/project.yml`. Regenerate it after changing sources or resources.
See `app/README.md` for iOS Simulator and physical-device commands. Keep signing
teams and device identifiers local.

## Font constraints and verification

- Preserve Chinese outlines and one-em Han advances. Locale substitutions and
  proportional CJK features must not replace these forms or Latin donor glyphs.
- Preserve Latin metrics and kerning, including `ff`, `ffi`, and contextual
  positioning. `tools/layout.ts` sorts emitted PairSets by destination glyph ID;
  omitting that step breaks binary-search shaping in native engines.
- Remove TrueType overlaps before conversion to CFF. Instantiate every donor
  variation axis explicitly. Keep build timestamps deterministic.
- Keep the default and Furigana glyph/selector identities aligned. Change only
  the default's language rules; do not re-encode every composed outline to do so.
- Rebuild all four fonts after font/config/tooling changes, run `npm test` and
  native checks, and include the updated `dist/` outputs. Compare native rendering
  for changes to outlines or layout. App tests bundle original source fonts only
  in the test target; production apps need only the four public fonts.
- Validate appearance changes in the running app. Font verification, Core Text
  tests, UI behavior, and another application's renderer are separate evidence.

Keep the included OFL, MIT, and dictionary attribution files when distributing
the fonts. Pure Han text is ambiguous: kana hints are an app heuristic, not
language detection built into the font.
