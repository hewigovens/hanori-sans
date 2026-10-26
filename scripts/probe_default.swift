import Foundation
import CoreText

let root = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
for relativePath in ["dist/HanoriSans-Regular.otf", "dist/HanoriSansFurigana-Regular.otf", "build/HanoriBase-Regular.otf"] {
    var error: Unmanaged<CFError>?
    precondition(CTFontManagerRegisterFontsForURL(root.appendingPathComponent(relativePath) as CFURL, .process, &error))
}
let name = "HanoriSans-Regular"
let font = CTFontCreateWithName(name as CFString, 40, nil)
precondition(CTFontCopyPostScriptName(font) as String == name)
precondition(CTFontCopyName(font, kCTFontVersionNameKey) as String? == "Version 0.102", "Wrong default font version")
let baseReport = try JSONSerialization.jsonObject(with: Data(contentsOf: root.appendingPathComponent("dist/base-report.json"))) as! [String: Int]
let baseGlyphCount = baseReport["glyph_count"]!

func glyphIDs(_ text: String, name: String, language: String?) -> [CGGlyph] {
    let chosen = CTFontCreateWithName(name as CFString, 40, nil)
    var attributes: [NSAttributedString.Key: Any] = [NSAttributedString.Key(kCTFontAttributeName as String): chosen]
    if let language { attributes[NSAttributedString.Key(kCTLanguageAttributeName as String)] = language }
    let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: attributes))
    return (CTLineGetGlyphRuns(line) as! [CTRun]).flatMap { run in
        let attributes = CTRunGetAttributes(run) as NSDictionary
        let runFont = attributes[kCTFontAttributeName] as! CTFont
        precondition(CTFontCopyPostScriptName(runFont) as String == name, "Unexpected comparison fallback")
        var glyphs = [CGGlyph](repeating: 0, count: CTRunGetGlyphCount(run))
        CTRunGetGlyphs(run, CFRange(location: 0, length: 0), &glyphs)
        return glyphs
    }
}
let samples = ["今天是星期一，我们一起学习中文。", "今日は日本語の勉強をします。", "今日", "日本", "東京"]
var output: [[String: Any]] = []
for language in [nil, "en", "zh-Hans", "ja"] as [String?] {
    for text in samples {
        var attributes: [NSAttributedString.Key: Any] = [NSAttributedString.Key(kCTFontAttributeName as String): font]
        if let language { attributes[NSAttributedString.Key(kCTLanguageAttributeName as String)] = language }
        let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: attributes))
        var annotated = 0
        for run in CTLineGetGlyphRuns(line) as! [CTRun] {
            let attributes = CTRunGetAttributes(run) as NSDictionary
            let runFont = attributes[kCTFontAttributeName] as! CTFont
            precondition(CTFontCopyPostScriptName(runFont) as String == name, "Unexpected fallback font")
            var glyphs = [CGGlyph](repeating: 0, count: CTRunGetGlyphCount(run))
            CTRunGetGlyphs(run, CFRange(location: 0, length: 0), &glyphs)
            precondition(!glyphs.contains(0))
            annotated += glyphs.filter { Int($0) >= baseGlyphCount }.count
        }
        if language == "ja" {
            precondition(annotated > 0, "Japanese hint did not activate ruby")
            precondition(glyphIDs(text, name: name, language: language) == glyphIDs(text, name: "HanoriSansFurigana-Regular", language: language), "Japanese-hinted default differs from Furigana face")
        } else {
            precondition(annotated == 0, "Readings appeared without a Japanese hint")
            precondition(glyphIDs(text, name: name, language: language) == glyphIDs(text, name: "HanoriSansBase-Regular", language: language), "Default without a Japanese hint differs from plain base")
        }
        output.append(["language": language ?? "unspecified", "text": text, "annotatedGlyphs": annotated])
    }
}
let data = try JSONSerialization.data(withJSONObject: output, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
try data.write(to: root.appendingPathComponent("dist/default-language-report.json"))
print("Hanori Sans default passed: plain base glyphs for Chinese, English, and missing hints; Furigana face glyphs for Japanese hints.")
