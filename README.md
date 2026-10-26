# Hanori 0.1.3

Font prototypes for English, Simplified Chinese, and Japanese reading, with
**Sans** and **Serif** designs and two furigana modes for each.

| Family | Composition | Automatic readings |
| --- | --- | --- |
| Hanori Sans | Inter + Source Han Sans CN | Japanese language hints only |
| Hanori Sans Furigana | Same Sans design | Always enabled |
| Hanori Serif | Source Serif 4 + Source Han Serif CN | Japanese language hints only |
| Hanori Serif Furigana | Same Serif design | Always enabled |

Built fonts and validation reports are in [`dist/`](dist/). The repository also
includes pinned source fonts, build scripts, licenses, and an iOS/macOS preview app.
All four fonts are static Regular-weight OpenType fonts.

![Hanori Sans specimen](dist/specimen.png)

![Hanori Serif specimen](dist/serif-specimen.png)

Chinese Han characters retain the chosen Chinese source's outlines and one-em
advances. Latin outlines, advances, and supported kerning rules come from Inter
or Source Serif 4. Source Han's locale substitutions, Latin ligatures, and
proportional CJK width features are disabled so they cannot undo these choices.
Shared Han glyphs use Chinese forms even in Japanese text; this does not convert
characters between simplified and traditional writing.

## Try on macOS

1. Open the desired `.otf` files in `dist/` and install them with Font Book.
2. Fully quit and reopen the app where you want to use them.
3. Select **Hanori Sans** or **Hanori Serif** for mixed-language reading, or the
   corresponding **Furigana** family for always-on Japanese readings.
4. Check the app's line spacing and whether it clips readings above the text.

In Chrome or Edge, Standard can use either design, Serif can use **Hanori Serif**,
and Sans-serif can use **Hanori Sans**. Keep your existing fixed-width font.
These are browser defaults; websites can request other fonts.

Sample Japanese: 今日は日本語の勉強をします。東京駅で友達に会います。

Sample Chinese: 今天的中文字体清晰，汉字宽度保持一致。周末一起去公园散步，顺路喝杯咖啡。

## Preview on iOS and macOS

Open [`app/HanoriPreview.xcodeproj`](app/HanoriPreview.xcodeproj) in Xcode and run
**HanoriPreview** on My Mac, an iPhone, or an iPad simulator. The app bundles all
four fonts and loads the bundled bytes directly; no font installation is needed.
Minimum versions are iOS 17 and macOS 14.

- Switch between Sans and Serif; each design shows its two reading modes.
- Edit text or choose English, Chinese, Japanese, and ambiguous Han samples.
- Choose explicit language hints or a per-paragraph kana hint.
- Adjust font size and line height, show baselines, and export the selected pair as PNG.

The kana mode runs in the app. Each paragraph containing hiragana or katakana
gets a Japanese language hint; Han-only paragraphs stay untagged. It does not
add language detection to the font or to other apps.

On macOS, `./script/build_and_run.sh` builds and opens the app. See
[`app/README.md`](app/README.md) for build and test commands, including physical iOS devices.

## Furigana behavior

FuriFont's dictionary and OpenType rules supply readings without changing the
underlying text. Ruby size is 0.45 em, with a 0.04 em gap. Each design fills its
available glyph budget; see `dist/furigana-report.json` and
`dist/serif-furigana-report.json` for coverage. Isolated kanji use a stricter 0.9
confidence threshold.

The default faces follow app-provided language hints. Japanese hints activate
readings; English, Simplified Chinese, or missing hints leave them plain.
The Furigana faces enable readings regardless of the hint. Chinese words that
match the Japanese dictionary can therefore receive Japanese readings.
Readings may be wrong, especially for ambiguous words, names, and verbs.

Horizontal reading is the target; vertical furigana is unsupported. Leave room
above the text; around 1.6–1.7 em line height is a useful starting point.

In the Sans LINE trial, both languages stayed plain with the selective behavior:
English-mode LINE did not supply useful Japanese hints. Its tested Qt renderer
also split Han and kana before contextual font rules could inspect both scripts.
The Serif faces use the same hint policy; the preview app tests Core Text rather
than LINE's renderer.

There is no bundled emoji font. Emoji and unsupported rare characters depend on
the app's normal fallback behavior.

## Build and verification

[`families.json`](families.json) defines both compositions. Internal plain bases
are written to `build/HanoriSansBase-Regular.otf` and
`build/HanoriSerifBase-Regular.otf`. FuriFont compiles each always-on face, then
`scripts/build_default.py` restricts automatic readings to Japanese hints for
its default sibling. Only the four public faces are written to `dist/`.

`npm run verify` checks saved tables, coverage, sorted layout coverages, full-width
Han advances, Chinese source outlines, Latin source metrics, CFF/hmtx consistency,
and embedding flags. Native Core Text checks confirm language-hint behavior for
both designs, compare Latin kerning with the source fonts, and render both
specimens. Reports are saved beside the fonts.

The app tests bundled-font loading, distinct Sans/Serif Chinese outlines,
language-dependent shaping, kana hints, wrapping, Unicode boundaries, and PNG
exports. A UI test switches to Serif and captures both reading modes. Tests of
our renderer do not establish another app's shaping or fallback behavior.

## Rebuild

Requirements: Node.js 22.18+, Python 3.10+, and macOS Swift tooling for native checks.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm ci --ignore-scripts
.venv/bin/python scripts/fetch_sources.py
npm run build
npm run verify
```

Font inputs are pinned to upstream revisions and SHA-256 hashes in `sources.json`.
JS and Python dependencies are pinned. A fixed build time makes outputs reproducible.

## Credits and licensing

- [Inter](https://github.com/rsms/inter), by Rasmus Andersson and the Inter Project Authors: SIL OFL 1.1.
- [Source Han Sans](https://github.com/adobe-fonts/source-han-sans), by Adobe: SIL OFL 1.1.
- [Source Serif 4](https://github.com/adobe-fonts/source-serif), by Adobe: SIL OFL 1.1.
- [Source Han Serif](https://github.com/adobe-fonts/source-han-serif), by Adobe: SIL OFL 1.1.
- [FuriFont](https://github.com/antfu/furifont), by Anthony Fu: MIT code; derived fonts under SIL OFL 1.1.
- Dictionary-derived readings and rules: CC BY-SA 4.0, with upstream sources and
  additional attribution in `licenses/Dictionary-CC-BY-SA.md`.

Preserve the included licenses and attributions when sharing these files.
