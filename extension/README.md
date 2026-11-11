# Hanori browser extension

Local Japanese reading help for Chromium and Safari, with two mutually exclusive modes:

- **Font** uses Hanori Sans/Serif Furigana for lightweight readings: installed fonts in Chromium, bundled fonts in Safari.
- **Accurate** analyzes sentence context with bundled Kuromoji/IPADIC and inserts HTML ruby. It uses a verified plain Japanese font throughout eligible text, including words left unannotated and existing author ruby. It does not require Hanori to be installed.

“Accurate” is the mode name, not an accuracy guarantee. Names, homographs, and numbers can still be wrong. Recognized ambiguous words, unknown tokens, proper names without reviewed rules, and split numeral/counter forms are left plain.

## Try it

From the repository root:

```sh
npm ci --ignore-scripts
npm run build:extension
```

The build derives the toolbar icons from the Mac app icon with macOS `sips`, so it runs on macOS only.

Open `chrome://extensions` (or `edge://extensions`), turn on Developer mode, choose **Load unpacked**, and select this repository's `build/extension` folder. After rebuilding, reload the extension and reload pages where it was running. Open a webpage, click Hanori, select **Enable readings** and a mode, then **Apply**. Uncheck Enable readings and apply to undo.

In Chromium, Font mode needs either `HanoriSansFurigana-Regular.otf` or `HanoriSerifFurigana-Regular.otf` from `dist/`, installed using your OS font manager. Reopen the browser after installing fonts. Accurate mode tries installed Hiragino, Yu, Meiryo/MS Mincho, or Noto CJK JP faces. If no supported plain face loads, it reports the error without silently falling back to Hanori.

By default, only text with an inherited `lang="ja"` or `ja-*` tag receives readings. **Include text without a language tag** also includes untagged text and `lang=""` regions. Explicitly non-Japanese language tags always win. This option can annotate untagged Chinese text; it does not detect language. Code, editable fields, SVG, and MathML are skipped. Existing ruby keeps its readings.

**Always enable on this site** requests optional access to the current site's scheme and host and stores the preference locally. It applies on subsequent page loads. Chrome host grants do not isolate ports; saved preferences still use the exact origin. Disabling readings or unchecking Always enable and applying removes the saved preference. Existing tabs change only when you apply there. Previously granted access can be revoked in browser extension settings.

**Print…** waits for pending analysis and fonts before opening the browser print dialog. Actual PDF output and the textbook's two-page layout still need separate verification.

## Safari on macOS and iOS

The existing Hanori Preview app embeds the `HanoriSafariExtension` target in `app/HanoriPreview.xcodeproj` for both macOS and iOS; there is no separate Safari containing app. Native extension sources live in `app/Safari/Extension/`. All reading logic, corrections, and dictionary assets are shared with Chromium. Safari uses its `browser` API namespace and a bundled classic background worker; Chromium keeps its module worker. The Safari build does not change the Chromium manifest.

Requires Xcode 27.2+ on macOS:

```sh
npm run build:safari                 # macOS build and bundled-resource verification
npm run build:safari -- --open       # build and open the containing app
npm run build:safari -- --ios        # iOS Simulator build and resource verification
npm run build:safari -- --project-only # prepare web resources for opening in Xcode
npm run test:safari                 # WebKit reader smoke test
```

The macOS app is at `build/apple/Build/Products/Debug/HanoriPreview.app`. Open it, choose **Safari Extension** in the toolbar, then **Open Safari Extension Settings**. Enable **Hanori Reading** and allow access to a test page. These builds disable signing for local development; Safari may require **Allow Unsigned Extensions** in its developer settings. For signed development or a physical iPhone/iPad, open `app/HanoriPreview.xcodeproj`, select your own team for the Preview app and Safari extension targets, and run from Xcode. Do not commit local signing changes. Edit the checked-in `app/HanoriPreview.xcodeproj/project.xcproj` directly or through Xcode. The `.xcodeproj` bundle and shared schemes remain; the JSON configuration replaces `project.pbxproj`. No project generation or XcodeGen installation is needed. Build scripts prepare the web resources before building the native targets.

On iOS, enable Hanori in Settings → Apps → Safari → Extensions (Settings → Safari on iOS 17). Safari bundles both Furigana fonts because its privacy protections [hide user-installed fonts from webpages](https://webkit.org/tracking-prevention/). Font mode loads extension-local font resources; no OS font installation is required. The macOS Preview app separately offers **Install Fonts…** through Font Book for use in other apps. The two fonts add 82,763,340 bytes (about 79 MiB) to the Safari bundle. Only these font files are exposed as web-accessible resources; the dictionary and corrections are not.

Deployment targets are macOS 14 and iOS 17. The WebKit test uses a browser-API adapter and is **not** an installed Safari extension test. A temporary extension was tested once in actual macOS Safari: Accurate mode, context-scoped corrections, protected content, and undo passed. Bundled Font mode and deleting the final correction were fixed after that run and have automated coverage only. Signed containing-app installation, actual iOS rendering, and App Store distribution remain unverified.

## Correct a reading

Open **Correct a reading** in the popup and enter:

1. An exact context phrase, for example `生物を食べる`.
2. The written word within it: `生物`.
3. Its reading in kana: `なまもの`.
4. **This document** or **This site**, then **Save correction**.

The current page is reanalyzed if Accurate mode is active. Corrections also apply after reload and can be removed in the popup. They match exact context phrases across inline markup, so this example does not affect `生物を研究する`.

Document scope includes the URL path and query, excluding its fragment. Site scope uses the exact origin; local files support document scope only. All matches of the phrase within that scope are affected. A document correction outranks a site correction, newer rules outrank older ones within a scope, user corrections outrank built-in phrase rules, and phrase rules outrank analyzer output. Author ruby remains authoritative. There is a limit of 500 saved corrections.

Page text is analyzed locally in the extension service worker and is not sent to an external service. Only user-entered correction phrases/readings, their scope URLs, and site preferences are saved in local extension storage, not sync storage.

## Verification

```sh
npm run check
npm run test:extension
```

The browser test needs Playwright's Chromium (`npx playwright install chromium` if it is not cached), installed Hanori Serif Furigana for font-mode tests, and a supported plain Japanese font. It uses a temporary profile and a test copy of the extension with loopback access. It tests:

- Language boundaries, protected content, inline sentence context, and source text.
- Offline dictionary loading, Font → Accurate → Off, and actual plain-font use.
- Corrections, persistence, document isolation, precedence, and removal.
- Copying base text, links, dynamic changes, stale analysis results, and undo.
- Missing-font reporting, saved-site registration, and popup controls.

The standalone popup test supplies the fixture tab ID. It does not exercise the actual browser toolbar or optional-permission prompt. Tests inspect the popup and page in Chromium; Installed Safari extension behavior, Firefox, and broad real-site compatibility remain untested.

The reviewed set has **14 annotated reading targets, all correct**, and **8 contrast targets deliberately omitted** (14/22 target coverage). Six annotated targets exercise explicit textbook phrase rules. This small set is regression coverage, not an estimate of general Japanese reading accuracy. The full 1,252-character, eight-paragraph textbook was also processed locally (135 annotations); its complete readings have not been proofread.

## Analyzer and distribution

Kuromoji 0.1.2 uses the IPADIC morphological model. It was selected after a local prototype because it can run in a Manifest V3 service worker without WASM, remote code, XHR, or an offscreen document. The package supplies a pinned 17,791,956-byte compressed dictionary. Native `DecompressionStream` loads those extension-local assets on first use. A warm worker reuses the tokenizer; worker restarts load it again. Each text block is limited to 8,000 UTF-16 code units.

[Kuromoji](https://github.com/takuyaa/kuromoji.js) is Apache-2.0 and bundles IPADIC with its own notice. The build copies Kuromoji's license, its full IPADIC notice, and the bundled doublearray dependency's MIT license into `build/extension/licenses`. Keep them with the extension. Safari additionally copies the two existing Furigana OTFs and all notices from `licenses/` (OFL, MIT, and dictionary attribution). Chromium does not bundle fonts. No public fonts are modified.

## Current boundaries

- Main document only; iframes and shadow roots are not traversed.
- Browser internal pages, extension stores, PDF viewers, images, and scans are unsupported. Local HTML needs **Allow access to file URLs** and manual activation; no automatic file access is registered.
- Context is collected across inline elements within a block. Code, excluded languages, line breaks, and block boundaries end the context. Author ruby's base contributes context; its reading does not.
- Matching leading/trailing kana are excluded from ruby. Internal kana stay in whole-word ruby. A reading whose base crosses text nodes is left plain rather than splitting it arbitrarily or moving links/emphasis. Oversized blocks also stay plain, with omissions reported in the popup.
- Generated readings are removed from copied plain text. Existing author ruby's copy behavior remains the browser's. Rich HTML clipboard formatting is not preserved when a selection includes generated ruby.
- DOM wrappers can conflict with sites requiring an exact node structure or continuously replacing their content. Vertical writing is unverified.
- Page policies can prevent local font loading. Errors are reported. The plain font may fall back for rare missing glyphs; comprehensive glyph coverage is not guaranteed.

## Remaining validation

- Retest bundled Font mode and final-correction deletion in actual Safari, then verify signed installation of the Preview app and its embedded extension.
- Check actual printed/PDF output for clipping, missing glyphs, duplicate readings, and preserved author ruby. The original two-page textbook example has only been checked in browser screenshots.
- Expand the proofread sentence set with contrasting names, homographs, dates, durations, counters, and inflections. Report correct readings and omitted targets separately; the current fixture set is not a general accuracy benchmark.
- Verify the extension inside iOS Safari. The Preview app's iOS setup sheet test does not exercise Safari rendering.
