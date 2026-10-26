import SwiftUI

#if os(macOS)
import AppKit
typealias PlatformView = NSView
#else
import UIKit
typealias PlatformView = UIView
#endif

/// SwiftUI owns controls and layout; this native view draws shared Core Text
/// lines with explicit language hints on both platforms.
final class NativeSpecimenView: PlatformView {
    var catalog: FontCatalog?
    var face = PreviewFace.standard
    var settings = PreviewSettings()

    func layout(width: CGFloat) -> SpecimenLayout? {
        guard let catalog else { return nil }
        return SpecimenLayout(catalog: catalog, face: face, settings: settings, width: max(1, width))
    }

    #if os(macOS)
    override var isFlipped: Bool { true }
    #endif

    override func draw(_ rect: CGRect) {
        guard let layout = layout(width: bounds.width) else { return }
        #if os(macOS)
        guard let context = NSGraphicsContext.current?.cgContext else { return }
        let color = NSColor.labelColor.cgColor
        #else
        guard let context = UIGraphicsGetCurrentContext() else { return }
        let color = UIColor.label.resolvedColor(with: traitCollection).cgColor
        #endif
        layout.draw(in: context, color: color, showBaselines: settings.showBaselines)
    }
}

#if os(macOS)
struct SpecimenView: NSViewRepresentable {
    let catalog: FontCatalog
    let face: PreviewFace
    let settings: PreviewSettings

    func makeNSView(context: Context) -> NativeSpecimenView { NativeSpecimenView(frame: .zero) }
    func updateNSView(_ view: NativeSpecimenView, context: Context) {
        view.catalog = catalog
        view.face = face
        view.settings = settings
        view.needsDisplay = true
    }
    func sizeThatFits(_ proposal: ProposedViewSize, nsView: NativeSpecimenView, context: Context) -> CGSize? {
        nsView.layout(width: proposal.width ?? 600)?.size
    }
}
#else
struct SpecimenView: UIViewRepresentable {
    let catalog: FontCatalog
    let face: PreviewFace
    let settings: PreviewSettings

    func makeUIView(context: Context) -> NativeSpecimenView {
        let view = NativeSpecimenView(frame: .zero)
        view.backgroundColor = .clear
        view.isOpaque = false
        return view
    }
    func updateUIView(_ view: NativeSpecimenView, context: Context) {
        view.catalog = catalog
        view.face = face
        view.settings = settings
        view.setNeedsDisplay()
    }
    func sizeThatFits(_ proposal: ProposedViewSize, uiView: NativeSpecimenView, context: Context) -> CGSize? {
        uiView.layout(width: proposal.width ?? 350)?.size
    }
}
#endif
