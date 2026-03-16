import type { Metadata } from "next";
import HomePage from "./home-page";

export const metadata: Metadata = {
  title: "GSCWD",
};

export default function Page() {
  return <HomePage />;
}
