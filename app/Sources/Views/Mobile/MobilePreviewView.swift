#if os(iOS)
import SwiftUI

struct MobilePreviewView: View {
    let catalog: FontCatalog
    @Binding var settings: PreviewSettings
    @State private var sheet: Sheet?

    private enum Sheet: String, Identifiable {
        case text, appearance
        var id: Self { self }
    }

    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 14) {
                Picker("Typeface", selection: $settings.typeface) {
                    ForEach(PreviewTypeface.allCases) { typeface in
                        Text(typeface.rawValue).tag(typeface)
                    }
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("typeface")

                HStack(spacing: 12) {
                    Button { sheet = .text } label: {
                        Label("Text", systemImage: "square.and.pencil")
                            .frame(maxWidth: .infinity, minHeight: 30)
                    }
                    .accessibilityLabel("Edit text")
                    .accessibilityIdentifier("edit-text")

                    Button { sheet = .appearance } label: {
                        Label("Appearance", systemImage: "slider.horizontal.3")
                            .frame(maxWidth: .infinity, minHeight: 30)
                    }
                    .accessibilityIdentifier("appearance")
                }
                .font(.subheadline.weight(.medium))
                .buttonStyle(.bordered)

                Text("\(settings.hint.rawValue) · \(Int(settings.pointSize)) pt · \(settings.lineHeight.formatted(.number.precision(.fractionLength(1))))× spacing")
                    .font(.caption)
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityIdentifier("appearance-summary")
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 16)

            ScrollView {
                SpecimenList(catalog: catalog, settings: settings)
                    .padding(.horizontal, 16)
                    .padding(.top, 4)
                    .padding(.bottom, 24)
            }
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .sheet(item: $sheet) { destination in
            switch destination {
            case .text:
                TextEditorSheet(text: $settings.text)
            case .appearance:
                AppearanceSheet(settings: $settings)
            }
        }
    }
}
#endif
