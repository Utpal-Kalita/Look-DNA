#!/usr/bin/env node
/**
 * Builds data/catalog.json from data/catalog.csv and checks every product.
 *
 *   npm run catalog:import            # validate + write
 *   npm run catalog:import -- --dry   # validate only
 *
 * CSV columns (header row required):
 *   name,brand,category,price,image,link,color,style
 * - category: top | bottom | dress | outerwear | lipstick | eyeshadow | blush
 * - price: INR, whole number
 * - image: https URL (or /catalog/... file in public/) of a JPEG or PNG.
 *   Clothes: a clean, front-facing product photo on a plain background.
 * - color: optional #RRGGBB. Left blank for clothes, it is sampled from the
 *   image centre. Required for makeup (product photos are unreliable).
 * - style: optional tags separated by "|", e.g. oversized|knit|casual.
 *   For makeup put the finish here: matte, satin, gloss or shimmer.
 * - id: optional extra column; generated from the category if missing.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const CATEGORIES = ["top", "bottom", "dress", "kurta", "outerwear", "lipstick", "eyeshadow", "blush"];
const MAKEUP = new Set(["lipstick", "eyeshadow", "blush"]);
const PREFIX = { top: "top", bottom: "btm", dress: "drs", kurta: "krt", outerwear: "out", lipstick: "lip", eyeshadow: "eye", blush: "blu" };
const root = process.cwd();
const dry = process.argv.includes("--dry");

const rows = parseCsv(await readFile(path.join(root, "data/catalog.csv"), "utf8"));
const errors = [];
const warnings = [];
const counters = {};
const catalog = [];

for (const [index, row] of rows.entries()) {
  const line = index + 2;
  const fail = (message) => errors.push(`row ${line} (${row.name || "?"}): ${message}`);

  const category = (row.category || "").trim().toLowerCase();
  if (!CATEGORIES.includes(category)) { fail(`category must be one of ${CATEGORIES.join(", ")}`); continue; }
  const price = Number(String(row.price).replace(/[₹,\s]/g, ""));
  if (!Number.isFinite(price) || price <= 0) { fail("price must be a positive number in INR"); continue; }
  if (!row.name?.trim() || !row.brand?.trim()) { fail("name and brand are required"); continue; }
  if (!/^https?:\/\//.test(row.link || "")) { fail("link must be an http(s) URL"); continue; }
  if (!row.image?.trim()) { fail("image is required"); continue; }

  let bytes;
  try {
    bytes = await loadImage(row.image.trim());
  } catch (error) {
    fail(`image: ${error.message}`);
    continue;
  }

  let color = (row.color || "").trim();
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) { fail("color must be #RRGGBB"); continue; }
  if (!color) {
    if (MAKEUP.has(category)) { fail("color is required for makeup"); continue; }
    color = await sampleColor(bytes);
    warnings.push(`row ${line} (${row.name}): sampled colour ${color}. Check it looks right.`);
  }

  counters[category] = (counters[category] ?? 0) + 1;
  const id = row.id?.trim() || `${PREFIX[category]}-${String(counters[category]).padStart(3, "0")}`;
  catalog.push({
    id,
    name: row.name.trim(),
    brand: row.brand.trim(),
    category,
    price: Math.round(price),
    image: row.image.trim(),
    color: color.toUpperCase(),
    style: (row.style || "").split("|").map((tag) => tag.trim().toLowerCase()).filter(Boolean),
    link: row.link.trim(),
    gender: ["men", "women", "unisex"].includes((row.gender || "").trim()) ? row.gender.trim() : "women",
  });
}

const ids = new Set();
for (const item of catalog) {
  if (ids.has(item.id)) errors.push(`duplicate id ${item.id}`);
  ids.add(item.id);
}

for (const warning of warnings) console.warn(`warn  ${warning}`);
for (const error of errors) console.error(`error ${error}`);
const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, catalog.filter((i) => i.category === c).length]));
console.log(`\n${catalog.length} valid products`, byCategory);

if (errors.length > 0) {
  console.error(`\n${errors.length} row(s) need fixing. catalog.json was not written.`);
  process.exit(1);
}
if (!dry) {
  await writeFile(path.join(root, "data/catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
  console.log("Wrote data/catalog.json");
}

async function loadImage(source) {
  let bytes;
  if (source.startsWith("/")) {
    bytes = await readFile(path.join(root, "public", source));
  } else {
    const response = await fetch(source, { signal: AbortSignal.timeout(20_000), headers: { "user-agent": "Mozilla/5.0 LookDNA-catalog-check" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const type = response.headers.get("content-type")?.split(";")[0];
    if (type !== "image/jpeg" && type !== "image/png") throw new Error(`must be JPEG or PNG (got ${type}); try-on rejects other types`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (bytes.byteLength > 10 * 1024 * 1024) throw new Error("larger than 10 MB");
  const meta = await sharp(bytes).metadata();
  if (!meta.width || !meta.height) throw new Error("not a readable image");
  if (Math.min(meta.width, meta.height) < 300) throw new Error(`too small (${meta.width}x${meta.height}); use at least 300px`);
  return bytes;
}

/** Average of the centre 30% of the image, ignoring near-white background. */
async function sampleColor(bytes) {
  const image = sharp(bytes).flatten({ background: "#ffffff" });
  const { width, height } = await image.metadata();
  const crop = { left: Math.round(width * 0.35), top: Math.round(height * 0.35), width: Math.round(width * 0.3), height: Math.round(height * 0.3) };
  const { data, info } = await image.extract(crop).resize(40, 40, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235) continue;
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n += 1;
  }
  if (n === 0) return "#FFFFFF";
  return `#${[r, g, b].map((v) => Math.round(v / n).toString(16).padStart(2, "0")).join("")}`;
}

function parseCsv(text) {
  const records = [];
  let field = "", record = [], quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { record.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      record.push(field); field = "";
      if (record.some((value) => value.trim() !== "")) records.push(record);
      record = [];
    } else field += ch;
  }
  record.push(field);
  if (record.some((value) => value.trim() !== "")) records.push(record);
  const [header, ...body] = records;
  const keys = header.map((key) => key.trim().toLowerCase());
  return body.map((values) => Object.fromEntries(keys.map((key, i) => [key, values[i] ?? ""])));
}
