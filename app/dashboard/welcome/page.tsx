import type { Metadata } from "next"

import { WelcomeScreen } from "@/components/screens/welcome-screen"

export const metadata: Metadata = {
  title: "Welcome",
  description: "Get set up in under a minute.",
}

export default function WelcomePage() {
  return <WelcomeScreen />
}
