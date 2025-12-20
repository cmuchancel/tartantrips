import "./globals.css";

export const metadata = {
  title: "Next App",
  description: "Scaffolded Next.js app"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
