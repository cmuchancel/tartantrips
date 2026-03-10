import Foundation

struct AppConfig {
    let supabaseURL: URL
    let supabaseAnonKey: String
    let apiBaseURL: URL
    let allowAnyEmail: Bool
    let magicLinkRedirectURL: URL?

    static func load() -> AppConfig {
        guard
            let supabaseURLString = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_URL") as? String,
            let supabaseURL = URL(string: supabaseURLString),
            let supabaseAnonKey = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String,
            let apiBaseURLString = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String,
            let apiBaseURL = URL(string: apiBaseURLString)
        else {
            fatalError("Missing SUPABASE_URL, SUPABASE_ANON_KEY, or API_BASE_URL in Info.plist")
        }

        let allowAnyEmail = (Bundle.main.object(forInfoDictionaryKey: "ALLOW_ANY_EMAIL") as? Bool) ?? false
        let redirectURLString = Bundle.main.object(forInfoDictionaryKey: "MAGIC_LINK_REDIRECT_URL") as? String
        let magicLinkRedirectURL =
            redirectURLString.flatMap(URL.init(string:)) ??
            apiBaseURL.appending(path: "/auth/confirm")

        return AppConfig(
            supabaseURL: supabaseURL,
            supabaseAnonKey: supabaseAnonKey,
            apiBaseURL: apiBaseURL,
            allowAnyEmail: allowAnyEmail,
            magicLinkRedirectURL: magicLinkRedirectURL
        )
    }
}
