import SwiftUI

struct ControlsView: View {
    @Binding var settings: PreviewSettings

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            HStack {
                Text("Your text").font(.headline)
                Spacer()
                Menu("Samples", systemImage: "text.insert") {
                    ForEach(SampleText.allCases) { sample in
                        Button(sample.rawValue) { settings.text = sample.text }
                    }
                }
                .labelStyle(.titleOnly)
                .accessibilityIdentifier("samples")
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
                Picker("Language hint", selection: $settings.hint) {
                    ForEach(LanguageHint.allCases) { hint in Text(hint.rawValue).tag(hint) }
                }
                .accessibilityIdentifier("language-hint")
                Text(settings.hint.explanation)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            VStack(spacing: 14) {
                VStack(alignment: .leading) {
                    HStack {
                        Text("Font size")
                        Spacer()
                        Text("\(Int(settings.pointSize)) pt").monospacedDigit().foregroundStyle(.secondary)
                    }
                    Slider(value: $settings.pointSize, in: 18...64, step: 1)
                        .accessibilityLabel("Font size")
                }
                VStack(alignment: .leading) {
                    HStack {
                        Text("Line height")
                        Spacer()
                        Text("\(settings.lineHeight.formatted(.number.precision(.fractionLength(1))))×")
                            .monospacedDigit().foregroundStyle(.secondary)
                    }
                    Slider(value: $settings.lineHeight, in: 1.2...2.6, step: 0.1)
                        .accessibilityLabel("Line height")
                }
            }
            Toggle("Show baselines", isOn: $settings.showBaselines)
            Label("Fonts are bundled. No installation needed.", systemImage: "checkmark.seal")
                .font(.caption).foregroundStyle(.secondary)
        }
        .padding(22)
    }
}
