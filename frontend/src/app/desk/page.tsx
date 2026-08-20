import { AppProviders } from "@/components/AppProviders";
import { AppShell } from "@/components/AppShell";
import { RequireDeskAuth } from "@/components/RequireDeskAuth";

export default function DeskPage() {
  return (
    <AppProviders>
      <RequireDeskAuth>
        <AppShell />
      </RequireDeskAuth>
    </AppProviders>
  );
}
