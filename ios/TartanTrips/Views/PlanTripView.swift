import SwiftUI
import UIKit

struct PlanTripView: View {
    @Environment(AppState.self) private var appState
    @Binding var prefillDirection: TripDirection?

    @State private var direction: TripDirection = .departing
    @State private var flightDate = Date()
    @State private var flightTime = Date()
    @State private var allowedPartnerSex = "Any"
    @State private var willingToWaitUntil = Date()
    @State private var minHoursBefore = ""
    @State private var maxHoursBefore = ""

    private var allowedPartnerOptions: [String] {
        switch appState.profile.sex {
        case "Male": return ["Any", "Male only"]
        case "Female": return ["Any", "Female only"]
        case "Non-binary": return ["Any", "Non-binary only"]
        default: return ["Any"]
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    TTHeroHeader(
                        eyebrow: "Trip Builder",
                        title: direction == .arriving ? "Shape your arrival window" : "Lock in your departure timing",
                        subtitle: direction == .arriving
                            ? "Tell riders when you land and how late you can still leave the airport."
                            : "Show how early you are willing to head to PIT so overlap windows stay accurate.",
                        symbol: direction == .arriving ? "airplane.arrival" : "airplane.departure"
                    )

                    if !appState.profile.isComplete {
                        TTMessageBanner(
                            message: "Complete your profile in the Profile tab before saving a trip.",
                            tone: .warning
                        )
                    }

                    TTSectionCard(title: "Trip basics", subtitle: "Pick a direction, flight date, and time.") {
                        VStack(alignment: .leading, spacing: 14) {
                            Text("Direction")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(TTTheme.mutedText)

                            Picker("Direction", selection: $direction) {
                                ForEach(TripDirection.allCases) { option in
                                    Text(option == .arriving ? "Arriving" : "Departing").tag(option)
                                }
                            }
                            .pickerStyle(.segmented)

                            labeledPickerRow(
                                label: "Flight date",
                                icon: "calendar",
                                content: {
                                    DatePicker("", selection: $flightDate, displayedComponents: .date)
                                        .labelsHidden()
                                }
                            )

                            labeledPickerRow(
                                label: direction == .arriving ? "Arrival time" : "Departure time",
                                icon: "clock",
                                content: {
                                    DatePicker("", selection: $flightTime, displayedComponents: .hourAndMinute)
                                        .labelsHidden()
                                }
                            )

                            VStack(alignment: .leading, spacing: 8) {
                                Text("Allowed partner")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(TTTheme.mutedText)

                                Menu {
                                    ForEach(allowedPartnerOptions, id: \.self) { option in
                                        Button(option) {
                                            allowedPartnerSex = option
                                        }
                                    }
                                } label: {
                                    HStack {
                                        Label(allowedPartnerSex, systemImage: "person.2")
                                            .foregroundStyle(TTTheme.ink)
                                        Spacer()
                                        Image(systemName: "chevron.up.chevron.down")
                                            .foregroundStyle(TTTheme.accent)
                                    }
                                    .ttFieldStyle()
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    TTSectionCard(
                        title: direction == .arriving ? "Arrival window" : "Departure window",
                        subtitle: direction == .arriving
                            ? "Choose the latest time you are willing to wait after landing."
                            : "Define how early you can head to the airport."
                    ) {
                        if direction == .arriving {
                            labeledPickerRow(
                                label: "Willing to wait until",
                                icon: "timer",
                                content: {
                                    DatePicker("", selection: $willingToWaitUntil, displayedComponents: .hourAndMinute)
                                        .labelsHidden()
                                }
                            )
                        } else {
                            VStack(spacing: 12) {
                                labeledTextField(
                                    label: "Minimum hours before flight",
                                    text: $minHoursBefore,
                                    icon: "arrow.left.to.line",
                                    keyboardType: .numberPad
                                )

                                labeledTextField(
                                    label: "Maximum hours before flight",
                                    text: $maxHoursBefore,
                                    icon: "arrow.right.to.line",
                                    keyboardType: .numberPad
                                )
                            }
                        }
                    }

                    TTSectionCard(title: "Summary", subtitle: "A quick read before you save.") {
                        VStack(spacing: 12) {
                            TTInfoRow(label: "Direction", value: direction.rawValue, symbol: "airplane")
                            TTInfoRow(label: "Flight date", value: DateTimeEST.formatDate(flightDate), symbol: "calendar")
                            TTInfoRow(
                                label: direction == .arriving ? "Arrival time" : "Departure time",
                                value: DateTimeEST.formatTime(flightTime),
                                symbol: "clock"
                            )
                            TTInfoRow(label: "Partner preference", value: allowedPartnerSex, symbol: "person.2")
                        }
                    }

                    if !appState.errorMessage.isEmpty {
                        TTMessageBanner(message: appState.errorMessage, tone: .danger)
                    }

                    if !appState.infoMessage.isEmpty {
                        TTMessageBanner(message: appState.infoMessage, tone: .success)
                    }

                    Button("Save Trip") {
                        Task {
                            await saveTrip()
                        }
                    }
                    .buttonStyle(TTPrimaryButtonStyle())
                    .disabled(!appState.profile.isComplete || appState.isWorking)
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 28)
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("Plan")
            .navigationBarTitleDisplayMode(.inline)
            .ttScreenBackground()
            .tint(TTTheme.accent)
            .overlay {
                if appState.isWorking {
                    TTLoadingOverlay(label: "Saving your trip...")
                }
            }
            .onAppear {
                if let prefillDirection {
                    direction = prefillDirection
                    self.prefillDirection = nil
                }

                if !allowedPartnerOptions.contains(allowedPartnerSex) {
                    allowedPartnerSex = "Any"
                }
            }
            .onChange(of: appState.profile.sex) {
                if !allowedPartnerOptions.contains(allowedPartnerSex) {
                    allowedPartnerSex = "Any"
                }
            }
        }
    }

    private func labeledPickerRow<Content: View>(
        label: String,
        icon: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        HStack {
            Label(label, systemImage: icon)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(TTTheme.ink)

            Spacer()

            content()
        }
        .ttFieldStyle()
    }

    private func labeledTextField(
        label: String,
        text: Binding<String>,
        icon: String,
        keyboardType: UIKeyboardType
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundStyle(TTTheme.mutedText)

            HStack(spacing: 10) {
                Image(systemName: icon)
                    .foregroundStyle(TTTheme.accent)

                TextField("0", text: text)
                    .keyboardType(keyboardType)
            }
            .ttFieldStyle()
        }
    }

    private func saveTrip() async {
        let flightDateText = DateTimeEST.formatDate(flightDate)
        let flightTimeText = DateTimeEST.formatTime(flightTime)

        if appState.trips.contains(where: { $0.direction == direction && $0.flightDate == flightDateText }) {
            appState.errorMessage = "You already have a trip for this direction and date."
            return
        }

        guard let baseFlightDate = DateTimeEST.parse(date: flightDateText, time: flightTimeText) else {
            appState.errorMessage = "Invalid flight date/time."
            return
        }

        var windowStart = baseFlightDate
        var windowEnd = baseFlightDate
        var waitUntilText: String?
        var minHours: Int?
        var maxHours: Int?

        switch direction {
        case .arriving:
            let waitText = DateTimeEST.formatTime(willingToWaitUntil)
            guard var waitDate = DateTimeEST.parse(date: flightDateText, time: waitText) else {
                appState.errorMessage = "Invalid wait time."
                return
            }

            if waitDate < baseFlightDate {
                waitDate = Calendar.current.date(byAdding: .day, value: 1, to: waitDate) ?? waitDate
            }

            windowStart = baseFlightDate
            windowEnd = waitDate
            waitUntilText = waitText

        case .departing:
            guard let min = Int(minHoursBefore), let max = Int(maxHoursBefore), min >= 0, max >= min else {
                appState.errorMessage = "Provide a valid departure range (max >= min)."
                return
            }

            windowStart = DateTimeEST.plusHours(baseFlightDate, hours: -max)
            windowEnd = DateTimeEST.plusHours(baseFlightDate, hours: -min)
            minHours = min
            maxHours = max
        }

        let payload = TripPayload(
            userEmail: appState.email,
            direction: direction.rawValue,
            flightDate: flightDateText,
            flightTime: flightTimeText,
            allowedPartnerSex: allowedPartnerSex,
            tripStatus: TripStatus.unmatched.rawValue,
            landedStatus: direction == .arriving ? "Not landed yet" : nil,
            meetupStatus: direction == .arriving ? "Looking for match" : nil,
            willingToWaitUntilTime: waitUntilText,
            minHoursBefore: minHours,
            maxHoursBefore: maxHours,
            windowStart: ISO8601DateFormatter().string(from: windowStart),
            windowEnd: ISO8601DateFormatter().string(from: windowEnd)
        )

        await appState.saveTrip(payload: payload, existingTripID: nil)
    }
}
