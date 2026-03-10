import SwiftUI

struct PITUnmatchedView: View {
    @Environment(AppState.self) private var appState

    @State private var waitMinutes = ""
    @State private var candidates: [MatchCandidate] = []

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    TTHeroHeader(
                        eyebrow: "At the airport",
                        title: "Find a ride from PIT right now",
                        subtitle: "Set a realistic wait window and surface riders who are already landed or about to arrive.",
                        symbol: "airplane.arrival"
                    )

                    if !appState.profile.isComplete {
                        TTMessageBanner(
                            message: "Complete your profile in the Profile tab before continuing.",
                            tone: .warning
                        )
                    }

                    TTSectionCard(title: "Wait window", subtitle: "How long can you stay at the airport before leaving?") {
                        VStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Minutes you can wait")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(TTTheme.mutedText)

                                HStack(spacing: 10) {
                                    Image(systemName: "timer")
                                        .foregroundStyle(TTTheme.accent)
                                    TextField("45", text: $waitMinutes)
                                        .keyboardType(.numberPad)
                                }
                                .ttFieldStyle()
                            }

                            Button("Find matches") {
                                Task { await submitWindow() }
                            }
                            .buttonStyle(TTPrimaryButtonStyle())
                            .disabled(!appState.profile.isComplete || appState.isWorking)
                        }
                    }

                    if !appState.errorMessage.isEmpty {
                        TTMessageBanner(message: appState.errorMessage, tone: .danger)
                    }

                    if !appState.infoMessage.isEmpty {
                        TTMessageBanner(message: appState.infoMessage, tone: .success)
                    }

                    if candidates.isEmpty {
                        TTEmptyStateCard(
                            symbol: "person.2.slash",
                            title: "No live candidates yet",
                            message: "Submit a wait window and we will show riders whose timing overlaps with yours."
                        )
                    } else {
                        TTSectionCard(title: "Candidates", subtitle: "These riders overlap with your current airport window.") {
                            VStack(spacing: 12) {
                                ForEach(candidates) { candidate in
                                    VStack(alignment: .leading, spacing: 8) {
                                        Text(candidate.profile?.name ?? candidate.trip.userEmail)
                                            .font(.headline)
                                            .foregroundStyle(TTTheme.ink)

                                        TTInfoRow(
                                            label: "Flight",
                                            value: "\(candidate.trip.flightDate) at \(candidate.trip.flightTime)",
                                            symbol: "clock"
                                        )
                                        TTInfoRow(label: "Email", value: candidate.trip.userEmail, symbol: "envelope")
                                    }
                                    .ttFieldStyle()
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 28)
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("Landed")
            .navigationBarTitleDisplayMode(.inline)
            .ttScreenBackground()
            .tint(TTTheme.accent)
            .overlay {
                if appState.isWorking {
                    TTLoadingOverlay(label: "Checking nearby matches...")
                }
            }
        }
    }

    private func submitWindow() async {
        guard let minutes = Int(waitMinutes), minutes > 0 else {
            appState.errorMessage = "Enter a valid wait time in minutes."
            return
        }

        let now = Date()
        let windowEnd = DateTimeEST.plusMinutes(now, minutes: minutes)

        let payload = TripPayload(
            userEmail: appState.email,
            direction: TripDirection.arriving.rawValue,
            flightDate: DateTimeEST.formatDate(now),
            flightTime: DateTimeEST.formatTime(now),
            allowedPartnerSex: "Any",
            tripStatus: TripStatus.unmatched.rawValue,
            landedStatus: "Landed at PIT",
            meetupStatus: "Looking for match",
            willingToWaitUntilTime: DateTimeEST.formatTime(windowEnd),
            minHoursBefore: nil,
            maxHoursBefore: nil,
            windowStart: ISO8601DateFormatter().string(from: now),
            windowEnd: ISO8601DateFormatter().string(from: windowEnd)
        )

        await appState.saveTrip(payload: payload, existingTripID: nil)
        candidates = await appState.loadPITCandidates(windowEnd: windowEnd)
    }
}
