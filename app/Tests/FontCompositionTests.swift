import CoreText
import XCTest
@testable import HanoriPreview

final class FontCompositionTests: XCTestCase {
    func testChineseOutlinesAndAdvancesMatchSources() throws {
        let catalog = try FontCatalog()
        for typeface in PreviewTypeface.allCases {
            let source = try sourceFont(typeface == .sans ? "SourceHanSansCN-Regular.otf" : "SourceHanSerifCN-Regular.otf")
            for face in typeface.faces {
                let font = catalog.font(face, size: 40)
                for character in "中文字体清晰汉字宽度一致骨直令遍返日本語勉強東京駅友達".utf16 {
                    let glyph = try glyphID(character, in: font)
                    let original = try glyphID(character, in: source)
                    XCTAssertEqual(CTFontCreatePathForGlyph(font, glyph, nil), CTFontCreatePathForGlyph(source, original, nil))
                    var advance = CGSize.zero
                    var current = glyph
                    CTFontGetAdvancesForGlyphs(font, .horizontal, &current, &advance, 1)
                    XCTAssertEqual(advance.width, 40, accuracy: 0.001)
                }
            }
        }
    }

    func testLatinKerningMatchesSources() throws {
        let catalog = try FontCatalog()
        let samples = ["AVATAR", "To Wa Ty Yo.", "A quiet morning. Let's read together.",
                       "office affinity efficient", "Tfi Tfl ffi ffj", "WAVY 0123456789"]
        for typeface in PreviewTypeface.allCases {
            let variations: [NSNumber: CGFloat] = typeface == .sans
                ? [NSNumber(value: 0x77676874): 400, NSNumber(value: 0x6f70737a): 14] : [:]
            let source = try sourceFont(typeface == .sans ? "InterVariable.ttf" : "SourceSerif4-Regular.otf", variations: variations)
            for face in typeface.faces {
                let font = catalog.font(face, size: 40)
                for text in samples {
                    let expected = width(text, font: source, kern: true) - width(text, font: source, kern: false)
                    let actual = width(text, font: font, kern: true) - width(text, font: font, kern: false)
                    let tolerance = typeface == .sans ? 0.025 * Double(text.count) : 0.001
                    XCTAssertEqual(actual, expected, accuracy: tolerance, "\(face.rawValue): \(text)")
                }
            }
        }
    }

    private func sourceFont(_ filename: String, variations: [NSNumber: CGFloat] = [:]) throws -> CTFont {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: filename, withExtension: nil, subdirectory: "sources"))
        let descriptors = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [CTFontDescriptor]
        var descriptor = try XCTUnwrap(descriptors?.first)
        if !variations.isEmpty {
            descriptor = CTFontDescriptorCreateCopyWithAttributes(descriptor, [kCTFontVariationAttribute: variations] as CFDictionary)
        }
        return CTFontCreateWithFontDescriptor(descriptor, 40, nil)
    }

    private func glyphID(_ character: UniChar, in font: CTFont) throws -> CGGlyph {
        var character = character
        var glyph: CGGlyph = 0
        XCTAssertTrue(CTFontGetGlyphsForCharacters(font, &character, &glyph, 1))
        return glyph
    }

    private func width(_ text: String, font: CTFont, kern: Bool) -> Double {
        var attributes: [NSAttributedString.Key: Any] = [
            NSAttributedString.Key(kCTFontAttributeName as String): font,
            NSAttributedString.Key(kCTLigatureAttributeName as String): 0,
            NSAttributedString.Key(kCTLanguageAttributeName as String): "en",
        ]
        if !kern { attributes[NSAttributedString.Key(kCTKernAttributeName as String)] = 0 }
        let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: attributes))
        for run in CTLineGetGlyphRuns(line) as! [CTRun] {
            let runFont = (CTRunGetAttributes(run) as NSDictionary)[kCTFontAttributeName] as! CTFont
            XCTAssertEqual(CTFontCopyPostScriptName(runFont), CTFontCopyPostScriptName(font), "Unexpected fallback")
        }
        return CTLineGetTypographicBounds(line, nil, nil, nil)
    }
}
