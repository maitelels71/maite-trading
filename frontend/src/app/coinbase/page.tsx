import { AppProviders } from "@/components/AppProviders";
import { CoinbaseDesk } from "@/components/CoinbaseDesk";
import { RequireDeskAuth } from "@/components/RequireDeskAuth";

export default function CoinbasePage() {
  return (
    <AppProviders>
      <RequireDeskAuth>
        <CoinbaseDesk />
      </RequireDeskAuth>
    </AppProviders>
  );
}
