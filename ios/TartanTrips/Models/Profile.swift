import Foundation

struct Profile: Codable, Equatable {
    let email: String
    var name: String
    var major: String
    var graduationYear: String
    var sex: String
    var phone: String
    var avatarPath: String?

    enum CodingKeys: String, CodingKey {
        case email
        case name
        case major
        case graduationYear = "graduation_year"
        case sex
        case phone
        case avatarPath = "avatar_path"
    }

    init(
        email: String,
        name: String,
        major: String,
        graduationYear: String,
        sex: String,
        phone: String,
        avatarPath: String?
    ) {
        self.email = email
        self.name = name
        self.major = major
        self.graduationYear = graduationYear
        self.sex = sex
        self.phone = phone
        self.avatarPath = avatarPath
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        email = try container.decodeIfPresent(String.self, forKey: .email) ?? ""
        name = try container.decodeIfPresent(String.self, forKey: .name) ?? ""
        major = try container.decodeIfPresent(String.self, forKey: .major) ?? ""
        graduationYear = try container.decodeIfPresent(String.self, forKey: .graduationYear) ?? ""
        sex = try container.decodeIfPresent(String.self, forKey: .sex) ?? ""
        phone = try container.decodeIfPresent(String.self, forKey: .phone) ?? ""
        avatarPath = try container.decodeIfPresent(String.self, forKey: .avatarPath)
    }

    var isComplete: Bool {
        !name.isEmpty &&
        !major.isEmpty &&
        !graduationYear.isEmpty &&
        !sex.isEmpty &&
        !phone.isEmpty &&
        !email.isEmpty
    }

    static let empty = Profile(
        email: "",
        name: "",
        major: "",
        graduationYear: "",
        sex: "",
        phone: "",
        avatarPath: nil
    )
}
