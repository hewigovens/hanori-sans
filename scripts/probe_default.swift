import Foundation
import CoreText

let root = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
let familyID = CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : "sans"
let families = try JSONSerialization.jsonObject(with: Data(contentsOf: root.appendingPathComponent("families.json"))) as! [[String: Any]]
let family = families.first { $0["id"] as? String == familyID }!
let familyName = family["name"] as! String
let stem = familyName.replacingOccurrences(of: " ", with: "")
let prefix = familyID == "sans" ? "" : familyID + "-"
let package = try JSONSerialization.jsonObject(with: Data(contentsOf: root.appendingPathComponent("package.json"))) as! [String: Any]
let version = (package["version"] as! String).split(separator: ".").map { Int($0)! }
let expectedVersion = String(format: "Version %d.%d%02d", version[0], version[1], version[2])
let name = stem + "-Regular"
let furiganaName = stem + "Furigana-Regular"
let baseName = stem + "Base-Regular"
var fonts: [String: CGFont] = [:]
for (fontName, folder) in [(name, "dist"), (furiganaName, "dist"), (baseName, "build")] {
    let url = root.appendingPathComponent("\(folder)/\(fontName).otf")
    fonts[fontName] = CGFont(CGDataProvider(url: url as CFURL)!)!
}
let font = CTFontCreateWithGraphicsFont(fonts[name]!, 40, nil, nil)
precondition(CTFontCopyName(font, kCTFontVersionNameKey) as String? == expectedVersion, "Wrong default font version")
let baseReport = try JSONSerialization.jsonObject(with: Data(contentsOf: root.appendingPathComponent("dist/\(prefix)base-report.json"))) as! [String: Any]
let baseGlyphCount = baseReport["glyph_count"] as! Int

func glyphIDs(_ text: String, name: String, language: String?) -> [CGGlyph] {
    let chosen = CTFontCreateWithGraphicsFont(fonts[name]!, 40, nil, nil)
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
            precondition(glyphIDs(text, name: name, language: language) == glyphIDs(text, name: furiganaName, language: language), "Japanese-hinted default differs from Furigana face")
        } else {
            precondition(annotated == 0, "Readings appeared without a Japanese hint")
            precondition(glyphIDs(text, name: name, language: language) == glyphIDs(text, name: baseName, language: language), "Default without a Japanese hint differs from plain base")
        }
        output.append(["language": language ?? "unspecified", "text": text, "annotatedGlyphs": annotated])
    }
}
let data = try JSONSerialization.data(withJSONObject: output, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
try data.write(to: root.appendingPathComponent("dist/\(prefix)default-language-report.json"))
print("\(familyName) default passed: plain base glyphs for Chinese, English, and missing hints; Furigana face glyphs for Japanese hints.")
