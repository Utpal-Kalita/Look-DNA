import skinToneMock from "@/data/mocks/skin-tone.json";
import tryOnMock from "@/data/mocks/tryon.json";
import type { TryOnResult } from "@/lib/types";
import type { SkinToneAnalysis } from "@/lib/youcam";

export function mockYouCamEnabled(): boolean {
  return process.env.MOCK_YOUCAM === "1";
}

export function getMockSkinTone(): SkinToneAnalysis {
  return skinToneMock.data.results;
}

export function getMockTryOn(): TryOnResult {
  return tryOnMock as TryOnResult;
}
