import CoreText
import Foundation

let root = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
let families = try JSONSerialization.jsonObject(with: Data(contentsOf: root.appendingPathComponent("families.json"))) as! [[String: Any]]
let samples = ["AVATAR", "To Wa Ty Yo.", "A quiet morning. Let's read together.", "office affinity efficient", "Tfi Tfl ffi ffj", "WAVY 0123456789"]
var report: [[String: Any]] = []

func load(_ path: String) -> CTFont {
    let provider = CGDataProvider(url: root.appendingPathComponent(path) as CFURL)!
    return CTFontCreateWithGraphicsFont(CGFont(provider)!, 40, nil, nil)
}

func width(_ text: String, font: CTFont, kern: Bool) -> Double {
    var attributes: [NSAttributedString.Key: Any] = [
        NSAttributedString.Key(kCTFontAttributeName as String): font,
        NSAttributedString.Key(kCTLigatureAttributeName as String): 0,
        NSAttributedString.Key(kCTLanguageAttributeName as String): "en",
    ]
    if !kern { attributes[NSAttributedString.Key(kCTKernAttributeName as String)] = 0 }
    let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: attributes))
    for run in CTLineGetGlyphRuns(line) as! [CTRun] {
        let runFont = (CTRunGetAttributes(run) as NSDictionary)[kCTFontAttributeName] as! CTFont
        precondition(CTFontCopyPostScriptName(runFont) == CTFontCopyPostScriptName(font), "Latin probe used fallback")
    }
    return CTLineGetTypographicBounds(line, nil, nil, nil)
}

for family in families {
    let name = family["name"] as! String
    let stem = name.replacingOccurrences(of: " ", with: "")
    let prefix = family["id"] as! String == "sans" ? "" : "serif-"
    let base = try JSONSerialization.jsonObject(with: Data(contentsOf: root.appendingPathComponent("dist/\(prefix)base-report.json"))) as! [String: Any]
    let donor = load(base["latin_test_font"] as! String)
    for suffix in ["", "Furigana"] {
        let font = load("dist/\(stem)\(suffix)-Regular.otf")
        for text in samples {
            let expected = width(text, font: donor, kern: true) - width(text, font: donor, kern: false)
            let actual = width(text, font: font, kern: true) - width(text, font: font, kern: false)
            // Inter is scaled from 2048 UPM; each positioning adjustment rounds
            // to an integer at 1000 UPM. Source Serif already uses 1000 UPM.
            let tolerance = CTFontGetUnitsPerEm(font) == CTFontGetUnitsPerEm(donor) ? 0.001 : 0.025 * Double(text.count)
            precondition(abs(actual - expected) <= tolerance, "Latin kerning differs from donor: \(name) \(text), \(actual) vs \(expected)")
            report.append(["font": stem + suffix, "text": text, "kerning": actual, "donorKerning": expected])
        }
    }
}
let data = try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
try data.write(to: root.appendingPathComponent("dist/latin-kerning-report.json"))
print("Latin kerning matches both source fonts in native Core Text.")
