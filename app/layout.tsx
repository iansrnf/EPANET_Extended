import "src/styles/globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="notranslate" translate="no">
      <head>
        <link rel="prefetch" href="https://swot-checker.vercel.app/api/check" />
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

const isIndexingAllowed = process.env.INDEXING_ALLOWED === "true";

export const metadata: Metadata = {
  title: "GSCWD | Water Network Workspace",
  description:
    "General Santos City Water District's workspace for water network mapping, hydraulic modeling, and simulation.",
  icons: {
    icon: { url: "/gscwd-favicon.svg", type: "image/svg+xml", sizes: "any" },
    apple: "/gscwd-logo.png",
  },
  robots: isIndexingAllowed ? undefined : { index: false },
  openGraph: {
    title: "GSCWD | Water Network Workspace",
    description:
      "General Santos City Water District's workspace for water network mapping, hydraulic modeling, and simulation.",
    siteName: "General Santos City Water District",
  },
  applicationName: "GSCWD Water Network Workspace",
};
