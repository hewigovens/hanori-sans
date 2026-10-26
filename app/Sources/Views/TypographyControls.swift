import SwiftUI

struct FontSizeControl: View {
    @Binding var size: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Font size")
                Spacer()
                Text("\(Int(size)) pt").monospacedDigit().foregroundStyle(.secondary)
            }
            Slider(value: $size, in: 18...64, step: 1)
                .accessibilityLabel("Font size")
                .accessibilityIdentifier("font-size")
        }
        .padding(.vertical, 4)
    }
}

struct LineSpacingControl: View {
    @Binding var spacing: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Line spacing")
                Spacer()
                Text("\(spacing.formatted(.number.precision(.fractionLength(1))))×")
                    .monospacedDigit().foregroundStyle(.secondary)
            }
            Slider(value: $spacing, in: 1.2...2.6, step: 0.1)
                .accessibilityLabel("Line spacing")
                .accessibilityIdentifier("line-spacing")
        }
        .padding(.vertical, 4)
    }
}
