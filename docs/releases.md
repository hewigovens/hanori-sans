# Releases

Hanori follows the local Mac release flow used by JayJay: build and sign locally, notarize using the existing keychain profile, verify the extracted ZIP, publish the release, then review the Homebrew tap changes. GitHub Actions runs [Release checks](../.github/workflows/release.yml); no signing certificate, notarization credentials, or tap token is stored in Actions.

A release contains `Hanori-VERSION.zip` for the four fonts, `HanoriPreview-VERSION-macos-universal.zip` for the macOS Preview app with its embedded Safari extension, and `SHA256SUMS` for both ZIPs. The app supports Apple Silicon and Intel Macs running macOS 14+. The same Xcode project supports iOS, but this workflow does not distribute an iOS IPA; iOS distribution requires a separate App Store/TestFlight release.

## Prepare and validate

1. Update `package.json` and its lockfile, for example with `npm version patch --no-git-tag-version`. Update `MARKETING_VERSION` in `app/HanoriPreview.xcodeproj/project.xcproj` to match, and increment `CURRENT_PROJECT_VERSION`. The extension inherits the app's native version. Packaging rejects a mismatch between the fonts, app, and extension.
2. Review the changes since the previous release and write `releases/VERSION.md` with user-facing notes for the fonts, Preview app, and extension. Update the shipped documentation.
3. Run `npm run build`, `npm test`, `npm run verify:native`, `npm run test:extension`, `npm run test:safari`, and `npm run build:safari -- --ios`. Review the regenerated `dist/` files and native/browser behavior, then commit the reviewed source, notes, versions, and font outputs.
4. Run `npm run release:app` on the unlocked Mac. It requires a clean checkout, builds both architectures in Release configuration, signs the host and extension with hardened runtime and explicit sandbox entitlements, submits the ZIP to Apple, staples the accepted ticket, then extracts and verifies the final ZIP with `codesign`, `stapler`, and Gatekeeper. It records the source commit and archive hash in ignored `build/release/app-release.json`.
5. Create and push `vVERSION` at that exact commit, then wait for **Release checks** on the tag. The workflow checks the version, rebuilds and verifies all four fonts, requires committed `dist/` outputs to match, runs native tests, and builds the macOS and iOS Simulator apps with embedded-resource verification. It uploads a font candidate artifact but does not publish anything.
6. Run `npm run release:publish`. It requires a clean checkout, matching local and remote tags, passing tag checks, nonempty release notes, and a verified notarized app from the same commit. It packages and verifies the font ZIP, publishes both ZIPs and their checksums, downloads the public assets to verify their hashes, and only then writes `Casks/font-hanori.rb` and `Casks/hanori-preview.rb` in `../tap`. It refuses to overwrite existing Hanori cask edits. An existing GitHub release causes publication to fail; no published asset is overwritten.
7. Review and audit both casks, then commit and push the tap changes separately. The publication command does not commit or push either repository.

## Local prerequisites

Use Xcode 27.2+, Node 22.18+, npm, and an authenticated `gh` CLI. The release tools select the only valid Developer ID Application identity in the local keychain. If multiple certificates exist, set `DEVELOPER_ID_APPLICATION` to the intended certificate SHA-1. Certificates, private keys, signing teams, and keychain passwords remain local.

The notarization profile defaults to `notarytool`, matching JayJay; override it with `NOTARY_PROFILE` when necessary. Configure that profile using Apple's normal keychain credential setup. Keep the Mac unlocked so the signing identity and profile remain accessible. The workflow never exports your certificate or uploads credentials to GitHub.

The app uses `me.hanori.preview`, and its extension uses `me.hanori.preview.safari`. Both are signed by the same Developer ID identity. They have sandbox entitlements; the Preview app additionally allows user-selected file read/write access for PNG export. No development debugger entitlement is allowed in a release.

## Packaging checks without publication

```sh
# Build and verify fonts first; this only packages existing dist/ outputs.
npm run package:release

# Sign and verify the universal app locally without sending it to Apple.
npm run release:app -- --skip-notarization
```

The font packager round-trips every ZIP entry against its input bytes and includes all files from `licenses/`. The app check verifies both executable architectures, bundle identifiers, versions, Developer ID signatures, hardened runtime, sandbox entitlements, and extension resources in the extracted ZIP. Skipping notarization deliberately removes the publishable marker; this candidate cannot be used by `release:publish`.

Use **Actions → Release checks → Run workflow** to validate an arbitrary ref without publishing. Tag pushes also validate only. The workflow runs on GitHub's hosted `xcode-27` image; no self-hosted runner is needed.

## Browser extension

The Chromium extension is packaged separately with `npm run package:extension`; see [the extension guide](../extension/README.md#chrome-web-store-package). It shares the version in `package.json`. Uploading it to the Chrome Web Store is a manual step and is not part of `release:publish`.

## Homebrew

The existing font cask remains `brew install --cask hewigovens/tap/font-hanori`. After the first app release and tap update, the app cask is `brew install --cask hewigovens/tap/hanori-preview`. It installs the existing Preview app, including its Safari extension, without automatically installing fonts system-wide. The app’s **Install Fonts…** action lets users install the bundled fonts through Font Book. Both casks are generated from the hashes of the actual published assets; don't substitute a locally rebuilt ZIP's checksum for an already published asset.

## Status

The notarization and publication commands and the hosted workflow have not yet completed a first real release. Local packaging, version-mismatch, archive-integrity, and signing checks do not cover them.
