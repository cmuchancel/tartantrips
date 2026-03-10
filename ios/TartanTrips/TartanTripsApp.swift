import SwiftUI

@main
struct TartanTripsApp: App {
    @State private var appState = AppState(service: TartanTripsService(config: AppConfig.load()))

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(appState)
        }
    }
}
