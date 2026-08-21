import { APP_ICON_PNG } from "@/lib/app-mode";

/**
 * Brand torito — Wall Street Charging Bull photo (`/brand/charging-bull.png`).
 */
export function BrandMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={APP_ICON_PNG}
      alt=""
      className={`rounded-md object-cover ${className}`}
      aria-hidden
    />
  );
}
