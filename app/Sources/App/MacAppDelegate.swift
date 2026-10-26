#if os(macOS)
import AppKit

final class MacAppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        // Local rebuilds can retain a generic Launch Services icon. Apply the
        // current bundle's artwork directly to the running app and Dock.
        guard let url = Bundle.main.url(forResource: "AppIcon", withExtension: "icns"),
              let icon = NSImage(contentsOf: url) else {
            NSLog("Hanori could not load its bundled macOS AppIcon.icns")
            return
        }
        NSApplication.shared.applicationIconImage = icon
    }
}
#endif
