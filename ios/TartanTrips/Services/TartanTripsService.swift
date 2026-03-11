import Foundation
import Supabase

struct AppUser {
    let id: UUID
    let email: String
    let accessToken: String
}

struct MatchRequestPayload: Encodable {
    let action: String
    let tripId: UUID
    let matchedTripId: UUID
}

struct ProfileUpsertPayload: Encodable {
    let userID: String
    let email: String
    let name: String
    let major: String
    let graduationYear: String
    let sex: String
    let phone: String
    let avatarPath: String?

    enum CodingKeys: String, CodingKey {
        case userID = "user_id"
        case email
        case name
        case major
        case graduationYear = "graduation_year"
        case sex
        case phone
        case avatarPath = "avatar_path"
    }
}

struct MatchRequestResponse: Decodable {
    let ok: Bool?
    let error: String?
}

private struct TripMutationResponse: Decodable {
    let ok: Bool?
    let tripId: UUID?
    let error: String?
}

private struct APIErrorEnvelope: Decodable {
    let error: String?
    let message: String?
}

struct TripStatusSyncPayload: Encodable {
    let tripId: UUID
    let tripStatus: String

    enum CodingKeys: String, CodingKey {
        case tripId
        case tripStatus = "trip_status"
    }
}

final class TartanTripsService {
    private let config: AppConfig
    private let client: SupabaseClient
    private let jsonDecoder = JSONDecoder()
    private let jsonEncoder = JSONEncoder()

    var allowAnyEmail: Bool { config.allowAnyEmail }

    init(config: AppConfig) {
        self.config = config
        self.client = SupabaseClient(supabaseURL: config.supabaseURL, supabaseKey: config.supabaseAnonKey)
    }

    func sendMagicLink(email: String) async throws {
        try await client.auth.signInWithOTP(
            email: email,
            redirectTo: config.magicLinkRedirectURL
        )
    }

    func handleAuthURL(_ url: URL) {
        client.auth.handle(url)
    }

    func signOut() async throws {
        try await client.auth.signOut()
    }

    func currentUser() async throws -> AppUser {
        let session = try await client.auth.session
        guard let email = session.user.email else {
            throw NSError(domain: "TartanTrips", code: 1001, userInfo: [NSLocalizedDescriptionKey: "Signed-in user has no email"])
        }

        return AppUser(id: session.user.id, email: email, accessToken: session.accessToken)
    }

    func fetchProfile(userID: UUID) async throws -> Profile? {
        let rows: [Profile] = try await restRequest(
            path: "/rest/v1/profiles",
            method: "GET",
            queryItems: [
                URLQueryItem(name: "user_id", value: "eq.\(userID.uuidString)"),
                URLQueryItem(name: "select", value: "email,name,major,graduation_year,sex,phone,avatar_path"),
                URLQueryItem(name: "limit", value: "1")
            ],
            authToken: nil
        )

        return rows.first
    }

    func upsertProfile(userID: UUID, profile: Profile) async throws {
        let payload = ProfileUpsertPayload(
            userID: userID.uuidString,
            email: profile.email,
            name: profile.name,
            major: profile.major,
            graduationYear: profile.graduationYear,
            sex: profile.sex,
            phone: profile.phone,
            avatarPath: profile.avatarPath
        )

        _ = try await restRequestRaw(
            path: "/rest/v1/profiles",
            method: "POST",
            queryItems: [
                URLQueryItem(name: "on_conflict", value: "user_id")
            ],
            body: [payload],
            authToken: nil,
            additionalHeaders: ["Prefer": "resolution=merge-duplicates"]
        )
    }

    func fetchTrips(email: String) async throws -> [Trip] {
        try await restRequest(
            path: "/rest/v1/trips",
            method: "GET",
            queryItems: [
                URLQueryItem(name: "user_email", value: "eq.\(email)"),
                URLQueryItem(name: "order", value: "created_at.desc"),
                URLQueryItem(name: "select", value: "id,user_email,direction,flight_date,flight_time,allowed_partner_sex,trip_status,landed_status,meetup_status,willing_to_wait_until_time,min_hours_before,max_hours_before,window_start,window_end,created_at,match_email_0,match_email_1,match_email_2,match_email_3,match_email_4,match_email_5,match_status_0,match_status_1,match_status_2,match_status_3,match_status_4,match_status_5")
            ],
            authToken: nil
        )
    }

    func saveTrip(payload: TripPayload, existingTripID: UUID?, accessToken: String) async throws -> UUID {
        if let existingTripID {
            let response: TripMutationResponse = try await backendRequest(
                path: "/api/trips/\(existingTripID.uuidString)",
                method: "PATCH",
                body: payload,
                accessToken: accessToken
            )
            return response.tripId ?? existingTripID
        }

        let response: TripMutationResponse = try await backendRequest(
            path: "/api/trips",
            method: "POST",
            body: payload,
            accessToken: accessToken
        )

        guard let tripID = response.tripId else {
            throw NSError(domain: "TartanTrips", code: 1002, userInfo: [NSLocalizedDescriptionKey: "Trip insert failed"])
        }

        return tripID
    }

    func deleteTrip(id: UUID, accessToken: String) async throws {
        let _: TripMutationResponse = try await backendRequest(
            path: "/api/trips/\(id.uuidString)",
            method: "DELETE",
            accessToken: accessToken
        )
    }

    func fetchPotentialMatches(for trip: Trip, currentEmail: String) async throws -> [Trip] {
        try await restRequest(
            path: "/rest/v1/trips",
            method: "GET",
            queryItems: [
                URLQueryItem(name: "direction", value: "eq.\(trip.direction.rawValue)"),
                URLQueryItem(name: "flight_date", value: "eq.\(trip.flightDate)"),
                URLQueryItem(name: "user_email", value: "neq.\(currentEmail)"),
                URLQueryItem(name: "select", value: "id,user_email,direction,flight_date,flight_time,allowed_partner_sex,trip_status,landed_status,meetup_status,willing_to_wait_until_time,min_hours_before,max_hours_before,window_start,window_end,created_at,match_email_0,match_email_1,match_email_2,match_email_3,match_email_4,match_email_5,match_status_0,match_status_1,match_status_2,match_status_3,match_status_4,match_status_5")
            ],
            authToken: nil
        )
    }

    func fetchProfiles(emails: [String]) async throws -> [Profile] {
        guard !emails.isEmpty else { return [] }
        let values = emails.map { "\"\($0)\"" }.joined(separator: ",")

        return try await restRequest(
            path: "/rest/v1/profiles",
            method: "GET",
            queryItems: [
                URLQueryItem(name: "email", value: "in.(\(values))"),
                URLQueryItem(name: "select", value: "email,name,major,graduation_year,sex,phone,avatar_path")
            ],
            authToken: nil
        )
    }

    func updateMatchRequest(action: MatchRequestAction, tripID: UUID, matchedTripID: UUID, accessToken: String) async throws {
        let endpoint = config.apiBaseURL.appending(path: "/api/match-requests")
        var request = URLRequest(url: endpoint)
        request.timeoutInterval = 30
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try jsonEncoder.encode(MatchRequestPayload(action: action.rawValue, tripId: tripID, matchedTripId: matchedTripID))

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, (200..<300).contains(httpResponse.statusCode) else {
            let apiError = try? jsonDecoder.decode(MatchRequestResponse.self, from: data)
            throw NSError(domain: "TartanTrips", code: 1200, userInfo: [NSLocalizedDescriptionKey: apiError?.error ?? "Match request failed"])
        }
    }

    func syncTripStatus(tripID: UUID, tripStatus: TripStatus, accessToken: String) async throws {
        let endpoint = config.apiBaseURL.appending(path: "/api/trip-status-sync")
        var request = URLRequest(url: endpoint)
        request.timeoutInterval = 30
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try jsonEncoder.encode(TripStatusSyncPayload(tripId: tripID, tripStatus: tripStatus.rawValue))

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, (200..<300).contains(httpResponse.statusCode) else {
            let apiError = try? jsonDecoder.decode(MatchRequestResponse.self, from: data)
            throw NSError(domain: "TartanTrips", code: 1201, userInfo: [NSLocalizedDescriptionKey: apiError?.error ?? "Trip status sync failed"])
        }
    }

    private func restRequest<T: Decodable>(
        path: String,
        method: String,
        queryItems: [URLQueryItem],
        authToken: String?
    ) async throws -> T {
        let data = try await restRequestRaw(
            path: path,
            method: method,
            queryItems: queryItems,
            authToken: authToken
        )

        return try jsonDecoder.decode(T.self, from: data)
    }

    private func restRequest<T: Decodable, Body: Encodable>(
        path: String,
        method: String,
        queryItems: [URLQueryItem],
        body: Body,
        authToken: String?
    ) async throws -> T {
        let data = try await restRequestRaw(
            path: path,
            method: method,
            queryItems: queryItems,
            body: body,
            authToken: authToken
        )

        return try jsonDecoder.decode(T.self, from: data)
    }

    @discardableResult
    private func restRequestRaw(
        path: String,
        method: String,
        queryItems: [URLQueryItem],
        authToken: String?,
        additionalHeaders: [String: String] = [:]
    ) async throws -> Data {
        let request = try buildRequest(
            path: path,
            method: method,
            queryItems: queryItems,
            authToken: authToken,
            additionalHeaders: additionalHeaders,
            bodyData: nil
        )

        return try await perform(request)
    }

    @discardableResult
    private func restRequestRaw<Body: Encodable>(
        path: String,
        method: String,
        queryItems: [URLQueryItem],
        body: Body,
        authToken: String?,
        additionalHeaders: [String: String] = [:]
    ) async throws -> Data {
        let bodyData = try jsonEncoder.encode(body)
        let request = try buildRequest(
            path: path,
            method: method,
            queryItems: queryItems,
            authToken: authToken,
            additionalHeaders: additionalHeaders,
            bodyData: bodyData
        )

        return try await perform(request)
    }

    private func buildRequest(
        path: String,
        method: String,
        queryItems: [URLQueryItem],
        authToken: String?,
        additionalHeaders: [String: String],
        bodyData: Data?
    ) throws -> URLRequest {
        var components = URLComponents(url: config.supabaseURL.appending(path: path), resolvingAgainstBaseURL: false)
        components?.queryItems = queryItems

        guard let url = components?.url else {
            throw NSError(domain: "TartanTrips", code: 1300, userInfo: [NSLocalizedDescriptionKey: "Invalid URL"])
        }

        var request = URLRequest(url: url)
        request.timeoutInterval = 30
        request.httpMethod = method
        request.setValue(config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(authToken ?? config.supabaseAnonKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        for (key, value) in additionalHeaders {
            request.setValue(value, forHTTPHeaderField: key)
        }

        request.httpBody = bodyData
        return request
    }

    private func backendRequest<T: Decodable>(
        path: String,
        method: String,
        accessToken: String
    ) async throws -> T {
        let request = try buildBackendRequest(
            path: path,
            method: method,
            accessToken: accessToken,
            bodyData: nil
        )

        let data = try await perform(request)
        return try jsonDecoder.decode(T.self, from: data)
    }

    private func backendRequest<T: Decodable, Body: Encodable>(
        path: String,
        method: String,
        body: Body,
        accessToken: String
    ) async throws -> T {
        let bodyData = try jsonEncoder.encode(body)
        let request = try buildBackendRequest(
            path: path,
            method: method,
            accessToken: accessToken,
            bodyData: bodyData
        )

        let data = try await perform(request)
        return try jsonDecoder.decode(T.self, from: data)
    }

    private func buildBackendRequest(
        path: String,
        method: String,
        accessToken: String,
        bodyData: Data?
    ) throws -> URLRequest {
        let url = config.apiBaseURL.appending(path: path)
        var request = URLRequest(url: url)
        request.timeoutInterval = 30
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = bodyData
        return request
    }

    private func perform(_ request: URLRequest) async throws -> Data {
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, (200..<300).contains(httpResponse.statusCode) else {
            let envelope = try? jsonDecoder.decode(APIErrorEnvelope.self, from: data)
            let fallback = envelope?.message ?? envelope?.error ?? String(data: data, encoding: .utf8) ?? "Unknown API error"
            throw NSError(domain: "TartanTrips", code: 1301, userInfo: [NSLocalizedDescriptionKey: fallback])
        }
        return data
    }
}
