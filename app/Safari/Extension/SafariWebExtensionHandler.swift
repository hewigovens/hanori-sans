import Foundation

// No native bridge; all logic is in the web extension.
final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        context.completeRequest(returningItems: nil)
    }
}
