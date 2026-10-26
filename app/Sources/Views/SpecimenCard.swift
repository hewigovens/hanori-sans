import SwiftUI

struct SpecimenCard: View {
    let catalog: FontCatalog
    let face: PreviewFace
    let settings: PreviewSettings

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 5) {
                Text(face.rawValue).font(.title3.weight(.semibold))
                    .accessibilityIdentifier("title-\(face.fileName)")
                Text(face.subtitle).font(.callout).foregroundStyle(.secondary)
            }
            .padding(.horizontal, 24).padding(.top, 22)
            SpecimenView(catalog: catalog, face: face, settings: settings)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(face.rawValue). \(settings.text)")
                .accessibilityIdentifier("\(face.fileName)-specimen")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.background, in: RoundedRectangle(cornerRadius: 16))
        .overlay {
            RoundedRectangle(cornerRadius: 16).strokeBorder(.secondary.opacity(0.2), lineWidth: 1)
        }
    }
}
