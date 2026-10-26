# Hanori Sans 0.1.2

A personal font prototype for English, Simplified Chinese, and Japanese reading.

Built fonts and validation reports are in [`dist/`](dist/). The repository also
includes pinned source fonts, build scripts, licenses, and rendering diagnostics.

![Hanori Sans and Hanori Sans Furigana specimen](dist/specimen.png)

Two separate families appear in font pickers:

- **Hanori Sans** (default): Inter Regular Latin with Source Han Sans CN Regular
  CJK. Automatic hiragana readings activate only for Japanese-tagged text; other
  or missing language hints leave it plain. This includes the behavior previously
  provided by the separate Selective family.
- **Hanori Sans Furigana**: the same typography with automatic hiragana readings
  enabled regardless of the app's language hint.

Both are static Regular-weight OpenType fonts. The Simplified Chinese source's
Han characters retain their original outlines and one-em advances. Inter Latin
outlines, advances, and supported pair kerning replace the base font's Latin.
The base's locale substitutions, Latin ligatures, and proportional CJK width
features are disabled, so they cannot undo these choices in an English app.
Shared Han glyphs use the Chinese source's forms, including in Japanese text;
this does not convert characters between simplified and traditional writing.

## Try in LINE on macOS

1. Open either `.otf` in `dist/` and install it with Font Book.
2. Fully quit and reopen LINE, keeping its interface language English.
3. Select **Hanori Sans** for normal mixed-language reading, or **Hanori Sans
   Furigana** for always-on Japanese readings, in LINE's font picker.
4. Compare Chinese spacing and check whether LINE clips the furigana.

Sample Japanese: 今日は日本語の勉強をします。東京駅で友達に会います。

Sample Chinese: 今天的中文字体清晰，汉字宽度保持一致。骨直令遍返。

## Furigana behavior

FuriFont's dictionary and OpenType rules supply readings without changing the
underlying text. The configured ruby size is 0.45 em, with a 0.04 em gap. The
build fills the available glyph budget; see `dist/furigana-report.json` for the
actual coverage. A stricter 0.9 confidence threshold is used for isolated kanji.

The font cannot reliably distinguish Chinese and Japanese sentences. Chinese
words that match the Japanese dictionary can receive Japanese readings in the
furigana family. Select the default family when this is undesirable. Readings can
be wrong, especially with ambiguous words, names, and verbs. Horizontal reading
is the target; vertical furigana is not supported. Layouts must leave enough
space above the text; around 1.6–1.7 em line height is a useful starting point.

The default family follows app-provided language hints; it does not detect
languages. Native Core Text checks confirm that `ja` hints enable readings and
`en`, `zh-Hans`, or missing hints leave both Chinese and Japanese samples plain.
If an app incorrectly labels Chinese text as Japanese, it can still receive
readings.

In the LINE trial, both Chinese and Japanese stayed plain with this behavior.
The tested English-mode LINE path did not supply usable Japanese hints.
Follow-up testing with LINE's bundled Qt 6.6.3 renderer also found that kana
context rules cannot see across Han/kana shaping boundaries. See
`diagnostics/kana-context/README.md` for the controlled test and saved results.
Use **Hanori Sans Furigana** when you want readings in LINE; shared Chinese words
can receive Japanese readings in that family.

## Build pipeline

The unannotated composition is an internal input at
`build/HanoriBase-Regular.otf`. FuriFont compiles that input into the always-on
Furigana family, then `scripts/build_default.py` restricts automatic reading
activation to Japanese hints and names the result **Hanori Sans**. Only the two
public families are written to `dist/` and included in the download bundle.

## Verification

`npm run verify` checks saved font tables, character coverage, Han advances,
Chinese source outlines, Latin metrics, CFF outline widths, and embedding flags.
It then uses native macOS Core Text to render `dist/specimen.png` and records
glyphs, fonts, and advances for English, Chinese, Japanese, and mixed samples.
The always-on Furigana face must keep the same glyphs and advances across `en`,
`zh-Hans`, and `ja` text-language attributes, with no fallback fonts. The default
must keep the same glyphs across English and Chinese contexts. Its Japanese
behavior is checked separately by `scripts/probe_default.swift`: without a
Japanese hint it must match the plain internal base; with a Japanese hint it
must match the always-on Furigana face. Results are recorded in
`dist/default-language-report.json`.

The original Furigana face displayed readings in LINE in the user's trial,
including on Chinese words. The selective behavior now used by the default
stayed plain for both languages.
The native automated checks and isolated Qt checks are distinct evidence; iOS
app integration remains untested. There is no bundled emoji font; emoji and
unsupported rare characters depend on the app's normal fallback behavior.

## Rebuild

Requirements: Node.js 22.18 or later; Python 3.10 or later; macOS Swift tooling
for the native specimen and Core Text checks.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm ci --ignore-scripts
.venv/bin/python scripts/fetch_sources.py
npm run build
npm run verify
```

The font inputs are pinned to upstream Git revisions and SHA-256 hashes in
`sources.json`. JS dependencies are pinned by `package-lock.json`; Python
dependencies are pinned in `requirements.txt`. A fixed build time is used.

## Credits and licensing

- Inter by Rasmus Andersson and the Inter Project Authors: SIL OFL 1.1.
  https://github.com/rsms/inter
- Source Han Sans by Adobe: SIL OFL 1.1.
  https://github.com/adobe-fonts/source-han-sans
- FuriFont by Anthony Fu: MIT code; derived fonts under SIL OFL 1.1.
  https://github.com/antfu/furifont
- Dictionary-derived readings and rules: CC BY-SA 4.0, with upstream sources
  and additional attribution described in `licenses/Dictionary-CC-BY-SA.md`.

Preserve the included licenses and attributions when sharing these files.
