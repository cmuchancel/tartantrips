import Foundation

enum DateTimeEST {
    static let estTimeZone = TimeZone(identifier: "America/New_York") ?? .current

    static func parse(date: String, time: String) -> Date? {
        let parts = date.split(separator: "-")
        guard parts.count == 3 else { return nil }

        let year = Int(parts[0])
        let month = Int(parts[1])
        let day = Int(parts[2])
        let timeParts = time.split(separator: ":")
        let hour = Int(timeParts.first ?? "")
        let minute = Int(timeParts.count > 1 ? timeParts[1] : "0")

        guard let year, let month, let day, let hour, let minute else { return nil }

        var comps = DateComponents()
        comps.year = year
        comps.month = month
        comps.day = day
        comps.hour = hour
        comps.minute = minute
        comps.timeZone = estTimeZone

        return Calendar(identifier: .gregorian).date(from: comps)
    }

    static func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.timeZone = estTimeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    static func formatTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.timeZone = estTimeZone
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }

    static func plusHours(_ date: Date, hours: Int) -> Date {
        date.addingTimeInterval(TimeInterval(hours * 3600))
    }

    static func plusMinutes(_ date: Date, minutes: Int) -> Date {
        date.addingTimeInterval(TimeInterval(minutes * 60))
    }

    static func overlap(_ aStart: String?, _ aEnd: String?, _ bStart: String?, _ bEnd: String?) -> Bool {
        guard
            let aStart,
            let aEnd,
            let bStart,
            let bEnd,
            let aStartDate = ISO8601DateFormatter().date(from: aStart),
            let aEndDate = ISO8601DateFormatter().date(from: aEnd),
            let bStartDate = ISO8601DateFormatter().date(from: bStart),
            let bEndDate = ISO8601DateFormatter().date(from: bEnd)
        else {
            return false
        }

        return aStartDate <= bEndDate && aEndDate >= bStartDate
    }
}
