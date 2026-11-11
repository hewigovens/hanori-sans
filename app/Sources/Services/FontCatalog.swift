import CoreText
import Foundation
#if os(macOS)
import AppKit
#endif

/// Loading bundled bytes directly prevents installed fonts with the same name
/// from silently replacing the version under test. No system install is needed.
final class FontCatalog {
    private var fonts: [PreviewFace: CGFont] = [:]
    private var fontURLs: [URL] = []

    init(bundle: Bundle = .main) throws {
        for face in PreviewFace.allCases {
            guard let url = bundle.url(forResource: face.fileName, withExtension: "otf"),
                  let provider = CGDataProvider(url: url as CFURL),
                  let font = CGFont(provider),
                  font.postScriptName as String? == face.fileName else {
                throw FontError.unavailable(face.rawValue)
            }
            fonts[face] = font
            fontURLs.append(url)
        }
    }

    func font(_ face: PreviewFace, size: CGFloat) -> CTFont {
        CTFontCreateWithGraphicsFont(fonts[face]!, size, nil, nil)
    }

    #if os(macOS)
    @MainActor
    func openInFontBook() async throws {
        let workspace = NSWorkspace.shared
        guard let fontBook = workspace.urlForApplication(withBundleIdentifier: "com.apple.FontBook") else {
            throw FontError.fontBookUnavailable
        }
        _ = try await workspace.open(fontURLs, withApplicationAt: fontBook, configuration: NSWorkspace.OpenConfiguration())
    }
    #endif

    enum FontError: LocalizedError {
        case unavailable(String)
        case fontBookUnavailable
        var errorDescription: String? {
            switch self {
            case .unavailable(let name): return "The bundled file for \(name) is missing or invalid. Rebuild the app with all four fonts from dist/."
            case .fontBookUnavailable: return "Font Book could not be found. Install the OTF files from the Hanori download using your font manager."
            }
        }
    }
}
