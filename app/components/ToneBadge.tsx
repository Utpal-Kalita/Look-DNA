import { Swatch } from "@/app/components/Swatch";
import type { UserTone } from "@/lib/types";

const UNDERTONE_COPY: Record<UserTone["undertone"], string> = {
  warm: "Golden, peachy undertone. Corals, warm reds and terracottas glow on you.",
  cool: "Pink, rosy undertone. Berries, blue-reds and cool pinks glow on you.",
  neutral: "Balanced undertone. Most shades suit you, so we keep them close to the original.",
};

export function ToneBadge({ tone }: { tone: UserTone }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
      <Swatch color={tone.hex} size="lg" label={`Your skin tone ${tone.hex}`} />
      <div>
        <p className="font-semibold capitalize">{tone.undertone} undertone</p>
        <p className="text-sm text-muted">{UNDERTONE_COPY[tone.undertone]}</p>
        {tone.estimated ? (
          <p className="mt-1 text-xs text-muted">
            Estimated from your photo. For the most accurate reading, face the camera with your chin level.
          </p>
        ) : null}
      </div>
    </div>
  );
}
