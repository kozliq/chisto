import SwiftUI

struct ContentView: View {
    @StateObject private var protection = Protection()
    @Environment(\.scenePhase) private var phase

    private let bg = Color(red: 0x0A / 255, green: 0x10 / 255, blue: 0x24 / 255)
    private let text = Color(red: 0xEE / 255, green: 0xF2 / 255, blue: 0xFB / 255)
    private let muted = Color(red: 0xB5 / 255, green: 0xBF / 255, blue: 0xD8 / 255)
    private let ok = Color(red: 0x8F / 255, green: 0xE3 / 255, blue: 0xA8 / 255)
    private let warn = Color(red: 0xF2 / 255, green: 0xB3 / 255, blue: 0x6B / 255)
    private let line = Color(red: 0x24 / 255, green: 0x32 / 255, blue: 0x5C / 255)
    private let blue = Color(red: 0x3F / 255, green: 0x6E / 255, blue: 0xF0 / 255)
    private let gold = Color(red: 0xE2 / 255, green: 0xB6 / 255, blue: 0x4F / 255)

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text(ServerConfig.brand)
                    .font(.system(size: 52, weight: .bold, design: .serif))
                    .padding(.bottom, 4)
                Text("Война с рекламой вечна. Свет сильнее.")
                    .font(.system(size: 17, weight: .semibold, design: .serif))
                    .foregroundStyle(gold)
                    .padding(.bottom, 14)
                Text(statusTitle)
                    .font(.system(size: 21, weight: .semibold))
                    .foregroundStyle(protection.state == .active ? ok : warn)
                Text("Сервер: \(ServerConfig.dohHost)")
                    .font(.system(size: 15)).foregroundStyle(muted).padding(.top, 4)

                // Официальные YouTube и аналоги — прямо на экране, а не в сноске.
                Text("YouTube, TikTok и Instagram этим приложением не чинятся: их реклама идёт с тех же серверов, что и видео.")
                    .font(.system(size: 16)).foregroundStyle(warn).padding(.top, 18)

                actionButton.padding(.top, 26)

                if protection.state == .waitingForUser {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Последний шаг — его iOS делает только руками:")
                            .font(.system(size: 17, weight: .semibold))
                        Text("Настройки → Основные → VPN и управление устройством → DNS → \(ServerConfig.brand)")
                            .font(.system(size: 16)).foregroundStyle(muted)
                        linkButton("Открыть Настройки") {
                            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                        }
                    }
                    .padding(.top, 18)
                }

                if let e = protection.errorText {
                    Text(e).font(.system(size: 15)).foregroundStyle(warn).padding(.top, 12)
                }

                Rectangle().fill(line).frame(height: 1).padding(.vertical, 28)

                Text("Блокировщик для Safari")
                    .font(.system(size: 19, weight: .semibold))
                Text(safariText)
                    .font(.system(size: 16)).foregroundStyle(muted).padding(.top, 6)

                Rectangle().fill(line).frame(height: 1).padding(.vertical, 28)

                Text("Что уходит на сервер: только DNS-запрос (имя сайта), чтобы на него ответить. Журнал запросов выключен, страницы и трафик через сервер не идут. Приложение ничего не собирает.")
                    .font(.system(size: 15)).foregroundStyle(muted)
            }
            .foregroundStyle(text)
            .padding(.horizontal, 22)
            .padding(.vertical, 40)
            .frame(maxWidth: 560, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(bg.ignoresSafeArea())
        .preferredColorScheme(.dark)
        .task { await protection.refresh() }
        .onChange(of: phase) { _, p in if p == .active { Task { await protection.refresh() } } }
    }

    private var statusTitle: String {
        switch protection.state {
        case .unknown: "Проверяю…"
        case .notInstalled: "Защита выключена"
        case .waitingForUser: "Почти готово"
        case .active: "Защита включена"
        }
    }

    private var safariText: String {
        switch protection.safariEnabled {
        case .some(true): "Включён. Правила обновляются вместе с приложением."
        default: "Включите: Настройки → Приложения → Safari → Расширения → «\(ServerConfig.brand) для Safari»."
        }
    }

    @ViewBuilder private var actionButton: some View {
        if protection.state == .active || protection.state == .waitingForUser {
            linkButton("Выключить защиту", mark: "xmark") { Task { await protection.disable() } }
        } else {
            linkButton("Включить защиту", mark: "checkmark") { Task { await protection.enable() } }
        }
    }

    // Кнопка — круглая метка с иконкой и подчёркнутый текст, без рамок и плашек.
    private func linkButton(_ title: String, mark: String? = nil, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                if let mark {
                    Image(systemName: mark)
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .background(Circle().fill(blue))
                }
                Text(title).underline(color: blue).font(.system(size: mark == nil ? 17 : 21, weight: .semibold, design: .serif))
            }
            .foregroundStyle(text)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
    }
}

#Preview { ContentView() }
