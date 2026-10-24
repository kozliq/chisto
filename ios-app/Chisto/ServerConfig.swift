// Сгенерировано scripts/gen-ios-config.sh из .env. Не править руками.
import Foundation

enum ServerConfig {
    static let brand = "Чисто"
    static let dohHost = "chisto.flownote.cc"
    static let dohPath = "/dns-query"
    static let serverIP = ""
    static var dohURL: String { "https://\(dohHost)\(dohPath)" }
}
