import type { Metadata } from "next";
import HomePage from "./home-page";

export const metadata: Metadata = {
  title: "GSCWD | Water Network Workspace",
};

export default function Page() {
  return <HomePage />;
}
