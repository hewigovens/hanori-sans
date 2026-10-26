import CoreText
import ImageIO
import XCTest
@testable import HanoriPreview

final class HanoriPreviewTests: XCTestCase {
    func testBundledFontsLoadWithoutSystemInstallation() throws {
        let catalog = try FontCatalog()
        for face in PreviewFace.allCases {
            let font = catalog.font(face, size: 32)
            XCTAssertEqual(CTFontCopyPostScriptName(font) as String, face.fileName)
            XCTAssertEqual(CTFontCopyName(font, kCTFontVersionNameKey) as String?, "Version 0.103")
        }
    }

    func testKanaHintLeavesHanOnlyAndPunctuationAmbiguous() {
        for text in ["今日は晴れ。", "東京のカフェ", "東京ｶﾌｪ", "𛀀"] {
            XCTAssertEqual(LanguageHint.kana.language(for: text), "ja", text)
        }
        for text in ["今天一起阅读中文。", "今日 日本 東京 学生", "Hello!", "・ー。", ""] {
            XCTAssertNil(LanguageHint.kana.language(for: text), text)
        }
    }

    func testDefaultReadingsFollowActualCoreTextLanguageHint() throws {
        let catalog = try FontCatalog()
        for typeface in PreviewTypeface.allCases {
            var settings = PreviewSettings()
            settings.typeface = typeface
            settings.text = "今日は日本語の勉強をします。東京駅"
            settings.hint = .english
            let plain = SpecimenLayout(catalog: catalog, face: typeface.faces[0], settings: settings, width: 1200)
            settings.hint = .unspecified
            let untagged = SpecimenLayout(catalog: catalog, face: typeface.faces[0], settings: settings, width: 1200)
            settings.hint = .chinese
            let chinese = SpecimenLayout(catalog: catalog, face: typeface.faces[0], settings: settings, width: 1200)
            settings.hint = .japanese
            let japanese = SpecimenLayout(catalog: catalog, face: typeface.faces[0], settings: settings, width: 1200)
            let always = SpecimenLayout(catalog: catalog, face: typeface.faces[1], settings: settings, width: 1200)
            XCTAssertEqual(glyphs(plain), glyphs(chinese))
            XCTAssertEqual(glyphs(plain), glyphs(untagged))
            XCTAssertNotEqual(glyphs(plain), glyphs(japanese))
            XCTAssertEqual(glyphs(japanese), glyphs(always))
            settings.hint = .english
            XCTAssertEqual(glyphs(always), glyphs(SpecimenLayout(catalog: catalog, face: typeface.faces[1], settings: settings, width: 1200)))
            for layout in [plain, chinese, japanese, always] {
                XCTAssertEqual(layout.missingGlyphCount, 0)
                XCTAssertEqual(layout.fallbackFonts, [])
            }
        }
    }

    func testKanaModeAppliesHintsPerParagraph() throws {
        var settings = PreviewSettings()
        settings.text = "今天一起阅读。\n今日は日本語を読みます。\n東京"
        let layout = SpecimenLayout(catalog: try FontCatalog(), face: .standard, settings: settings, width: 1200)
        XCTAssertEqual(layout.lines.map(\.language), [nil, "ja", nil])
    }

    func testWrappingRetainsTextAndEmptyParagraphs() throws {
        var settings = PreviewSettings()
        settings.text = "阅读今天的中文。\n\n今日は晴れ。"
        let layout = SpecimenLayout(catalog: try FontCatalog(), face: .standard, settings: settings, width: 140)
        XCTAssertGreaterThan(layout.lines.count, 3)
        XCTAssertEqual(layout.missingGlyphCount, 0)
        XCTAssertEqual(layout.lines.map { CTLineGetStringRange($0.text).length }.reduce(0, +),
                       settings.text.replacingOccurrences(of: "\n", with: "").utf16.count)
        XCTAssertGreaterThan(layout.size.height, 200)
    }

    func testVeryNarrowWrappingKeepsUnicodeCharactersIntact() throws {
        var settings = PreviewSettings()
        settings.text = "A😀𛀀B"
        let layout = SpecimenLayout(catalog: try FontCatalog(), face: .standard, settings: settings, width: 49)
        let text = settings.text as NSString
        let pieces = layout.lines.map { line in
            let range = CTLineGetStringRange(line.text)
            return text.substring(with: NSRange(location: range.location, length: range.length))
        }
        XCTAssertEqual(pieces.joined(), settings.text)
        XCTAssertTrue(pieces.allSatisfy { $0.count == 1 })
    }

    func testExportProducesDecodablePNGContainingBothSpecimens() throws {
        let catalog = try FontCatalog()
        for typeface in PreviewTypeface.allCases {
            var settings = PreviewSettings()
            settings.typeface = typeface
            let data = try SpecimenExporter.png(catalog: catalog, settings: settings)
            let source = try XCTUnwrap(CGImageSourceCreateWithData(data as CFData, nil))
            let image = try XCTUnwrap(CGImageSourceCreateImageAtIndex(source, 0, nil))
            XCTAssertEqual(image.width, 1200)
            let single = SpecimenLayout(catalog: catalog, face: typeface.faces[0], settings: settings, width: 1200)
            XCTAssertGreaterThan(CGFloat(image.height), single.size.height * 2)
            let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.png")
            attachment.name = "Hanori \(typeface.rawValue) shared renderer"
            attachment.lifetime = .keepAlways
            add(attachment)
        }
    }

    func testSerifAndSansUseDifferentBundledChineseOutlines() throws {
        let catalog = try FontCatalog()
        func outline(_ face: PreviewFace) throws -> CGPath {
            let font = catalog.font(face, size: 40)
            var character: UniChar = 0x6C38 // 永
            var glyph: CGGlyph = 0
            XCTAssertTrue(CTFontGetGlyphsForCharacters(font, &character, &glyph, 1))
            return try XCTUnwrap(CTFontCreatePathForGlyph(font, glyph, nil))
        }
        XCTAssertNotEqual(try outline(.standard), try outline(.serif))
    }

    private func glyphs(_ layout: SpecimenLayout) -> [CGGlyph] {
        layout.lines.flatMap { line in
            (CTLineGetGlyphRuns(line.text) as! [CTRun]).flatMap { run in
                var glyphs = [CGGlyph](repeating: 0, count: CTRunGetGlyphCount(run))
                CTRunGetGlyphs(run, CFRange(location: 0, length: 0), &glyphs)
                return glyphs
            }
        }
    }
}
