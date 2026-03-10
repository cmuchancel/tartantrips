import SwiftUI

enum TTTheme {
    static let accent = Color(red: 0.06, green: 0.45, blue: 0.64)
    static let accentDeep = Color(red: 0.03, green: 0.27, blue: 0.44)
    static let accentSoft = Color(red: 0.79, green: 0.90, blue: 0.96)
    static let highlight = Color(red: 0.94, green: 0.67, blue: 0.30)
    static let ink = Color(red: 0.12, green: 0.18, blue: 0.24)
    static let mutedText = Color(red: 0.38, green: 0.45, blue: 0.53)
    static let success = Color(red: 0.18, green: 0.54, blue: 0.34)
    static let warning = Color(red: 0.78, green: 0.46, blue: 0.14)
    static let danger = Color(red: 0.78, green: 0.25, blue: 0.23)

    static let screenBackground = LinearGradient(
        colors: [
            Color(red: 0.98, green: 0.99, blue: 1.0),
            Color(red: 0.92, green: 0.96, blue: 1.0),
            Color(red: 0.97, green: 0.95, blue: 0.91)
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static let heroGradient = LinearGradient(
        colors: [
            accentDeep,
            accent,
            Color(red: 0.14, green: 0.63, blue: 0.77)
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static let cardFill = Color.white.opacity(0.76)
    static let fieldFill = Color.white.opacity(0.88)
    static let border = Color.white.opacity(0.9)
    static let softBorder = accent.opacity(0.12)
    static let shadow = Color.black.opacity(0.09)
}

enum TTTone {
    case accent
    case success
    case warning
    case danger
    case neutral
}

extension View {
    func ttScreenBackground() -> some View {
        background(
            ZStack {
                TTTheme.screenBackground
                Circle()
                    .fill(TTTheme.accentSoft.opacity(0.85))
                    .frame(width: 280, height: 280)
                    .blur(radius: 18)
                    .offset(x: 130, y: -250)

                Circle()
                    .fill(Color.white.opacity(0.75))
                    .frame(width: 220, height: 220)
                    .blur(radius: 10)
                    .offset(x: -120, y: -170)

                Circle()
                    .fill(TTTheme.highlight.opacity(0.18))
                    .frame(width: 220, height: 220)
                    .blur(radius: 18)
                    .offset(x: -140, y: 320)
            }
            .ignoresSafeArea()
        )
    }

    func ttCardStyle(padding: CGFloat = 18) -> some View {
        self
            .padding(padding)
            .background(
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .fill(TTTheme.cardFill)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .stroke(TTTheme.border, lineWidth: 1)
            )
            .shadow(color: TTTheme.shadow, radius: 18, x: 0, y: 12)
    }

    func ttFieldStyle() -> some View {
        self
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(TTTheme.fieldFill)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(TTTheme.softBorder, lineWidth: 1)
            )
    }
}

struct TTHeroHeader: View {
    let eyebrow: String
    let title: String
    let subtitle: String
    let symbol: String

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            ZStack {
                Circle()
                    .fill(Color.white.opacity(0.18))
                    .frame(width: 64, height: 64)

                Image(systemName: symbol)
                    .font(.system(size: 26, weight: .semibold))
                    .foregroundStyle(.white)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text(eyebrow.uppercased())
                    .font(.caption.weight(.bold))
                    .tracking(2)
                    .foregroundStyle(.white.opacity(0.75))

                Text(title)
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)

                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.88))
            }

            Spacer(minLength: 0)
        }
        .padding(22)
        .background(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .fill(TTTheme.heroGradient)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .stroke(Color.white.opacity(0.18), lineWidth: 1)
        )
        .shadow(color: TTTheme.accentDeep.opacity(0.22), radius: 20, x: 0, y: 14)
    }
}

struct TTSectionCard<Content: View>: View {
    let title: String
    let subtitle: String?
    let content: Content

    init(title: String, subtitle: String? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.subtitle = subtitle
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(TTTheme.ink)

                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundStyle(TTTheme.mutedText)
                }
            }

            content
        }
        .ttCardStyle()
    }
}

struct TTPill: View {
    let label: String
    let tone: TTTone
    var symbol: String? = nil

    var body: some View {
        HStack(spacing: 6) {
            if let symbol {
                Image(systemName: symbol)
                    .font(.caption.weight(.semibold))
            }

            Text(label)
                .font(.caption.weight(.semibold))
                .lineLimit(1)
        }
        .foregroundStyle(foregroundColor)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            Capsule(style: .continuous)
                .fill(backgroundColor)
        )
    }

    private var backgroundColor: Color {
        switch tone {
        case .accent: return TTTheme.accent.opacity(0.15)
        case .success: return TTTheme.success.opacity(0.14)
        case .warning: return TTTheme.warning.opacity(0.16)
        case .danger: return TTTheme.danger.opacity(0.15)
        case .neutral: return Color.black.opacity(0.06)
        }
    }

    private var foregroundColor: Color {
        switch tone {
        case .accent: return TTTheme.accentDeep
        case .success: return TTTheme.success
        case .warning: return TTTheme.warning
        case .danger: return TTTheme.danger
        case .neutral: return TTTheme.mutedText
        }
    }
}

struct TTMessageBanner: View {
    let message: String
    let tone: TTTone

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.subheadline.weight(.bold))

            Text(message)
                .font(.footnote.weight(.medium))
                .fixedSize(horizontal: false, vertical: true)

            Spacer(minLength: 0)
        }
        .foregroundStyle(foregroundColor)
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(backgroundColor)
        )
    }

    private var symbol: String {
        switch tone {
        case .accent: return "info.circle.fill"
        case .success: return "checkmark.circle.fill"
        case .warning: return "exclamationmark.triangle.fill"
        case .danger: return "xmark.octagon.fill"
        case .neutral: return "circle.fill"
        }
    }

    private var backgroundColor: Color {
        switch tone {
        case .accent: return TTTheme.accent.opacity(0.12)
        case .success: return TTTheme.success.opacity(0.12)
        case .warning: return TTTheme.warning.opacity(0.12)
        case .danger: return TTTheme.danger.opacity(0.12)
        case .neutral: return Color.black.opacity(0.05)
        }
    }

    private var foregroundColor: Color {
        switch tone {
        case .accent: return TTTheme.accentDeep
        case .success: return TTTheme.success
        case .warning: return TTTheme.warning
        case .danger: return TTTheme.danger
        case .neutral: return TTTheme.ink
        }
    }
}

struct TTInfoRow: View {
    let label: String
    let value: String
    var symbol: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(TTTheme.accent)
                .frame(width: 20)

            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.caption)
                    .foregroundStyle(TTTheme.mutedText)
                Text(value)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(TTTheme.ink)
            }

            Spacer(minLength: 0)
        }
    }
}

struct TTEmptyStateCard: View {
    let symbol: String
    let title: String
    let message: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.system(size: 28, weight: .semibold))
                .foregroundStyle(TTTheme.accent)

            Text(title)
                .font(.headline)
                .foregroundStyle(TTTheme.ink)

            Text(message)
                .font(.subheadline)
                .foregroundStyle(TTTheme.mutedText)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .ttCardStyle()
    }
}

struct TTPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(.white)
            .padding(.horizontal, 18)
            .padding(.vertical, 16)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(TTTheme.heroGradient)
            )
            .scaleEffect(configuration.isPressed ? 0.985 : 1.0)
            .opacity(configuration.isPressed ? 0.94 : 1.0)
            .shadow(color: TTTheme.accent.opacity(0.28), radius: 12, x: 0, y: 8)
    }
}

struct TTSecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(TTTheme.ink)
            .padding(.horizontal, 18)
            .padding(.vertical, 16)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(Color.white.opacity(configuration.isPressed ? 0.68 : 0.84))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(TTTheme.softBorder, lineWidth: 1)
            )
            .scaleEffect(configuration.isPressed ? 0.985 : 1.0)
    }
}

struct TTDestructiveButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(TTTheme.danger)
            .padding(.horizontal, 18)
            .padding(.vertical, 16)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(TTTheme.danger.opacity(configuration.isPressed ? 0.12 : 0.08))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(TTTheme.danger.opacity(0.15), lineWidth: 1)
            )
            .scaleEffect(configuration.isPressed ? 0.985 : 1.0)
    }
}

struct TTLoadingOverlay: View {
    let label: String

    var body: some View {
        VStack(spacing: 12) {
            ProgressView()
                .tint(TTTheme.accent)
            Text(label)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(TTTheme.ink)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: TTTheme.shadow, radius: 14, x: 0, y: 10)
    }
}

struct RootView: View {
    @Environment(AppState.self) private var appState
    @State private var selectedTab: AppTab = .home
    @State private var prefillDirection: TripDirection?

    var body: some View {
        Group {
            if appState.isAuthenticated {
                TabView(selection: $selectedTab) {
                    HomeView(selectedTab: $selectedTab, prefillDirection: $prefillDirection)
                        .tabItem { Label("Home", systemImage: "house.fill") }
                        .tag(AppTab.home)

                    PlanTripView(prefillDirection: $prefillDirection)
                        .tabItem { Label("Plan", systemImage: "calendar.badge.plus") }
                        .tag(AppTab.plan)

                    TripsView()
                        .tabItem { Label("Trips", systemImage: "car.fill") }
                        .tag(AppTab.trips)

                    PITUnmatchedView()
                        .tabItem { Label("Landed", systemImage: "airplane.arrival") }
                        .tag(AppTab.pit)

                    ProfileView()
                        .tabItem { Label("Profile", systemImage: "person.crop.circle.fill") }
                        .tag(AppTab.profile)
                }
                .tint(TTTheme.accent)
                .toolbarBackground(.visible, for: .tabBar)
                .toolbarBackground(.ultraThinMaterial, for: .tabBar)
            } else {
                LoginView()
            }
        }
        .task {
            if !appState.isAuthenticated {
                await appState.bootstrap()
            }
        }
        .onOpenURL { url in
            Task {
                await appState.handleIncomingURL(url)
            }
        }
    }
}
