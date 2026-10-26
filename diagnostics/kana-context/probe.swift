import Foundation
import CoreText
let root = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
var error: Unmanaged<CFError>?
precondition(CTFontManagerRegisterFontsForURL(root.appendingPathComponent("work/Probe.otf") as CFURL, .process, &error))
let font = CTFontCreateWithName("HanoriKanaProbe-Regular" as CFString, 40, nil)
let ids = try JSONSerialization.jsonObject(with: Data(contentsOf: root.appendingPathComponent("work/glyphs.json"))) as! [String: Int]
var results: [[String: Any]] = []
for language in [nil, "en", "ja", "zh-Hans"] as [String?] {
 for sample in ["日", "日月", "日は", "は日", "日ハ", "ハ日", "日ｱ", "ｱ日", "今日は日本語の勉強をします。"] {
  var attributes: [NSAttributedString.Key: Any] = [NSAttributedString.Key(kCTFontAttributeName as String):font]
  if let language { attributes[NSAttributedString.Key(kCTLanguageAttributeName as String)] = language }
  let line = CTLineCreateWithAttributedString(NSAttributedString(string: sample, attributes: attributes))
  var all: [CGGlyph] = []
  for run in CTLineGetGlyphRuns(line) as! [CTRun] {
   let runAttributes = CTRunGetAttributes(run) as NSDictionary
   let runFont = runAttributes[kCTFontAttributeName] as! CTFont
   precondition(CTFontCopyPostScriptName(runFont) as String == "HanoriKanaProbe-Regular")
   var glyphs = [CGGlyph](repeating: 0, count: CTRunGetGlyphCount(run))
   CTRunGetGlyphs(run, CFRange(location: 0, length: 0), &glyphs)
   all += glyphs
  }
  let triggered = all.contains(CGGlyph(ids["一"]!))
  results.append(["language":language ?? "unspecified", "text":sample, "kanaOrControlRuleTriggered":triggered, "glyphs":all.map(Int.init)])
 }
}
let data = try JSONSerialization.data(withJSONObject:results,options:[.prettyPrinted,.sortedKeys,.withoutEscapingSlashes])
try data.write(to:root.appendingPathComponent("coretext-results.json"))
print(String(data:data,encoding:.utf8)!)
