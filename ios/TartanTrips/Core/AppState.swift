import Foundation
import Observation

@MainActor
@Observable
final class AppState {
    private(set) var service: TartanTripsService

    var isLoading = false
    var isWorking = false
    var isAuthenticated = false
    var userID: UUID?
    var email = ""
    var accessToken = ""

    var profile: Profile = .empty
    var trips: [Trip] = []
    var errorMessage = ""
    var infoMessage = ""

    init(service: TartanTripsService) {
        self.service = service
    }

    func bootstrap() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let user = try await service.currentUser()
            userID = user.id
            email = user.email
            accessToken = user.accessToken
            isAuthenticated = true

            if let loadedProfile = try await service.fetchProfile(userID: user.id) {
                profile = loadedProfile
            } else {
                profile = Profile.empty
            }

            trips = try await service.fetchTrips(email: user.email)
        } catch {
            isAuthenticated = false
            errorMessage = "Sign in to continue."
        }
    }

    func sendMagicLink(email: String) async {
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

        if !service.allowAnyEmail && !normalizedEmail.hasSuffix(".cmu.edu") {
            errorMessage = "Please use your CMU email ending in .cmu.edu."
            infoMessage = ""
            return
        }

        isWorking = true
        defer { isWorking = false }

        do {
            try await service.sendMagicLink(email: normalizedEmail)
            infoMessage = "Check your email for a magic login link."
            errorMessage = ""
        } catch {
            errorMessage = error.localizedDescription
            infoMessage = ""
        }
    }

    func handleIncomingURL(_ url: URL) async {
        service.handleAuthURL(url)
        await bootstrap()
    }

    func signOut() async {
        isWorking = true
        defer { isWorking = false }

        do {
            try await service.signOut()
        } catch {
            // Ignore sign-out failures and force local reset.
        }

        isAuthenticated = false
        userID = nil
        email = ""
        accessToken = ""
        profile = .empty
        trips = []
    }

    func refreshTrips() async {
        guard !email.isEmpty else { return }

        isWorking = true
        defer { isWorking = false }

        do {
            trips = try await service.fetchTrips(email: email)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func saveProfile(_ profile: Profile) async {
        guard let userID else { return }

        isWorking = true
        defer { isWorking = false }

        do {
            try await service.upsertProfile(userID: userID, profile: profile)
            self.profile = profile
            infoMessage = "Profile updated."
            errorMessage = ""
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func saveTrip(payload: TripPayload, existingTripID: UUID?) async {
        isWorking = true
        defer { isWorking = false }

        do {
            let tripID = try await service.saveTrip(payload: payload, existingTripID: existingTripID)
            await service.triggerMatchNotifications(tripID: tripID)
            trips = try await service.fetchTrips(email: email)
            infoMessage = existingTripID == nil ? "Trip created." : "Trip updated."
            errorMessage = ""
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func deleteTrip(_ tripID: UUID) async {
        isWorking = true
        defer { isWorking = false }

        do {
            try await service.deleteTrip(id: tripID, email: email)
            trips.removeAll { $0.id == tripID }
            infoMessage = "Trip deleted."
            errorMessage = ""
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func syncTripStatus(_ tripID: UUID, status: TripStatus) async {
        isWorking = true
        defer { isWorking = false }

        do {
            try await service.syncTripStatus(tripID: tripID, tripStatus: status, accessToken: accessToken)
            trips = try await service.fetchTrips(email: email)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func updateMatch(action: MatchRequestAction, tripID: UUID, matchTripID: UUID) async {
        isWorking = true
        defer { isWorking = false }

        do {
            try await service.updateMatchRequest(
                action: action,
                tripID: tripID,
                matchedTripID: matchTripID,
                accessToken: accessToken
            )
            trips = try await service.fetchTrips(email: email)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadCandidates(for trip: Trip) async -> [MatchCandidate] {
        do {
            let candidateTrips = try await service.fetchPotentialMatches(for: trip, currentEmail: email)
            let candidateEmails = candidateTrips.map(\.userEmail)
            let profiles = try await service.fetchProfiles(emails: candidateEmails)
            let profileByEmail = Dictionary(uniqueKeysWithValues: profiles.map { ($0.email, $0) })

            let filtered = candidateTrips.filter { candidate in
                guard
                    DateTimeEST.overlap(trip.windowStart, trip.windowEnd, candidate.windowStart, candidate.windowEnd),
                    let candidateSex = profileByEmail[candidate.userEmail]?.sex
                else {
                    return false
                }

                return allowsSex(allowed: trip.allowedPartnerSex, partnerSex: candidateSex) &&
                    allowsSex(allowed: candidate.allowedPartnerSex, partnerSex: profile.sex)
            }

            return filtered.map { candidate in
                MatchCandidate(id: candidate.id, trip: candidate, profile: profileByEmail[candidate.userEmail])
            }
        } catch {
            errorMessage = error.localizedDescription
            return []
        }
    }

    func loadPITCandidates(windowEnd: Date) async -> [MatchCandidate] {
        let flightDate = DateTimeEST.formatDate(Date())

        let syntheticTrip = Trip(
            id: UUID(),
            userEmail: email,
            direction: .arriving,
            flightDate: flightDate,
            flightTime: DateTimeEST.formatTime(Date()),
            allowedPartnerSex: "Any",
            tripStatus: nil,
            landedStatus: nil,
            meetupStatus: nil,
            willingToWaitUntilTime: nil,
            minHoursBefore: nil,
            maxHoursBefore: nil,
            windowStart: ISO8601DateFormatter().string(from: Date()),
            windowEnd: ISO8601DateFormatter().string(from: windowEnd),
            createdAt: "",
            matchEmail0: nil,
            matchEmail1: nil,
            matchEmail2: nil,
            matchEmail3: nil,
            matchEmail4: nil,
            matchEmail5: nil,
            matchStatus0: nil,
            matchStatus1: nil,
            matchStatus2: nil,
            matchStatus3: nil,
            matchStatus4: nil,
            matchStatus5: nil
        )

        return await loadCandidates(for: syntheticTrip)
    }

    private func allowsSex(allowed: String, partnerSex: String) -> Bool {
        if allowed == "Any" || allowed.isEmpty { return true }
        if allowed == "Male only" { return partnerSex == "Male" }
        if allowed == "Female only" { return partnerSex == "Female" }
        if allowed == "Non-binary only" { return partnerSex == "Non-binary" }
        return false
    }
}
