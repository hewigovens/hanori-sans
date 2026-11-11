# Hanori Preview

A shared SwiftUI app for iOS 17+ and macOS 14+. It loads all four OTFs directly from the app bundle, including when a different Hanori version is installed on the Mac. Previewing does not require font installation or network access. On macOS, **Install Fonts…** in the toolbar opens all four bundled faces in Font Book. Finish installation there to use Hanori in other apps; Font Book handles validation and duplicates. Reopen other apps after installing. The preview continues to use its bundled copies.

## Run

Open `HanoriPreview.xcodeproj`, select the **HanoriPreview** scheme, and choose **My Mac** or an iPhone/iPad simulator. For a physical iOS device, select your own signing team in Xcode.

The same app embeds the `HanoriSafariExtension` target on both platforms. Use **Safari Extension** in the preview toolbar for setup instructions and, on macOS, **Open Safari Extension Settings**. Before building directly in Xcode, prepare its web resources with `npm run build:safari -- --project-only`. The npm app and test commands do this automatically. See [the extension guide](../extension/README.md) for reading modes and corrections.

From the repository root, the macOS entrypoint is:

```sh
npm run app
```

Use `npm run app -- --verify`, `--debug`, `--logs`, or `--telemetry` for the other runner modes. The checked-in `HanoriPreview.xcodeproj/project.xcproj` JSON is the project configuration; edit it directly or through Xcode. XcodeGen is not required. The runner is TypeScript in `tools/hanori.ts`, shared with the font commands. Xcode 27+ supports the format; this repository uses Xcode 27.2+.

## Use

Choose Sans or Serif with the typeface selector. Each design shows its default and always-on Furigana faces with the same text.

On iOS, **Text** opens a focused editor with a Samples menu. Changes appear in both previews. **Appearance** opens a grouped form for text language, font size, line spacing, and baseline guides; Reset appearance restores those settings without replacing the text or selected design. A compact summary stays above the previews. The Mac keeps these controls in its sidebar.

**Export PNG** saves a 1200-pixel-wide specimen of the selected design's two reading modes using the same renderer as the live cards. PNG exports use dark text on white; the app follows the device's Light/Dark appearance.

Language hints:

| Mode | Hint supplied to Core Text |
| --- | --- |
| Kana hint | `ja` for each paragraph containing kana; otherwise none |
| No hint | None |
| English | `en` |
| Simplified Chinese | `zh-Hans` |
| Japanese | `ja` |

The default **Hanori Sans** and **Hanori Serif** enable readings only with a Japanese hint. Their **Furigana** siblings keep dictionary readings enabled in all modes. The app sets [`kCTLanguageAttributeName`](https://developer.apple.com/documentation/coretext/kctlanguageattributename) on each paragraph before Core Text shapes and wraps the text.

Kana hints are a heuristic. Han-only Japanese stays plain, and Chinese quoting kana in the same paragraph can receive Japanese readings. These controls test app-provided hints; they do not add detection to the font or to LINE.

## Build and test

Run these commands from the repository root:

```sh
# Native macOS composition and renderer tests (Xcode 27.2+).
npm run verify:native

# Include the Mac UI test.
npm run test:app

# iOS Simulator: replace the device name with an available simulator.
xcodebuild -project app/HanoriPreview.xcodeproj -scheme HanoriPreview \
  -destination 'platform=iOS Simulator,name=iPhone 18 Pro Max' \
  -derivedDataPath build/ios CODE_SIGNING_ALLOWED=NO test

# Physical iPhone: supply your device UDID and signing team locally.
xcodebuild -project app/HanoriPreview.xcodeproj -scheme HanoriPreview \
  -destination 'platform=iOS,id=YOUR_DEVICE_UDID' -derivedDataPath build/phone \
  DEVELOPMENT_TEAM=YOUR_TEAM_ID -allowProvisioningUpdates test
```

The shared tests load all four bundled fonts, compare Chinese outlines and Latin kerning against the pinned sources, and exercise actual Core Text glyph selection across language hints, per-paragraph kana handling, narrow wrapping, and PNG exports. The original fonts are resources of the test target only; they are not added to the production app bundle. The PNG exports for both designs are retained as test attachments. The UI test switches to Serif and retains screenshots of its default and Furigana cards. The iOS flow test also selects a sample, edits text, changes appearance settings, and checks the resulting preview. These checks complement the font build's `npm run verify`; they do not prove another app's shaping, fallback, or line-height behavior.

The root README screenshots live in `docs/screenshots/`. Refresh them from the UI test attachments named **Hanori Serif preview** (macOS), **Hanori Sans preview** (iOS), and **Hanori Appearance** (iOS). Mac captures include only the Hanori window.

## App icon

The icon combines 文 with the furigana ぶん on an ink-teal background. App-icon masters and Retina sizes are in `Assets.xcassets/AppIcon.appiconset/`. The iOS master is opaque; the macOS variant has a transparent margin and rounded tile. The shared accent color includes Light and Dark appearances. The Mac app applies the bundled ICNS at launch so local rebuilds show the current artwork in the Dock even when Launch Services has cached an older icon.
