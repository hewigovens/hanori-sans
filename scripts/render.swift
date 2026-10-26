import AppKit
import CoreText
import ImageIO

let root = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
let regularName = "HanoriSans-Regular"
let furiganaName = "HanoriSansFurigana-Regular"
let baseReport = try JSONSerialization.jsonObject(with: Data(contentsOf: root.appendingPathComponent("dist/base-report.json"))) as! [String: Int]
let baseGlyphCount = baseReport["glyph_count"]!
for filename in ["HanoriSans-Regular.otf", "HanoriSansFurigana-Regular.otf"] {
    var error: Unmanaged<CFError>?
    let url = root.appendingPathComponent("dist/" + filename)
    guard CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error) else {
        fatalError("Font registration failed: \(String(describing: error?.takeRetainedValue()))")
    }
}

func makeLine(_ text: String, name: String, size: CGFloat, language: String = "en", color: CGColor = CGColor(gray: 0.13, alpha: 1)) -> CTLine {
    let font = CTFontCreateWithName(name as CFString, size, nil)
    precondition(CTFontCopyPostScriptName(font) as String == name, "Unexpected font fallback for \(name)")
    precondition(CTFontCopyName(font, kCTFontVersionNameKey) as String? == "Version 0.102", "Unexpected font version for \(name)")
    let attributes: [NSAttributedString.Key: Any] = [
        NSAttributedString.Key(kCTFontAttributeName as String): font,
        NSAttributedString.Key(kCTForegroundColorAttributeName as String): color,
        NSAttributedString.Key(kCTLanguageAttributeName as String): language
    ]
    return CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: attributes))
}

func describe(_ line: CTLine) -> [String: Any] {
    let runs = CTLineGetGlyphRuns(line) as! [CTRun]
    return [
        "width": CTLineGetTypographicBounds(line, nil, nil, nil),
        "runs": runs.map { run -> [String: Any] in
            let count = CTRunGetGlyphCount(run)
            var glyphs = [CGGlyph](repeating: 0, count: count)
            var advances = [CGSize](repeating: .zero, count: count)
            CTRunGetGlyphs(run, CFRange(location: 0, length: 0), &glyphs)
            CTRunGetAdvances(run, CFRange(location: 0, length: 0), &advances)
            let attributes = CTRunGetAttributes(run) as NSDictionary
            let font = attributes[kCTFontAttributeName] as! CTFont
            precondition(!glyphs.contains(0), "Missing glyph")
            return ["font": CTFontCopyPostScriptName(font) as String,
                    "glyphs": glyphs.map(Int.init), "advances": advances.map { $0.width }]
        }
    ]
}

func glyphIDs(_ line: CTLine, expectedFont: String) -> [CGGlyph] {
    (CTLineGetGlyphRuns(line) as! [CTRun]).flatMap { run in
        let attributes = CTRunGetAttributes(run) as NSDictionary
        let font = attributes[kCTFontAttributeName] as! CTFont
        precondition(CTFontCopyPostScriptName(font) as String == expectedFont, "Sample fell back to another font")
        var glyphs = [CGGlyph](repeating: 0, count: CTRunGetGlyphCount(run))
        CTRunGetGlyphs(run, CFRange(location: 0, length: 0), &glyphs)
        return glyphs
    }
}

let samples = [
    "english": "The quick brown fox jumps over the lazy dog. AVATAR 0123456789",
    "chinese": "今天的中文字体清晰，汉字宽度保持一致。骨直令遍返。",
    "japanese": "今日は日本語の勉強をします。東京駅で友達に会います。",
    "mixed": "LINE in English / 中文消息 / 日本語の勉強"
]
var report: [String: Any] = [:]
for name in [regularName, furiganaName] {
    var results: [String: Any] = [:]
    for language in ["en", "zh-Hans", "ja"] {
        results[language] = samples.mapValues { describe(makeLine($0, name: name, size: 40, language: language)) }
    }
    for text in samples.values {
        let english = makeLine(text, name: name, size: 40, language: "en")
        let expectedGlyphs = glyphIDs(english, expectedFont: name)
        let expectedWidth = CTLineGetTypographicBounds(english, nil, nil, nil)
        // The default deliberately changes Han glyphs for Japanese hints.
        // The always-on Furigana face keeps the same glyphs in every language.
        for language in name == furiganaName ? ["zh-Hans", "ja"] : ["zh-Hans"] {
            let localized = makeLine(text, name: name, size: 40, language: language)
            precondition(glyphIDs(localized, expectedFont: name) == expectedGlyphs, "App language changed the selected glyphs")
            precondition(abs(CTLineGetTypographicBounds(localized, nil, nil, nil) - expectedWidth) < 0.01, "App language changed text width")
        }
    }
    report[name] = results
}
let regularHan = makeLine("中文字体宽度一致", name: regularName, size: 40)
precondition(abs(CTLineGetTypographicBounds(regularHan, nil, nil, nil) - 320) < 0.01, "Han advance is not one em")
let plainJapanese = glyphIDs(makeLine("日本語", name: regularName, size: 40), expectedFont: regularName)
let rubyJapanese = glyphIDs(makeLine("日本語", name: furiganaName, size: 40), expectedFont: furiganaName)
precondition(plainJapanese != rubyJapanese && rubyJapanese.contains(where: { Int($0) >= baseGlyphCount }), "Furigana shaping did not select annotated glyphs")
let reportData = try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
try reportData.write(to: root.appendingPathComponent("dist/coretext-report.json"))

let width = 1800
let height = 1450
let space = CGColorSpaceCreateDeviceRGB()
let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4, space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
context.setFillColor(CGColor(red: 0.97, green: 0.965, blue: 0.95, alpha: 1))
context.fill(CGRect(x: 0, y: 0, width: width, height: height))
context.textMatrix = .identity

func draw(_ text: String, name: String = regularName, size: CGFloat, language: String = "en", x: CGFloat = 86, top: CGFloat, color: CGColor = CGColor(gray: 0.13, alpha: 1)) {
    context.textPosition = CGPoint(x: x, y: CGFloat(height) - top)
    CTLineDraw(makeLine(text, name: name, size: size, language: language, color: color), context)
}
func label(_ text: String, top: CGFloat) {
    draw(text, size: 21, top: top, color: CGColor(red: 0.34, green: 0.39, blue: 0.38, alpha: 1))
}
func rule(_ top: CGFloat) {
    context.setStrokeColor(CGColor(gray: 0.83, alpha: 1))
    context.setLineWidth(1)
    context.move(to: CGPoint(x: 86, y: CGFloat(height) - top))
    context.addLine(to: CGPoint(x: CGFloat(width) - 86, y: CGFloat(height) - top))
    context.strokePath()
}

draw("Hanori Sans", size: 76, top: 120)
draw("Inter + Source Han Sans CN + hiragana readings", size: 28, top: 174)
label("Native macOS Core Text specimen · Regular weight · Language hints shown below", top: 215)
rule(250)
label("ENGLISH / INTER", top: 300)
draw("The quick brown fox jumps over the lazy dog.", size: 49, top: 370)
draw("Aa Bb Gg Rr 0123456789  —  AVATAR, office & café", size: 43, top: 432)
rule(474)
label("SIMPLIFIED CHINESE / FULL-WIDTH HAN", top: 524)
draw("今天的中文字体清晰，汉字宽度保持一致。", size: 52, top: 599)
draw("周末一起去公园散步，顺路喝杯咖啡。 / Hello, 世界！", size: 47, top: 665)
rule(708)
label("HANORI SANS / ENGLISH LANGUAGE HINT / PLAIN", top: 758)
draw("今日は日本語の勉強をします。", size: 51, top: 834)
label("HANORI SANS / JAPANESE LANGUAGE HINT / READINGS ENABLED", top: 912)
draw("今日は日本語の勉強をします。", size: 51, language: "ja", top: 1024)
label("HANORI SANS FURIGANA / ENGLISH LANGUAGE HINT / ALWAYS ON", top: 1102)
draw("東京駅で友達に会います。", name: furiganaName, size: 51, top: 1214)
rule(1264)
label("The default follows app language hints. LINE's English mode leaves both languages plain.", top: 1315)
label("The Furigana face always offers readings; shared Chinese words can also receive them.", top: 1356)

let image = context.makeImage()!
let destination = CGImageDestinationCreateWithURL(root.appendingPathComponent("dist/specimen.png") as CFURL, "public.png" as CFString, 1, nil)!
CGImageDestinationAddImage(destination, image, nil)
precondition(CGImageDestinationFinalize(destination))
print("Rendered specimen.png; Core Text reports saved for English, Chinese, Japanese, and mixed text in three language contexts.")
