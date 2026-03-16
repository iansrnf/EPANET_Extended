import "src/styles/globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="notranslate" translate="no">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Code+Pro&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Caveat&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GSCWD",
  icons: {
    icon: "/images/logo-gscwd.png",
    shortcut: "/images/logo-gscwd.png",
    apple: "/images/logo-gscwd.png",
  },
  description:
    "Run EPANET in your browser with GSCWD — no download needed. Works on Mac, Linux, or Windows. Save files locally. Modern, enhanced, and built on the trusted EPANET engine.",
  openGraph: {
    title:
      "GSCWD: EPANET in your browser — start water modeling now, no download required.",
    description:
      "Run EPANET in your browser with GSCWD — no download needed. Works on Mac, Linux, or Windows. Save files locally. Modern, enhanced, and built on the trusted EPANET engine.",
    url: "https://app.epanetjs.com",
    siteName: "GSCWD",
    images: {
      url: "https://app.epanetjs.com/banner.png",
      width: 1200,
      height: 630,
    },
  },
  applicationName: "GSCWD",
};
