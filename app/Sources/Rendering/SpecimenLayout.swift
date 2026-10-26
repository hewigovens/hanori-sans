import CoreText
import Foundation

struct SpecimenLayout {
    struct Line {
        let text: CTLine
        let language: String?
        let baseline: CGFloat
    }

    let lines: [Line]
    let size: CGSize
    let missingGlyphCount: Int
    let fallbackFonts: [String]
    static let inset: CGFloat = 24

    init(catalog: FontCatalog, face: PreviewFace, settings: PreviewSettings, width: CGFloat) {
        let fontSize = CGFloat(settings.pointSize)
        let font = catalog.font(face, size: fontSize)
        let availableWidth = max(1, width - Self.inset * 2)
        var shaped: [(CTLine, String?)] = []
        var maxAscent = fontSize
        var maxDescent = fontSize * 0.25
        var missing = 0
        var fallbacks = Set<String>()
        let paragraphs = settings.text.replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n").components(separatedBy: "\n")

        for paragraph in paragraphs {
            let language = settings.hint.language(for: paragraph)
            var attributes: [NSAttributedString.Key: Any] = [
                NSAttributedString.Key(kCTFontAttributeName as String): font,
                NSAttributedString.Key(kCTForegroundColorFromContextAttributeName as String): true,
            ]
            if let language {
                attributes[NSAttributedString.Key(kCTLanguageAttributeName as String)] = language
            }
            let text = NSAttributedString(string: paragraph, attributes: attributes)
            let typesetter = CTTypesetterCreateWithAttributedString(text)
            if text.length == 0 {
                shaped.append((CTLineCreateWithAttributedString(text), language))
            }
            var offset = 0
            while offset < text.length {
                // Cluster fallback prevents a very narrow view from splitting
                // surrogate pairs or stalling on a glyph wider than the view.
                var count = CTTypesetterSuggestLineBreak(typesetter, offset, Double(availableWidth))
                if count == 0 {
                    count = CTTypesetterSuggestClusterBreak(typesetter, offset, Double(availableWidth))
                }
                if count == 0 {
                    count = (paragraph as NSString).rangeOfComposedCharacterSequence(at: offset).length
                }
                let line = CTTypesetterCreateLine(typesetter, CFRange(location: offset, length: count))
                shaped.append((line, language))
                let bounds = CTLineGetBoundsWithOptions(line, .useGlyphPathBounds)
                if !bounds.isNull && !bounds.isInfinite {
                    maxAscent = max(maxAscent, bounds.maxY)
                    maxDescent = max(maxDescent, -bounds.minY)
                }
                for run in CTLineGetGlyphRuns(line) as! [CTRun] {
                    let count = CTRunGetGlyphCount(run)
                    var ids = [CGGlyph](repeating: 0, count: count)
                    CTRunGetGlyphs(run, CFRange(location: 0, length: 0), &ids)
                    missing += ids.filter { $0 == 0 }.count
                    let runFont = (CTRunGetAttributes(run) as NSDictionary)[kCTFontAttributeName] as! CTFont
                    let name = CTFontCopyPostScriptName(runFont) as String
                    if name != face.fileName { fallbacks.insert(name) }
                }
                offset += count
            }
        }

        let advance = fontSize * settings.lineHeight
        lines = shaped.enumerated().map { index, item in
            Line(text: item.0, language: item.1, baseline: Self.inset + maxAscent + CGFloat(index) * advance)
        }
        size = CGSize(width: width, height: Self.inset * 2 + maxAscent + maxDescent
                      + CGFloat(max(0, lines.count - 1)) * advance)
        missingGlyphCount = missing
        fallbackFonts = fallbacks.sorted()
    }

    /// The caller supplies a top-left coordinate system on either platform.
    func draw(in context: CGContext, color: CGColor, showBaselines: Bool) {
        context.saveGState()
        defer { context.restoreGState() }
        context.translateBy(x: 0, y: size.height)
        context.scaleBy(x: 1, y: -1)
        context.textMatrix = .identity
        context.setFillColor(color)
        for line in lines {
            let y = size.height - line.baseline
            if showBaselines {
                context.setStrokeColor(color.copy(alpha: 0.16)!)
                context.setLineWidth(0.5)
                context.move(to: CGPoint(x: Self.inset, y: y))
                context.addLine(to: CGPoint(x: size.width - Self.inset, y: y))
                context.strokePath()
            }
            context.textPosition = CGPoint(x: Self.inset, y: y)
            CTLineDraw(line.text, context)
        }
    }
}
