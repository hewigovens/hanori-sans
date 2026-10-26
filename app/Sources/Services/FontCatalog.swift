import CoreText
import Foundation

/// Loading bundled bytes directly prevents installed fonts with the same name
/// from silently replacing the version under test. No system install is needed.
final class FontCatalog {
    private var fonts: [PreviewFace: CGFont] = [:]

    init(bundle: Bundle = .main) throws {
        for face in PreviewFace.allCases {
            guard let url = bundle.url(forResource: face.fileName, withExtension: "otf"),
                  let provider = CGDataProvider(url: url as CFURL),
                  let font = CGFont(provider),
                  font.postScriptName as String? == face.fileName else {
                throw FontError.unavailable(face.rawValue)
            }
            fonts[face] = font
        }
    }

    func font(_ face: PreviewFace, size: CGFloat) -> CTFont {
        CTFontCreateWithGraphicsFont(fonts[face]!, size, nil, nil)
    }

    enum FontError: LocalizedError {
        case unavailable(String)
        var errorDescription: String? {
            switch self {
            case .unavailable(let name): return "The bundled file for \(name) is missing or invalid. Rebuild the app with both fonts from dist/."
            }
        }
    }
}
