import AppKit
import CoreText
import ImageIO

struct Candidate: Decodable {
    let label: String
    let path: String
    let postscript: String
    let scale: CGFloat
}
let root = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
let candidates = try JSONDecoder().decode([Candidate].self, from: Data(contentsOf: root.appendingPathComponent("comparison/fonts.json")))
for candidate in candidates {
    var error: Unmanaged<CFError>?
    precondition(CTFontManagerRegisterFontsForURL(root.appendingPathComponent(candidate.path) as CFURL, .process, &error), "Font registration failed")
}
let width = 1800, height = 1390
let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
context.setFillColor(CGColor(red: 0.97, green: 0.965, blue: 0.95, alpha: 1))
context.fill(CGRect(x: 0, y: 0, width: width, height: height))
context.textMatrix = .identity
let dark = CGColor(gray: 0.13, alpha: 1)
let muted = CGColor(red: 0.34, green: 0.39, blue: 0.38, alpha: 1)

func font(_ name: String, _ size: CGFloat) -> CTFont {
    let result = CTFontCreateWithName(name as CFString, size, nil)
    precondition(CTFontCopyPostScriptName(result) as String == name)
    return result
}
func line(_ text: String, font: CTFont, color: CGColor = CGColor(gray: 0.13, alpha: 1)) -> NSMutableAttributedString {
    NSMutableAttributedString(string: text, attributes: [
        NSAttributedString.Key(kCTFontAttributeName as String): font,
        NSAttributedString.Key(kCTForegroundColorAttributeName as String): color,
        NSAttributedString.Key(kCTLanguageAttributeName as String): "en"
    ])
}
func draw(_ attributed: NSAttributedString, top: CGFloat) {
    let text = CTLineCreateWithAttributedString(attributed)
    precondition(CTLineGetTypographicBounds(text, nil, nil, nil) < 1625, "Sample overflows")
    context.textPosition = CGPoint(x: 86, y: CGFloat(height) - top)
    CTLineDraw(text, context)
}
func label(_ text: String, size: CGFloat = 22, top: CGFloat, color: CGColor = CGColor(gray: 0.13, alpha: 1)) {
    draw(line(text, font: font("HanoriSans-Regular", size), color: color), top: top)
}
func rule(_ top: CGFloat) {
    context.setStrokeColor(CGColor(gray: 0.83, alpha: 1))
    context.move(to: CGPoint(x: 86, y: CGFloat(height) - top))
    context.addLine(to: CGPoint(x: CGFloat(width) - 86, y: CGFloat(height) - top))
    context.strokePath()
}

label("English typeface options", size: 64, top: 110)
label("Three Latin designs paired with the same Simplified Chinese typography.", size: 28, top: 167)
label("Latin cap heights matched for comparison; Chinese remains at a fixed size. All samples use Regular weight.", size: 21, top: 211, color: muted)
rule(251)
for (index, candidate) in candidates.enumerated() {
    let offset = CGFloat(index) * 335
    label(candidate.label, size: 31, top: 309 + offset)
    let latin = font(candidate.postscript, 47 * candidate.scale)
    draw(line("A quiet morning. Let's read together.", font: latin), top: 384 + offset)
    draw(line("Il1  O0  0123456789  a g R  /  office & café", font: font(candidate.postscript, 36 * candidate.scale)), top: 444 + offset)
    let mixed = line("Read together / 今天一起阅读。", font: font("HanoriSans-Regular", 45))
    mixed.addAttribute(NSAttributedString.Key(kCTFontAttributeName as String), value: font(candidate.postscript, 45 * candidate.scale), range: NSRange(location: 0, length: 16))
    draw(mixed, top: 517 + offset)
    rule(559 + offset)
}
label("Sources: Inter Project · Adobe Source Sans 3 · IBM Plex Sans. Candidate fonts are licensed under SIL OFL 1.1.", size: 20, top: 1283, color: muted)
label("Native macOS Core Text rendering. This comparison does not change the installed Hanori font.", size: 20, top: 1324, color: muted)
let destination = CGImageDestinationCreateWithURL(root.appendingPathComponent("comparison/english-fonts.png") as CFURL, "public.png" as CFString, 1, nil)!
CGImageDestinationAddImage(destination, context.makeImage()!, nil)
precondition(CGImageDestinationFinalize(destination))
print("Rendered comparison/english-fonts.png")
