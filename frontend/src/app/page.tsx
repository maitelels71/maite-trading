import { Suspense } from "react";

import { AppProviders } from "@/components/AppProviders";
import { HubLanding } from "@/components/HubLanding";

export default function Home() {
  return (
    <AppProviders>
      <Suspense fallback={null}>
        <HubLanding />
      </Suspense>
    </AppProviders>
  );
}
