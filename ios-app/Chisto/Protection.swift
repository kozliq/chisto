import Foundation
import NetworkExtension
import SafariServices

/// DNS Settings через NEDNSSettingsManager: приложение только сохраняет настройку DoH.
/// Включает её пользователь сам в Настройках — iOS не даёт приложению сделать это без него.
@MainActor
final class Protection: ObservableObject {
    enum State { case unknown, notInstalled, waitingForUser, active }

    @Published private(set) var state: State = .unknown
    @Published private(set) var safariEnabled: Bool?
    @Published var errorText: String?

    private let manager = NEDNSSettingsManager.shared()
    static let blockerID = (Bundle.main.bundleIdentifier ?? "com.example.chisto") + ".ContentBlocker"

    init() {
        NotificationCenter.default.addObserver(
            forName: .NEDNSSettingsConfigurationDidChange, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in await self?.refresh() }
        }
    }

    func refresh() async {
        do {
            try await manager.loadFromPreferences()
            if manager.dnsSettings == nil {
                state = .notInstalled
            } else {
                state = manager.isEnabled ? .active : .waitingForUser
            }
        } catch {
            errorText = error.localizedDescription
        }
        safariEnabled = try? await SFContentBlockerManager.stateOfContentBlocker(withIdentifier: Self.blockerID).isEnabled
    }

    func enable() async {
        errorText = nil
        do {
            try await manager.loadFromPreferences()
            let settings = NEDNSOverHTTPSSettings(servers: ServerConfig.serverIP.isEmpty ? [] : [ServerConfig.serverIP])
            settings.serverURL = URL(string: ServerConfig.dohURL)
            manager.dnsSettings = settings
            manager.localizedDescription = ServerConfig.brand
            try await manager.saveToPreferences()
        } catch {
            errorText = "Не получилось сохранить настройку: \(error.localizedDescription)"
        }
        await refresh()
    }

    func disable() async {
        do {
            try await manager.loadFromPreferences()
            try await manager.removeFromPreferences()
        } catch {
            errorText = error.localizedDescription
        }
        await refresh()
    }

    func reloadSafariRules() async {
        try? await SFContentBlockerManager.reloadContentBlocker(withIdentifier: Self.blockerID)
    }
}
