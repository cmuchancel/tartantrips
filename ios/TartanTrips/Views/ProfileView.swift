import SwiftUI
import UIKit

struct ProfileView: View {
    @Environment(AppState.self) private var appState

    @State private var name = ""
    @State private var major = ""
    @State private var graduationYear = ""
    @State private var sex = ""
    @State private var phone = ""

    private let sexOptions = ["Male", "Female", "Non-binary"]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    TTHeroHeader(
                        eyebrow: "Identity",
                        title: "Keep your rider profile sharp",
                        subtitle: "Profiles drive safety, filter matching, and make it easier to coordinate once requests are accepted.",
                        symbol: "person.crop.circle.badge.checkmark"
                    )

                    TTSectionCard(title: "Account") {
                        VStack(spacing: 14) {
                            TTInfoRow(label: "Email", value: appState.email, symbol: "envelope.fill")

                            TTPill(
                                label: appState.profile.isComplete ? "Profile complete" : "Missing details",
                                tone: appState.profile.isComplete ? .success : .warning,
                                symbol: appState.profile.isComplete ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"
                            )
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }

                    TTSectionCard(title: "Profile details", subtitle: "These details appear in match context and filtering.") {
                        VStack(spacing: 12) {
                            textField("Name", text: $name)
                            textField("Major", text: $major)
                            textField("Graduation year", text: $graduationYear, keyboardType: .numberPad)
                            sexMenu
                            textField("Phone", text: $phone, keyboardType: .phonePad)
                        }
                    }

                    if !appState.errorMessage.isEmpty {
                        TTMessageBanner(message: appState.errorMessage, tone: .danger)
                    }

                    if !appState.infoMessage.isEmpty {
                        TTMessageBanner(message: appState.infoMessage, tone: .success)
                    }

                    Button("Save Profile") {
                        Task {
                            let updated = Profile(
                                email: appState.email,
                                name: name,
                                major: major,
                                graduationYear: graduationYear,
                                sex: sex,
                                phone: phone,
                                avatarPath: appState.profile.avatarPath
                            )
                            await appState.saveProfile(updated)
                        }
                    }
                    .buttonStyle(TTPrimaryButtonStyle())
                    .disabled(appState.isWorking)

                    Button("Sign Out") {
                        Task { await appState.signOut() }
                    }
                    .buttonStyle(TTDestructiveButtonStyle())
                    .disabled(appState.isWorking)
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 28)
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.inline)
            .ttScreenBackground()
            .tint(TTTheme.accent)
            .onAppear {
                name = appState.profile.name
                major = appState.profile.major
                graduationYear = appState.profile.graduationYear
                sex = appState.profile.sex
                phone = appState.profile.phone
            }
            .overlay {
                if appState.isWorking {
                    TTLoadingOverlay(label: "Updating your profile...")
                }
            }
        }
    }

    private func textField(
        _ label: String,
        text: Binding<String>,
        keyboardType: UIKeyboardType = .default
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundStyle(TTTheme.mutedText)

            TextField(label, text: text)
                .keyboardType(keyboardType)
                .ttFieldStyle()
        }
    }

    private var sexMenu: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Sex / Gender")
                .font(.caption.weight(.semibold))
                .foregroundStyle(TTTheme.mutedText)

            Menu {
                ForEach(sexOptions, id: \.self) { option in
                    Button(option) {
                        sex = option
                    }
                }
            } label: {
                HStack {
                    Text(sex.isEmpty ? "Select one" : sex)
                        .foregroundStyle(sex.isEmpty ? TTTheme.mutedText : TTTheme.ink)
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
