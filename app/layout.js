import "./globals.css";

export const metadata = {
  title: "TartanTrips",
  description: "Safer shared rides for CMU students traveling through Pittsburgh International Airport."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
