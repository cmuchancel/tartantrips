import SwiftUI

struct LoginView: View {
    @Environment(AppState.self) private var appState
    @State private var email = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    TTHeroHeader(
                        eyebrow: "CMU Rideshare",
                        title: "TartanTrips",
                        subtitle: "Airport matching built for quick planning, flexible windows, and reliable handoff from your email back into the app.",
                        symbol: "airplane.departure"
                    )

                    TTSectionCard(
                        title: "Sign in",
                        subtitle: "Use your CMU email and we will send a magic link to confirm the session."
                    ) {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Email")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(TTTheme.mutedText)

                            TextField("andrew@andrew.cmu.edu", text: $email)
                                .textInputAutocapitalization(.never)
                                .keyboardType(.emailAddress)
                                .autocorrectionDisabled(true)
                                .ttFieldStyle()

                            Button("Send Magic Link") {
                                Task { await appState.sendMagicLink(email: email) }
                            }
                            .buttonStyle(TTPrimaryButtonStyle())
                            .disabled(appState.isWorking || trimmedEmail.isEmpty)

                            Button("I already tapped the link") {
                                Task { await appState.bootstrap() }
                            }
                            .buttonStyle(TTSecondaryButtonStyle())
                            .disabled(appState.isWorking)
                        }
                    }

                    HStack(spacing: 12) {
                        TTPill(label: "Magic link", tone: .accent, symbol: "sparkles")
                        TTPill(label: "PIT-only trips", tone: .neutral, symbol: "airplane")
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    if !appState.errorMessage.isEmpty {
                        TTMessageBanner(message: appState.errorMessage, tone: .danger)
                    }

                    if !appState.infoMessage.isEmpty {
                        TTMessageBanner(message: appState.infoMessage, tone: .success)
                    }

                    TTSectionCard(
                        title: "What happens next",
                        subtitle: "The email opens a confirmation page first, then routes you back into the iPhone app."
                    ) {
                        VStack(spacing: 12) {
                            TTInfoRow(label: "Step 1", value: "Open the email on your phone.", symbol: "envelope.open")
                            TTInfoRow(label: "Step 2", value: "Confirm on the web handoff page.", symbol: "checkmark.seal")
                            TTInfoRow(label: "Step 3", value: "Return to TartanTrips automatically.", symbol: "iphone")
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 28)
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .navigationBarTitleDisplayMode(.inline)
            .ttScreenBackground()
            .tint(TTTheme.accent)
            .overlay {
                if appState.isWorking {
                    TTLoadingOverlay(label: "Checking your account...")
                }
            }
        }
    }

    private var trimmedEmail: String {
        email.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
