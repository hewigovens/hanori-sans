# Kana context experiment — 2026-10-26

Kana can be used as a language hint by an app that sees the message. The
font-only approach does not work in the tested Qt layout path used by LINE.

The user reported that both Chinese and Japanese stay plain with the Selective
face in English-mode LINE. That face requires Japanese language hints. A second
experiment tested whether neighboring kana could trigger a rule without hints.

## Method and evidence

A temporary diagnostic font changed the visible glyph for 日 into 一 when it
could see a neighboring は, ハ, or ｱ. 日月 → 一月 was the same-script positive
control; 日 alone was the negative control. The diagnostic font was registered
only within test processes and was never installed in the user's font folder.

| Sample | Native Core Text | Qt 6.6.3 |
| --- | --- | --- |
| 日 | No substitution | No substitution |
| 日月 | Substitution | Substitution |
| 日は / は日 | Substitution | No substitution |
| 日ハ / ハ日 | Substitution | No substitution |
| 日ｱ / ｱ日 | Substitution | No substitution |
| 今日は日本語の勉強をします。 | Substitution | No substitution |

Core Text was checked with unspecified, English, Chinese, and Japanese language
attributes. Its kana-context rule worked in all four cases. This demonstrates
why a native Core Text result alone is insufficient evidence for LINE.

The Qt test used `QTextLayout` in an isolated offscreen process. It was first
run with PySide6-Essentials 6.6.3.1, then repeated with LINE's own QtCore and
QtGui frameworks through `DYLD_FRAMEWORK_PATH`. Loaded image paths were recorded
to verify that the second run used `/Applications/LINE.app/Contents/Frameworks/`.
Both Qt runs produced the same failure to match across Han/kana boundaries.
No chats, account data, or live LINE process were accessed. This is a test of
the bundled renderer's layout behavior, rather than a live-chat screenshot.

Qt's script itemizer splits the text when its Unicode script changes, and the
HarfBuzz buffer receives only the current item. A contextual glyph rule in the
Han item therefore cannot inspect a neighboring hiragana or katakana item.

Source: https://github.com/qt/qtbase/blob/v6.6.3/src/gui/text/qtextengine.cpp
(Itemizer::generateScriptItems and QTextEngine::shapeTextWithHarfbuzzNG).

The practical policy for an app-controlled reader is: kana present means likely
Japanese; no kana means ambiguous and stays plain. Japanese text written only
in kanji will be missed, and Chinese text quoting kana can be a false positive.
Applying that policy to a whole paragraph requires app-side text inspection.

## Saved results

- `coretext-results.json`: native Core Text glyph output.
- `pyside-qt-results.json`: matching-version Qt test.
- `line-qt-results.json`: repeat using LINE's actual Qt libraries.

The installed Hanori fonts were not changed by this experiment.

## Reproduce

The optional Qt test dependency is separate from the font build dependencies.
It requires Python 3.8–3.12. Run `npm run build` first to prepare the internal
plain base, then run these commands from the font project directory:

```sh
.venv/bin/python diagnostics/kana-context/build_probe.py
swift -module-cache-path vendor/swift-module-cache diagnostics/kana-context/probe.swift diagnostics/kana-context
.venv/bin/python -m pip install --target vendor/qt-probe PySide6-Essentials==6.6.3.1
DYLD_FRAMEWORK_PATH=/Applications/LINE.app/Contents/Frameworks HANORI_QT_REPORT=line-qt-results.json .venv/bin/python diagnostics/kana-context/qt_probe.py
```

The Qt runner records loaded Qt framework paths so a successful run can be
checked for accidental use of the wheel's libraries instead of LINE's copy.
Omit the environment variables to run against PySide's bundled Qt instead.
