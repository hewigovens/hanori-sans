#if os(iOS)
import SwiftUI

struct TextEditorSheet: View {
    @Binding var text: String
    @Environment(\.dismiss) private var dismiss
    @FocusState private var editing: Bool

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                TextEditor(text: $text)
                    .font(.body)
                    .focused($editing)
                    .autocorrectionDisabled()
                    .scrollContentBackground(.hidden)
                    .scrollDismissesKeyboard(.interactively)
                    .padding(12)
                    .background(.background, in: RoundedRectangle(cornerRadius: 16))
                    .accessibilityLabel("Preview text")
                    .accessibilityIdentifier("preview-text")

                Text("Changes appear in both previews.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .padding(20)
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("Edit text")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    SampleMenu { sample in
                        text = sample.text
                        editing = false
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .accessibilityIdentifier("text-done")
                }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .task { editing = true }
    }
}
#endif
