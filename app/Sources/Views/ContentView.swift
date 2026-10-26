import SwiftUI

struct ContentView: View {
    let catalog: FontCatalog
    @State private var settings = PreviewSettings()
    @State private var document: PNGDocument?
    @State private var exporting = false
    @State private var exportError: String?
    @State private var showingControls = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("Typeface", selection: $settings.typeface) {
                    ForEach(PreviewTypeface.allCases) { typeface in
                        Text(typeface.rawValue).tag(typeface)
                    }
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("typeface")
                #if os(macOS)
                .frame(maxWidth: 320)
                #else
                .frame(maxWidth: .infinity)
                #endif
                .padding(18)
                .frame(maxWidth: .infinity, alignment: .leading)
                Divider()
                GeometryReader { geometry in
                    if geometry.size.width >= 800 {
                        HStack(spacing: 0) {
                            ScrollView { ControlsView(settings: $settings) }.frame(width: 310)
                            Divider()
                            ScrollView { specimens.padding(24) }
                        }
                    } else {
                        ScrollView {
                            VStack(spacing: 0) {
                                DisclosureGroup(isExpanded: $showingControls) {
                                    ControlsView(settings: $settings)
                                } label: {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text("Text and rendering").font(.headline)
                                        Text("\(settings.hint.rawValue) · \(Int(settings.pointSize)) pt")
                                            .font(.caption).foregroundStyle(.secondary)
                                    }
                                }
                                .padding(22)
                                specimens.padding(.horizontal, 16).padding(.bottom, 24)
                            }
                        }
                        .scrollDismissesKeyboard(.interactively)
                    }
                }
            }
            .navigationTitle("Hanori Preview")
            .toolbar {
                Button("Export PNG", systemImage: "square.and.arrow.up", action: export)
                    .accessibilityIdentifier("export-png")
                    .keyboardShortcut("e", modifiers: [.command, .shift])
            }
        }
        #if os(macOS)
        .frame(minWidth: 680, minHeight: 560)
        #endif
        .fileExporter(isPresented: $exporting, document: document, contentType: .png, defaultFilename: "Hanori-preview") { result in
            if case .failure(let error) = result { exportError = error.localizedDescription }
        }
        .alert("Export failed", isPresented: Binding(
            get: { exportError != nil }, set: { if !$0 { exportError = nil } }
        )) {
            Button("OK") { exportError = nil }
        } message: { Text(exportError ?? "") }
    }

    private var specimens: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("One text, two reading modes").font(.title2.weight(.semibold))
            ForEach(settings.typeface.faces) { face in
                SpecimenCard(catalog: catalog, face: face, settings: settings)
            }
            Text("Readings come from a Japanese dictionary and may be wrong. Kana hints apply to whole paragraphs: mixed Chinese and kana within one paragraph can be misclassified.")
                .font(.caption).foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

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
