import Foundation

/// Отдаёт Safari список правил blockerList.json (собирается tools/build.mjs из filters/custom.txt
/// и сетевых правил EasyList/EasyPrivacy — сколько влезает в лимит).
final class ContentBlockerRequestHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        guard let url = Bundle.main.url(forResource: "blockerList", withExtension: "json"),
              let attachment = NSItemProvider(contentsOf: url) else {
            context.cancelRequest(withError: NSError(domain: "ContentBlocker", code: 1))
            return
        }
        let item = NSExtensionItem()
        item.attachments = [attachment]
        context.completeRequest(returningItems: [item], completionHandler: nil)
    }
}
