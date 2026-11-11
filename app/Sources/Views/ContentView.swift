import SwiftUI

struct ContentView: View {
    let catalog: FontCatalog
    @State private var settings = PreviewSettings()
    @State private var document: PNGDocument?
    @State private var exporting = false
    @State private var exportError: String?
    @State private var showingSafariSetup = false
    @State private var openingFontBook = false
    @State private var fontInstallationError: String?

    var body: some View {
        NavigationStack {
            Group {
                #if os(iOS)
                MobilePreviewView(catalog: catalog, settings: $settings)
                    .navigationTitle("Hanori")
                    .navigationBarTitleDisplayMode(.inline)
                #else
                desktopPreview
                    .navigationTitle("Hanori Preview")
                #endif
            }
            .toolbar {
                #if os(macOS)
                Button("Install Fonts…", systemImage: "square.and.arrow.down") {
                    openingFontBook = true
                    Task { @MainActor in
                        defer { openingFontBook = false }
                        do { try await catalog.openInFontBook() }
                        catch { fontInstallationError = error.localizedDescription }
                    }
                }
                .disabled(openingFontBook)
                .help("Open all four bundled fonts in Font Book to install them for use in other apps.")
                .accessibilityIdentifier("install-fonts")
                #endif
                Button("Safari Extension", systemImage: "safari") { showingSafariSetup = true }
                    .accessibilityIdentifier("safari-extension")
                Button("Export PNG", systemImage: "square.and.arrow.up", action: export)
                    .accessibilityIdentifier("export-png")
                    .keyboardShortcut("e", modifiers: [.command, .shift])
            }
        }
        #if os(macOS)
        .frame(minWidth: 680, minHeight: 560)
        #endif
        .sheet(isPresented: $showingSafariSetup) { SafariSetupView() }
        .alert("Could not open Font Book", isPresented: Binding(
            get: { fontInstallationError != nil }, set: { if !$0 { fontInstallationError = nil } }
        )) {
            Button("OK") { fontInstallationError = nil }
        } message: { Text(fontInstallationError ?? "") }
        .fileExporter(isPresented: $exporting, document: document, contentType: .png, defaultFilename: "Hanori-preview") { result in
            if case .failure(let error) = result { exportError = error.localizedDescription }
        }
        .alert("Export failed", isPresented: Binding(
            get: { exportError != nil }, set: { if !$0 { exportError = nil } }
        )) {
            Button("OK") { exportError = nil }
        } message: { Text(exportError ?? "") }
    }

    #if os(macOS)
    private var desktopPreview: some View {
        VStack(spacing: 0) {
            Picker("Typeface", selection: $settings.typeface) {
                ForEach(PreviewTypeface.allCases) { typeface in
                    Text(typeface.rawValue).tag(typeface)
                }
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("typeface")
            .frame(maxWidth: 320)
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            Divider()
            HStack(spacing: 0) {
                ScrollView { ControlsView(settings: $settings) }.frame(width: 310)
                Divider()
                ScrollView {
                    SpecimenList(catalog: catalog, settings: settings).padding(24)
                }
            }
        }
    }
    #endif

    private func export() {
        do {
            document = PNGDocument(data: try SpecimenExporter.png(catalog: catalog, settings: settings))
            exporting = true
        } catch { exportError = error.localizedDescription }
    }
}

#Preview {
    if let fonts = try? FontCatalog() { ContentView(catalog: fonts) }
}
