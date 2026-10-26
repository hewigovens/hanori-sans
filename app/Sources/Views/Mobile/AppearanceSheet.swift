#if os(iOS)
import SwiftUI

struct AppearanceSheet: View {
    @Binding var settings: PreviewSettings
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Text language", selection: $settings.hint) {
                        ForEach(LanguageHint.allCases) { hint in
                            Text(hint.rawValue).tag(hint)
                        }
                    }
                    .pickerStyle(.menu)
                    .accessibilityIdentifier("language-hint")
                } header: {
                    Text("Readings")
                } footer: {
                    Text(settings.hint.explanation)
                }

                Section("Typography") {
                    FontSizeControl(size: $settings.pointSize)
                    LineSpacingControl(spacing: $settings.lineHeight)
                    Toggle("Baseline guides", isOn: $settings.showBaselines)
                }

                Section {
                    Button("Reset appearance") {
                        let defaults = PreviewSettings()
                        settings.hint = defaults.hint
                        settings.pointSize = defaults.pointSize
                        settings.lineHeight = defaults.lineHeight
                        settings.showBaselines = defaults.showBaselines
                    }
                }
            }
            .navigationTitle("Appearance")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .accessibilityIdentifier("appearance-done")
                }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }
}
#endif
