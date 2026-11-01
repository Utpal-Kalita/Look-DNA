import { AppError, getErrorMessage } from "@/lib/errors";
import type { ImageUpload } from "@/lib/image";

const YOUCAM_API_BASE = "https://yce-api-01.makeupar.com";
const FILE_ENDPOINT = "/s2s/v2.0/file";
const SKIN_TONE_ENDPOINT = "/s2s/v2.0/task/skin-tone-analysis";
const CLOTHES_ENDPOINT = "/s2s/v2.0/task/cloth-v4";
const MAKEUP_ENDPOINT = "/s2s/v2.0/task/makeup-vto";

const DEFAULT_TASK_TIMEOUT_MS = 60_000;
const DEFAULT_POLL_INTERVAL_MS = 5_000;
const REQUEST_TIMEOUT_MS = 20_000;

export type GarmentCategory =
  | "full_body"
  | "lower_body"
  | "upper_body"
  | "shoes"
  | "auto"
  | "outer";

export type YouCamFileReference =
  | { fileId: string; url?: never }
  | { fileId?: never; url: string };

export interface SkinToneAnalysis {
  face_quality?: {
    has_face: boolean;
    area?: string;
    frontal?: string;
    lighting?: string;
    faceangle?: string;
  };
  color?: {
    skin_color: string;
    eye_color?: string;
    eye_color_name?: string;
    lip_color?: string;
    eyebrow_color?: string;
    hair_color?: string;
    hair_color_name?: string;
  };
}

interface YouCamEnvelope<T> {
  status: number;
  data: T;
}

interface FileInitResponse {
  files: Array<{
    content_type: string;
    file_name: string;
    file_id: string;
    requests: Array<{
      method: string;
      url: string;
      headers?: Record<string, string>;
    }>;
  }>;
}

interface TaskCreated {
  task_id: string;
}

interface TaskState<T> {
  task_status: "running" | "success" | "error";
  results?: T;
  error?: string | null;
  error_message?: string | null;
}

interface ImageResult {
  url: string;
}

export async function uploadImageToYouCam(image: ImageUpload): Promise<string> {
  const response = await youcamRequest<FileInitResponse>(FILE_ENDPOINT, {
    method: "POST",
    body: JSON.stringify({
      files: [
        {
          content_type: image.contentType,
          file_name: image.fileName,
          file_size: image.bytes.byteLength,
        },
      ],
    }),
  });

  const file = response.files[0];
  const uploadRequest = file?.requests?.[0];
  if (!file?.file_id || !uploadRequest?.url || !uploadRequest.method) {
    throw new AppError(
      "YouCam did not return a valid image upload request.",
      502,
      "YOUCAM_UPLOAD_INIT_FAILED",
    );
  }

  let uploadResponse: Response;
  try {
    uploadResponse = await fetch(uploadRequest.url, {
      method: uploadRequest.method,
      headers: uploadRequest.headers,
      body: new Uint8Array(image.bytes),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw providerUnavailable("YouCam image upload failed", error);
  }

  if (!uploadResponse.ok) {
    throw new AppError(
      `YouCam image upload failed with status ${uploadResponse.status}.`,
      502,
      "YOUCAM_UPLOAD_FAILED",
    );
  }

  return file.file_id;
}

export async function analyzeSkinTone(
  source: YouCamFileReference,
): Promise<SkinToneAnalysis> {
  return createAndPoll<SkinToneAnalysis>(SKIN_TONE_ENDPOINT, {
    ...sourceBody("src", source),
    face_angle_strictness_level: "high",
  });
}

export async function runClothesTryOn(input: {
  source: YouCamFileReference;
  garment: YouCamFileReference;
  garmentCategory: GarmentCategory;
}): Promise<string> {
  const result = await createAndPoll<ImageResult>(CLOTHES_ENDPOINT, {
    ...sourceBody("src", input.source),
    ...sourceBody("ref", input.garment),
    garment_category: input.garmentCategory,
    change_shoes: true,
    filter_multi_person: "normal",
  });

  return requireResultUrl(result, "clothes");
}

export async function runLipMakeupTryOn(input: {
  source: YouCamFileReference;
  color: string;
}): Promise<string> {
  const result = await createAndPoll<ImageResult>(MAKEUP_ENDPOINT, {
    ...sourceBody("src", input.source),
    version: "1.0",
    effects: [
      {
        category: "lip_color",
        shape: { name: "original" },
        palettes: [
          {
            color: input.color,
            texture: "matte",
            colorIntensity: 80,
          },
        ],
        style: { type: "full" },
      },
    ],
  });

  return requireResultUrl(result, "makeup");
}

async function createAndPoll<T>(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<T> {
  const created = await youcamRequest<TaskCreated>(endpoint, {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!created.task_id) {
    throw new AppError(
      "YouCam did not return a task ID.",
      502,
      "YOUCAM_TASK_NOT_CREATED",
    );
  }

  return pollTask<T>(endpoint, created.task_id);
}

async function pollTask<T>(endpoint: string, taskId: string): Promise<T> {
  const timeoutMs = readPositiveInteger(
    process.env.YOUCAM_TASK_TIMEOUT_MS,
    DEFAULT_TASK_TIMEOUT_MS,
  );
  const intervalMs = readPositiveInteger(
    process.env.YOUCAM_POLL_INTERVAL_MS,
    DEFAULT_POLL_INTERVAL_MS,
  );
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const task = await youcamRequest<TaskState<T>>(
      `${endpoint}/${encodeURIComponent(taskId)}`,
      { method: "GET" },
    );

    if (task.task_status === "success") {
      if (task.results === undefined) {
        throw new AppError(
          "YouCam completed the task without a result.",
          502,
          "YOUCAM_RESULT_MISSING",
        );
      }

      return task.results;
    }

    if (task.task_status === "error") {
      const detail = String(task.error_message ?? task.error ?? "unknown provider error");
      if (isSelfieProblem(detail)) {
        // The photo itself needs retaking (pose, light, blur, face); pass on YouCam's tip.
        throw new AppError(detail, 422, "SELFIE_RETAKE");
      }
      throw new AppError(
        `YouCam could not process the image: ${detail}`,
        422,
        "YOUCAM_TASK_FAILED",
      );
    }

    await sleep(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
  }

  throw new AppError(
    "YouCam is taking too long to process the image. Please try again.",
    504,
    "YOUCAM_TASK_TIMEOUT",
  );
}

async function youcamRequest<T>(
  path: string,
  init: RequestInit,
): Promise<T> {
  const apiKey = process.env.YOUCAM_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError(
      "YouCam is not configured on this server.",
      503,
      "YOUCAM_NOT_CONFIGURED",
    );
  }

  let response: Response;
  try {
    response = await fetch(`${YOUCAM_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw providerUnavailable("YouCam request failed", error);
  }

  const payload = await parseJson<YouCamEnvelope<T>>(response);
  if (!response.ok || payload.status !== 200 || payload.data === undefined) {
    throw new AppError(
      `YouCam returned an unexpected response (${response.status}).`,
      502,
      "YOUCAM_BAD_RESPONSE",
    );
  }

  return payload.data;
}

async function parseJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new AppError(
      "YouCam returned an unreadable response.",
      502,
      "YOUCAM_INVALID_JSON",
    );
  }
}

function sourceBody(
  prefix: "src" | "ref",
  reference: YouCamFileReference,
): Record<string, string> {
  if (reference.fileId) {
    return { [`${prefix}_file_id`]: reference.fileId };
  }
  if (reference.url) {
    return { [`${prefix}_file_url`]: reference.url };
  }
  throw new AppError("A YouCam image reference is missing.", 500, "YOUCAM_REFERENCE_MISSING");
}

function requireResultUrl(result: ImageResult, operation: string): string {
  if (!result.url) {
    throw new AppError(
      `YouCam completed the ${operation} task without an image URL.`,
      502,
      "YOUCAM_RESULT_URL_MISSING",
    );
  }

  return result.url;
}

function providerUnavailable(prefix: string, error: unknown): AppError {
  return new AppError(
    `${prefix}: ${getErrorMessage(error)}`,
    502,
    "YOUCAM_UNAVAILABLE",
  );
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** YouCam task errors that a new selfie fixes, as opposed to service faults. */
export function isSelfieProblem(detail: string): boolean {
  return /\b(face|faces|head|tilt|tilted|angle|frontal|pose|eyes?|lighting|too dark|too bright|blurr?y|occlu)/i.test(detail);
}
