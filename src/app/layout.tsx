import type { Metadata } from "next";
import { Outfit, Space_Mono, Orbitron, Rajdhani } from "next/font/google";
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

const orbitron = Orbitron({
  subsets: ["latin"],
  variable: "--font-orbitron",
  weight: ["400", "500", "600", "700", "800", "900"],
});

const rajdhani = Rajdhani({
  subsets: ["latin"],
  variable: "--font-rajdhani",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "F1 Prediction Championship 2026",
  description: "Predict F1 starting grids and finishing positions. Track live standing and dominate the championship table.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark scroll-smooth">
      <body className={`${outfit.variable} ${spaceMono.variable} ${orbitron.variable} ${rajdhani.variable} antialiased min-h-screen flex flex-col font-sans bg-background text-slate-100`}>
        <AuthProvider>
          {/* Glowing F1 background */}
          <div className="glowing-bg" />
          
          <Navbar />
          
          <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative">
            {children}
          </main>
          
          <footer className="w-full border-t border-border/80 bg-surface/50 backdrop-blur-md py-6 text-center text-xs text-muted mt-auto">
            <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="font-display text-xs font-bold text-primary tracking-wider uppercase">F1 PREDICTOR</span>
                <span className="text-border">|</span>
                <span className="text-slate-400">Season 2026</span>
              </div>
              <p>© {new Date().getFullYear()} F1 Predictor. Built for racing fans. Not affiliated with Formula 1 or the FIA.</p>
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}

