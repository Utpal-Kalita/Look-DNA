import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { AppError } from "@/lib/errors";
import type { CatalogItem } from "@/lib/types";

const catalogItemSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  brand: z.string(),
  category: z.string().min(1),
  price: z.number().nonnegative(),
  image: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  style: z.array(z.string()),
  link: z.string(),
});

let catalogPromise: Promise<CatalogItem[]> | undefined;

export async function findCatalogItem(id: string): Promise<CatalogItem> {
  const catalog = await loadCatalog();
  const product = catalog.find((item) => item.id === id);

  if (!product) {
    throw new AppError(
      `The matched product '${id}' is not in the catalog.`,
      422,
      "PRODUCT_NOT_FOUND",
    );
  }

  return product;
}

export async function loadCatalog(): Promise<CatalogItem[]> {
  catalogPromise ??= readCatalog();
  return catalogPromise;
}

async function readCatalog(): Promise<CatalogItem[]> {
  const catalogPath = path.join(process.cwd(), "data", "catalog.json");

  let contents: string;
  try {
    contents = await readFile(catalogPath, "utf8");
  } catch {
    catalogPromise = undefined;
    throw new AppError(
      "The product catalog has not been added yet.",
      503,
      "CATALOG_NOT_AVAILABLE",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new AppError(
      "The product catalog contains invalid JSON.",
      500,
      "CATALOG_INVALID",
    );
  }

  const result = z.array(catalogItemSchema).safeParse(parsed);
  if (!result.success) {
    throw new AppError(
      "The product catalog does not match the shared data contract.",
      500,
      "CATALOG_INVALID",
    );
  }

  return result.data;
}
