import SwiftUI

struct HomeView: View {
    @Environment(AppState.self) private var appState
    @Binding var selectedTab: AppTab
    @Binding var prefillDirection: TripDirection?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    TTHeroHeader(
                        eyebrow: "Ready to move",
                        title: "Plan your next airport ride",
                        subtitle: "Build a trip, compare overlap windows, and keep match requests moving without bouncing between tabs.",
                        symbol: "airplane.circle.fill"
                    )

                    TTSectionCard(title: "Your account") {
                        VStack(spacing: 14) {
                            TTInfoRow(label: "Signed in as", value: appState.email, symbol: "person.fill")

                            HStack(spacing: 10) {
                                TTPill(
                                    label: appState.profile.isComplete ? "Profile complete" : "Finish profile",
                                    tone: appState.profile.isComplete ? .success : .warning,
                                    symbol: appState.profile.isComplete ? "checkmark.circle.fill" : "exclamationmark.circle.fill"
                                )

                                TTPill(
                                    label: "\(appState.trips.count) saved trips",
                                    tone: .accent,
                                    symbol: "calendar"
                                )
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }

                    actionTile(
                        title: "Departing Pittsburgh",
                        subtitle: "Set how early you can leave and match around your flight window.",
                        symbol: "airplane.departure",
                        tone: .accent
                    ) {
                        prefillDirection = .departing
                        selectedTab = .plan
                    }

                    actionTile(
                        title: "Arriving to Pittsburgh",
                        subtitle: "Share when you land and how long you can wait for a ride.",
                        symbol: "airplane.arrival",
                        tone: .neutral
                    ) {
                        prefillDirection = .arriving
                        selectedTab = .plan
                    }

                    TTSectionCard(
                        title: "Need something immediate?",
                        subtitle: "Use the landed flow when you are already at PIT and want to surface nearby candidates fast."
                    ) {
                        VStack(alignment: .leading, spacing: 14) {
                            Text("This works best when your landing time is current and you have a realistic wait window.")
                                .font(.subheadline)
                                .foregroundStyle(TTTheme.mutedText)

                            Button("Open Landed at PIT") {
                                selectedTab = .pit
                            }
                            .buttonStyle(TTSecondaryButtonStyle())
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 28)
            }
            .scrollIndicators(.hidden)
            .navigationTitle("Home")
            .navigationBarTitleDisplayMode(.inline)
            .ttScreenBackground()
            .tint(TTTheme.accent)
        }
    }

    private func actionTile(
        title: String,
        subtitle: String,
        symbol: String,
        tone: TTTone,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(iconBackground(for: tone))
                        .frame(width: 58, height: 58)

                    Image(systemName: symbol)
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(iconForeground(for: tone))
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text(title)
                        .font(.headline)
                        .foregroundStyle(TTTheme.ink)

                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundStyle(TTTheme.mutedText)
                        .multilineTextAlignment(.leading)
                }

                Spacer(minLength: 0)

                Image(systemName: "arrow.up.right")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(TTTheme.accentDeep)
            }
            .ttCardStyle()
        }
        .buttonStyle(.plain)
    }

    private func iconBackground(for tone: TTTone) -> Color {
        switch tone {
        case .accent: return TTTheme.accent.opacity(0.14)
        case .success: return TTTheme.success.opacity(0.14)
        case .warning: return TTTheme.warning.opacity(0.14)
        case .danger: return TTTheme.danger.opacity(0.14)
        case .neutral: return TTTheme.highlight.opacity(0.16)
        }
    }

    private func iconForeground(for tone: TTTone) -> Color {
        switch tone {
        case .accent: return TTTheme.accentDeep
        case .success: return TTTheme.success
        case .warning: return TTTheme.warning
        case .danger: return TTTheme.danger
        case .neutral: return TTTheme.highlight
        }
    }
}
