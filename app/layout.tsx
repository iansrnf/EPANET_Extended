import "src/styles/globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark notranslate" translate="no">
      <head>
        <link rel="prefetch" href="https://swot-checker.vercel.app/api/check" />
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
