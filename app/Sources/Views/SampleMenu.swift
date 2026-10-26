import SwiftUI

struct SampleMenu: View {
    let select: (SampleText) -> Void

    var body: some View {
        Menu("Samples", systemImage: "text.badge.plus") {
            ForEach(SampleText.allCases) { sample in
                Button(sample.rawValue) { select(sample) }
            }
        }
        .accessibilityIdentifier("samples")
    }
}
