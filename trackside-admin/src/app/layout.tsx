// ================== TRACKSIDE ADMIN — root layout ==================
// Server Component. Wraps every route in the app. Keeps a minimal
// HTML shell for the v7.0 scaffold; the real visual design lands at
// v7.2 when the dashboard ships.

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title:       'Trackside Tales — Admin',
  description: 'Private back-office for Trackside Tales. Staff use only.',
  robots:      { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
