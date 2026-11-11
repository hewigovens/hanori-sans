import SwiftUI
import SafariServices

struct SafariSetupView: View {
    @Environment(\.dismiss) private var dismiss
    #if os(macOS)
    @State private var status = "Enable Hanori Reading in Safari to get started."
    #endif

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Label("Hanori Reading", systemImage: "character.book.closed.fill")
                .font(.largeTitle.bold())
            Text("Japanese reading help in Safari")
                .font(.title3)
            Text("Choose Accurate mode for local sentence analysis and saved reading corrections, or Font mode to use bundled Hanori fonts.")
            Text("Everything runs on your device. Readings can still be wrong; corrections apply only to the context and document or site you choose.")
                .foregroundStyle(.secondary)
            Divider()
            #if os(macOS)
            Text(status)
            Button("Open Safari Extension Settings") {
                SFSafariApplication.showPreferencesForExtension(withIdentifier: "me.hanori.preview.safari") { error in
                    Task { @MainActor in
                        if let error { status = error.localizedDescription }
                    }
                }
            }
            .buttonStyle(.borderedProminent)
            #else
            Text("Open Settings → Apps → Safari → Extensions (or Settings → Safari on iOS 17), then enable Hanori Reading.")
            #endif
            Text("In Safari, open a Japanese webpage, choose Hanori from the extensions menu, grant access to that site, and enable readings.")
                .font(.callout)
            Button("Done") { dismiss() }
                .accessibilityIdentifier("safari-setup-done")
        }
        .padding(28)
        #if os(macOS)
        .frame(width: 460)
        #endif
    }
}
