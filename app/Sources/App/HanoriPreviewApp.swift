import SwiftUI

@main
struct HanoriPreviewApp: App {
    #if os(macOS)
    @NSApplicationDelegateAdaptor(MacAppDelegate.self) private var appDelegate
    #endif
    private let catalog = Result { try FontCatalog() }

    var body: some Scene {
        WindowGroup {
            switch catalog {
            case .success(let fonts):
                ContentView(catalog: fonts)
            case .failure(let error):
                ContentUnavailableView("Fonts could not be loaded", systemImage: "textformat",
                                       description: Text(error.localizedDescription))
            }
        }
        #if os(macOS)
        .defaultSize(width: 1080, height: 820)
        #endif
    }
}
