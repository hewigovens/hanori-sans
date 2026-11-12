# Chrome Web Store listing

Listing text for the Hanori Reading Help item, as submitted with version 0.1.3. Update the developer dashboard by hand when this changes.

## Store listing

**Name** (from the manifest): Hanori Reading Help

**Summary** (from the manifest description, 132 characters max): Furigana for Japanese webpages: readings above kanji, analyzed on your device, with corrections you can save.

**Category:** Education

**Language:** English

**Description:**

```text
Hanori adds furigana (small kana readings above kanji) to Japanese webpages, so learners and young readers can keep reading without stopping to look words up.

Click the Hanori button on a Japanese page, turn on readings, and choose a mode:

• Accurate — analyzes each sentence on your device with a bundled dictionary and adds readings above the words. It works without installing anything else.
• Font — a lighter option that shows readings through the free Hanori Furigana fonts. It needs those fonts installed on your computer; when they are not, Hanori selects Accurate mode for you.

When a reading is wrong, fix it. Open "Correct a reading", paste the phrase, type the right reading, and save it for the current page or the whole site. Your correction applies only to that phrase, so fixing 生物 in one sentence does not change it in another.

Good to know:
• Everything runs locally. Page text is never sent to a server, and there are no accounts, analytics, or ads.
• Readings can be wrong. Names, numbers, and words with several readings are hard; Hanori leaves the ones it is unsure about without a reading rather than guessing.
• Only text marked as Japanese gets readings by default. You can include untagged text when a site does not label its language.
• Readings the page already provides are kept as they are. Code, forms, and editable fields are left alone.
• "Always enable on this site" asks for access to that one site and applies readings on every visit. Without it, Hanori runs only when you click it.
• Turn readings off to restore the page exactly as it was. Copied text does not include the added readings.
• "Print…" waits for readings to finish before opening the print dialog.

Hanori is open source: https://github.com/hewigovens/hanori-sans
```

**Screenshots** (1280×800, in `docs/screenshots/`): `store-1-accurate.png`, `store-2-font.png`, `store-3-correction.png`.

**Homepage URL:** https://github.com/hewigovens/hanori-sans

**Support URL:** https://github.com/hewigovens/hanori-sans/issues

## Privacy practices

**Single purpose:** Show furigana readings for Japanese text on the webpage the user is viewing.

**Permission justifications:**

- `activeTab`: Add or remove readings on the current tab when the user clicks the Hanori button.
- `scripting`: Insert the reading annotations into the page the user chose, and register the same script for sites where the user selected "Always enable on this site".
- `storage`: Save the user's reading corrections and per-site preferences locally in the browser.
- Host permissions (optional, requested per site): Requested only when the user selects "Always enable on this site", and only for that site, so readings can be applied on later visits without clicking again.

**Remote code:** No. All code and the dictionary are included in the package.

**Data usage:** Hanori does not collect or transmit user data. Page text is analyzed inside the extension and discarded. Corrections and site preferences are stored locally and never leave the browser. Check none of the data-collection boxes and certify all three statements.

**Privacy policy URL:** https://github.com/hewigovens/hanori-sans/blob/main/extension/README.md#privacy
