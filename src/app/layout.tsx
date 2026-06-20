import type { Metadata } from "next";
import { Outfit, Space_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { Navbar } from "@/components/Navbar";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  variable: "--font-space-mono",
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "F1 Prediction Championship",
  description: "Predict F1 starting grids and finishing positions. Track live standing and dominate the championship table.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark scroll-smooth">
      <body className={`${outfit.variable} ${spaceMono.variable} antialiased min-h-screen flex flex-col`}>
        <AuthProvider>
          {/* Glowing F1 background */}
          <div className="glowing-bg" />
          
          <Navbar />
          
          <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative">
            {children}
          </main>
          
          <footer className="w-full border-t border-border/60 bg-background/50 py-6 text-center text-xs text-muted mt-auto">
            <div className="max-w-7xl mx-auto px-4">
              <p>© {new Date().getFullYear()} F1 Predictor. Built for racing fans. Not affiliated with Formula 1 or the FIA.</p>
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
