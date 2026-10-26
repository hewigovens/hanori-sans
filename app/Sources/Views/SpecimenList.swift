import SwiftUI

struct SpecimenList: View {
    let catalog: FontCatalog
    let settings: PreviewSettings

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if settings.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                ContentUnavailableView("Add some text", systemImage: "text.cursor",
                                       description: Text("Type or choose a sample to preview both reading modes."))
            } else {
                ForEach(settings.typeface.faces) { face in
                    SpecimenCard(catalog: catalog, face: face, settings: settings)
                }
                Text("Dictionary readings may be imperfect.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 4)
            }
        }
    }
}
