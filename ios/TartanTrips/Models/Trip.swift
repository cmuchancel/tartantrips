import Foundation

enum TripDirection: String, Codable, CaseIterable, Identifiable {
    case arriving = "Arriving to Pittsburgh"
    case departing = "Departing Pittsburgh"

    var id: String { rawValue }
}

enum TripStatus: String, Codable, CaseIterable, Identifiable {
    case unmatched = "Unmatched (looking for matches)"
    case matchedLooking = "Matched and still looking"
    case matchedSatisfied = "Matched and satisfied"

    var id: String { rawValue }
}

struct Trip: Codable, Identifiable {
    let id: UUID
    let userEmail: String
    let direction: TripDirection
    let flightDate: String
    let flightTime: String
    let allowedPartnerSex: String
    let tripStatus: String?
    let landedStatus: String?
    let meetupStatus: String?
    let willingToWaitUntilTime: String?
    let minHoursBefore: Int?
    let maxHoursBefore: Int?
    let windowStart: String?
    let windowEnd: String?
    let createdAt: String

    let matchEmail0: String?
    let matchEmail1: String?
    let matchEmail2: String?
    let matchEmail3: String?
    let matchEmail4: String?
    let matchEmail5: String?

    let matchStatus0: String?
    let matchStatus1: String?
    let matchStatus2: String?
    let matchStatus3: String?
    let matchStatus4: String?
    let matchStatus5: String?

    enum CodingKeys: String, CodingKey {
        case id
        case userEmail = "user_email"
        case direction
        case flightDate = "flight_date"
        case flightTime = "flight_time"
        case allowedPartnerSex = "allowed_partner_sex"
        case tripStatus = "trip_status"
        case landedStatus = "landed_status"
        case meetupStatus = "meetup_status"
        case willingToWaitUntilTime = "willing_to_wait_until_time"
        case minHoursBefore = "min_hours_before"
        case maxHoursBefore = "max_hours_before"
        case windowStart = "window_start"
        case windowEnd = "window_end"
        case createdAt = "created_at"
        case matchEmail0 = "match_email_0"
        case matchEmail1 = "match_email_1"
        case matchEmail2 = "match_email_2"
        case matchEmail3 = "match_email_3"
        case matchEmail4 = "match_email_4"
        case matchEmail5 = "match_email_5"
        case matchStatus0 = "match_status_0"
        case matchStatus1 = "match_status_1"
        case matchStatus2 = "match_status_2"
        case matchStatus3 = "match_status_3"
        case matchStatus4 = "match_status_4"
        case matchStatus5 = "match_status_5"
    }

    func matchStatus(for email: String) -> String? {
        switch email {
        case matchEmail0: return matchStatus0
        case matchEmail1: return matchStatus1
        case matchEmail2: return matchStatus2
        case matchEmail3: return matchStatus3
        case matchEmail4: return matchStatus4
        case matchEmail5: return matchStatus5
        default: return nil
        }
    }

    var confirmedEmails: [String] {
        [
            (matchEmail0, matchStatus0),
            (matchEmail1, matchStatus1),
            (matchEmail2, matchStatus2),
            (matchEmail3, matchStatus3),
            (matchEmail4, matchStatus4),
            (matchEmail5, matchStatus5)
        ]
        .compactMap { email, status in
            status == "matched" ? email : nil
        }
    }
}

struct TripPayload: Codable {
    let userEmail: String
    let direction: String
    let flightDate: String
    let flightTime: String
    let allowedPartnerSex: String
    let tripStatus: String
    let landedStatus: String?
    let meetupStatus: String?
    let willingToWaitUntilTime: String?
    let minHoursBefore: Int?
    let maxHoursBefore: Int?
    let windowStart: String
    let windowEnd: String

    enum CodingKeys: String, CodingKey {
        case userEmail = "user_email"
        case direction
        case flightDate = "flight_date"
        case flightTime = "flight_time"
        case allowedPartnerSex = "allowed_partner_sex"
        case tripStatus = "trip_status"
        case landedStatus = "landed_status"
        case meetupStatus = "meetup_status"
        case willingToWaitUntilTime = "willing_to_wait_until_time"
        case minHoursBefore = "min_hours_before"
        case maxHoursBefore = "max_hours_before"
        case windowStart = "window_start"
        case windowEnd = "window_end"
    }
}

struct MatchCandidate: Identifiable {
    let id: UUID
    let trip: Trip
    let profile: Profile?
}

enum MatchRequestAction: String {
    case request
    case withdraw
    case accept
    case deny
    case remove
}
