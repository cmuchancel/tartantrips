import SwiftUI

struct TripsView: View {
    @Environment(AppState.self) private var appState
    @State private var matchesByTrip: [UUID: [MatchCandidate]] = [:]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    TTHeroHeader(
                        eyebrow: "Trips",
                        title: "Manage active rides and match requests",
                        subtitle: "Update your trip state, review candidate overlap, and handle approvals without losing context.",
                        symbol: "car.fill"
                    )

                    if !appState.errorMessage.isEmpty {
                        TTMessageBanner(message: appState.errorMessage, tone: .danger)
                    }

                    if appState.trips.isEmpty {
                        TTEmptyStateCard(
                            symbol: "calendar.badge.exclamationmark",
                            title: "No trips yet",
                            message: "Save a trip from the Plan tab and it will show up here with match candidates."
                        )
                    } else {
                        LazyVStack(spacing: 16) {
                            ForEach(appState.trips) { trip in
                                TripCard(trip: trip, candidates: matchesByTrip[trip.id] ?? [])
                            }
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 28)
            }
            .scrollIndicators(.hidden)
            .navigationTitle("Trips")
            .navigationBarTitleDisplayMode(.inline)
            .ttScreenBackground()
            .tint(TTTheme.accent)
            .refreshable {
                await reload()
            }
            .task {
                await reload()
            }
            .onChange(of: appState.trips.map(\.id), initial: false) {
                Task {
                    await reload()
                }
            }
            .overlay {
                if appState.isWorking {
                    TTLoadingOverlay(label: "Refreshing trips...")
                }
            }
        }
    }

    private func reload() async {
        await appState.refreshTrips()
        var mapped: [UUID: [MatchCandidate]] = [:]

        for trip in appState.trips {
            mapped[trip.id] = await appState.loadCandidates(for: trip)
        }

        matchesByTrip = mapped
    }
}

private struct TripCard: View {
    @Environment(AppState.self) private var appState

    let trip: Trip
    let candidates: [MatchCandidate]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(trip.direction.rawValue)
                        .font(.title3.weight(.bold))
                        .foregroundStyle(TTTheme.ink)

                    Text("\(trip.flightDate) at \(trip.flightTime)")
                        .font(.subheadline)
                        .foregroundStyle(TTTheme.mutedText)
                }

                Spacer(minLength: 0)

                TTPill(label: statusLabel, tone: statusTone, symbol: statusSymbol)
            }

            VStack(spacing: 12) {
                TTInfoRow(label: "Partner filter", value: trip.allowedPartnerSex, symbol: "person.2")

                if trip.direction == .arriving, let wait = trip.willingToWaitUntilTime {
                    TTInfoRow(label: "Wait until", value: wait, symbol: "timer")
                }

                if trip.direction == .departing, let min = trip.minHoursBefore, let max = trip.maxHoursBefore {
                    TTInfoRow(label: "Departure window", value: "\(min)-\(max) hours before flight", symbol: "clock.arrow.2.circlepath")
                }

                if !trip.confirmedEmails.isEmpty {
                    TTInfoRow(
                        label: "Confirmed matches",
                        value: trip.confirmedEmails.joined(separator: ", "),
                        symbol: "checkmark.seal"
                    )
                }
            }

            statusMenu

            if candidates.isEmpty {
                TTMessageBanner(message: "No compatible candidates yet for this trip.", tone: .neutral)
            } else {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Candidate matches")
                        .font(.headline)
                        .foregroundStyle(TTTheme.ink)

                    ForEach(candidates) { candidate in
                        MatchRow(trip: trip, candidate: candidate)
                    }
                }
            }

            Button("Delete Trip") {
                Task { await appState.deleteTrip(trip.id) }
            }
            .buttonStyle(TTDestructiveButtonStyle())
            .disabled(appState.isWorking)
        }
        .ttCardStyle()
    }

    private var statusMenu: some View {
        Menu {
            ForEach(TripStatus.allCases) { status in
                Button(status.rawValue) {
                    Task { await appState.syncTripStatus(trip.id, status: status) }
                }
            }
        } label: {
            HStack {
                Label("Update trip status", systemImage: "slider.horizontal.3")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(TTTheme.ink)
                Spacer()
                Image(systemName: "chevron.up.chevron.down")
                    .foregroundStyle(TTTheme.accent)
            }
            .ttFieldStyle()
        }
        .buttonStyle(.plain)
    }

    private var statusLabel: String {
        switch TripStatus(rawValue: trip.tripStatus ?? "") {
        case .unmatched:
            return "Unmatched"
        case .matchedLooking:
            return "Matched · Looking"
        case .matchedSatisfied:
            return "Matched · Done"
        case nil:
            return "Unknown"
        }
    }

    private var statusTone: TTTone {
        switch TripStatus(rawValue: trip.tripStatus ?? "") {
        case .unmatched:
            return .warning
        case .matchedLooking:
            return .accent
        case .matchedSatisfied:
            return .success
        case nil:
            return .neutral
        }
    }

    private var statusSymbol: String {
        switch TripStatus(rawValue: trip.tripStatus ?? "") {
        case .unmatched:
            return "magnifyingglass"
        case .matchedLooking:
            return "person.2.fill"
        case .matchedSatisfied:
            return "checkmark.circle.fill"
        case nil:
            return "questionmark.circle"
        }
    }
}

private struct MatchRow: View {
    @Environment(AppState.self) private var appState

    let trip: Trip
    let candidate: MatchCandidate

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(candidate.profile?.name ?? candidate.trip.userEmail)
                        .font(.headline)
                        .foregroundStyle(TTTheme.ink)

                    Text(candidate.trip.userEmail)
                        .font(.caption)
                        .foregroundStyle(TTTheme.mutedText)
                }

                Spacer(minLength: 0)

                if let status {
                    TTPill(label: statusTitle(status), tone: statusTone(status), symbol: statusSymbol(status))
                }
            }

            TTInfoRow(
                label: "Flight",
                value: "\(candidate.trip.flightDate) at \(candidate.trip.flightTime)",
                symbol: "clock"
            )

            actions
                .disabled(appState.isWorking)

            if status == "matched" {
                Link("Open Gmail draft", destination: gmailURL)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(TTTheme.accentDeep)
            }
        }
        .ttFieldStyle()
    }

    private var status: String? {
        trip.matchStatus(for: candidate.trip.userEmail)
    }

    private var actions: some View {
        HStack(spacing: 10) {
            if status == nil {
                Button("Request") {
                    Task {
                        await appState.updateMatch(action: .request, tripID: trip.id, matchTripID: candidate.id)
                    }
                }
                .buttonStyle(.borderedProminent)
            } else if status == "request_sent" {
                Button("Withdraw") {
                    Task {
                        await appState.updateMatch(action: .withdraw, tripID: trip.id, matchTripID: candidate.id)
                    }
                }
                .buttonStyle(.bordered)
            } else if status == "request_received" {
                Button("Accept") {
                    Task {
                        await appState.updateMatch(action: .accept, tripID: trip.id, matchTripID: candidate.id)
                    }
                }
                .buttonStyle(.borderedProminent)

                Button("Deny", role: .destructive) {
                    Task {
                        await appState.updateMatch(action: .deny, tripID: trip.id, matchTripID: candidate.id)
                    }
                }
                .buttonStyle(.bordered)
            } else {
                Button("Remove", role: .destructive) {
                    Task {
                        await appState.updateMatch(action: .remove, tripID: trip.id, matchTripID: candidate.id)
                    }
                }
                .buttonStyle(.bordered)
            }
        }
        .controlSize(.small)
        .tint(TTTheme.accent)
    }

    private func statusTitle(_ value: String) -> String {
        switch value {
        case "request_sent":
            return "Requested"
        case "request_received":
            return "Needs reply"
        case "matched":
            return "Matched"
        default:
            return value.replacingOccurrences(of: "_", with: " ")
        }
    }

    private func statusTone(_ value: String) -> TTTone {
        switch value {
        case "request_sent":
            return .accent
        case "request_received":
            return .warning
        case "matched":
            return .success
        default:
            return .neutral
        }
    }

    private func statusSymbol(_ value: String) -> String {
        switch value {
        case "request_sent":
            return "paperplane.fill"
        case "request_received":
            return "bell.badge.fill"
        case "matched":
            return "checkmark.seal.fill"
        default:
            return "circle"
        }
    }

    private var gmailURL: URL {
        let subject = "Airport ride share - CMU trip on \(trip.flightDate)"
        let body = "Hi,\n\nI saw that we matched on TartanTrips. Want to coordinate ride details?\n"
        let base = "https://mail.google.com/mail/?view=cm&fs=1"
        let query = "&to=\(candidate.trip.userEmail.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")&su=\(subject.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")&body=\(body.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")"
        return URL(string: base + query) ?? URL(string: "https://mail.google.com")!
    }
}
