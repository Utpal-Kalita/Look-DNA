import type {
  ProductMatch,
  QualityResult,
  TryOnResult,
  UserTone,
} from "@/lib/types";

/** Error with a user-facing message taken from the API error envelope. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function postForm<T>(url: string, body: FormData): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { method: "POST", body });
  } catch {
    throw new ApiError(
      "We could not reach the server. Check your connection and try again.",
      "NETWORK_ERROR",
      0,
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: { code: string; message: string } })
    | null;

  if (!response.ok || !payload) {
    throw new ApiError(
      payload?.error?.message ?? "Something went wrong. Please try again.",
      payload?.error?.code ?? "UNKNOWN_ERROR",
      response.status,
    );
  }

  return payload;
}

export function checkSelfieQuality(selfie: Blob): Promise<QualityResult> {
  const body = new FormData();
  body.append("selfie", selfie, "selfie.jpg");
  return postForm<QualityResult>("/api/quality", body);
}

export async function analyzeSkinTone(selfie: Blob): Promise<UserTone> {
  const body = new FormData();
  body.append("selfie", selfie, "selfie.jpg");
  const result = await postForm<{ userTone: UserTone }>("/api/skin-tone", body);
  return result.userTone;
}

export function runTryOn(
  selfie: Blob,
  matches: ProductMatch[],
): Promise<TryOnResult> {
  const body = new FormData();
  body.append("selfie", selfie, "selfie.jpg");
  body.append("matches", JSON.stringify(matches));
  return postForm<TryOnResult>("/api/tryon", body);
}
