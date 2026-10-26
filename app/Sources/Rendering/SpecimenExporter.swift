import CoreText
import ImageIO
import UniformTypeIdentifiers

enum SpecimenExporter {
    static func png(catalog: FontCatalog, settings: PreviewSettings, width: Int = 1200) throws -> Data {
        let layouts = PreviewFace.allCases.map {
            SpecimenLayout(catalog: catalog, face: $0, settings: settings, width: CGFloat(width))
        }
        let height = Int(ceil(100 + layouts.reduce(0) { $0 + $1.size.height + 80 }))
        guard let context = CGContext(
            data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { throw ExportError.renderFailed }
        context.setFillColor(CGColor(gray: 1, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        context.translateBy(x: 0, y: CGFloat(height))
        context.scaleBy(x: 1, y: -1)

        func label(_ text: String, top: CGFloat, size: CGFloat) {
            let font = CTFontCreateUIFontForLanguage(.system, size, nil)!
            let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: [
                NSAttributedString.Key(kCTFontAttributeName as String): font,
                NSAttributedString.Key(kCTForegroundColorFromContextAttributeName as String): true,
            ]))
            context.saveGState()
            context.translateBy(x: 24, y: top + size)
            context.scaleBy(x: 1, y: -1)
            context.textMatrix = .identity
            context.textPosition = .zero
            context.setFillColor(CGColor(gray: 0.12, alpha: 1))
            CTLineDraw(line, context)
            context.restoreGState()
        }

        label("Hanori Preview", top: 20, size: 28)
        label("\(settings.hint.rawValue) · \(Int(settings.pointSize)) pt · \(settings.lineHeight.formatted(.number.precision(.fractionLength(1))))× line height", top: 58, size: 16)
        var top: CGFloat = 110
        for (face, layout) in zip(PreviewFace.allCases, layouts) {
            label(face.rawValue, top: top, size: 22)
            top += 40
            context.saveGState()
            context.translateBy(x: 0, y: top)
            layout.draw(in: context, color: CGColor(gray: 0.08, alpha: 1), showBaselines: settings.showBaselines)
            context.restoreGState()
            top += layout.size.height + 40
        }

        let data = NSMutableData()
        guard let image = context.makeImage(),
              let destination = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil) else {
            throw ExportError.renderFailed
        }
        CGImageDestinationAddImage(destination, image, nil)
        guard CGImageDestinationFinalize(destination) else { throw ExportError.renderFailed }
        return data as Data
    }

    enum ExportError: LocalizedError {
        case renderFailed
        var errorDescription: String? { "The specimen image could not be rendered. Try a smaller sample." }
    }
}
