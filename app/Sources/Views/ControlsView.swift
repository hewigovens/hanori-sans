import SwiftUI

struct ControlsView: View {
    @Binding var settings: PreviewSettings

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            HStack {
                Text("Your text").font(.headline)
                Spacer()
                SampleMenu { settings.text = $0.text }.labelStyle(.titleOnly)
            }
            TextEditor(text: $settings.text)
                .font(.system(size: 16))
                .frame(minHeight: 155, maxHeight: 200)
                .padding(8)
                .scrollContentBackground(.hidden)
                .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 10))
                .accessibilityLabel("Preview text")
                .accessibilityIdentifier("preview-text")

            VStack(alignment: .leading, spacing: 10) {
                Picker("Text language", selection: $settings.hint) {
                    ForEach(LanguageHint.allCases) { hint in Text(hint.rawValue).tag(hint) }
                }
                .accessibilityIdentifier("language-hint")
                Text(settings.hint.explanation)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            FontSizeControl(size: $settings.pointSize)
            LineSpacingControl(spacing: $settings.lineHeight)
            Toggle("Baseline guides", isOn: $settings.showBaselines)
            Label("Fonts are bundled. No installation needed.", systemImage: "checkmark.seal")
                .font(.caption).foregroundStyle(.secondary)
        }
        .padding(22)
    }
}
