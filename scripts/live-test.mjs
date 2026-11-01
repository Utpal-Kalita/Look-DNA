#!/usr/bin/env node
/**
 * The PRD's 10-image test, against a running app (real APIs, not mocks).
 *
 * Put test images in:
 *   test/inspirations/*.jpg|png   ~10 inspiration looks
 *   test/selfies/good/*.jpg|png   1+ well-lit selfies (the first is used for try-on)
 *   test/selfies/bad/*.jpg|png    poor selfies (dark, blurry, no face, two faces)
 *
 * Run locally without rate limits, against live APIs:
 *   DISABLE_RATE_LIMIT=1 npm run build && DISABLE_RATE_LIMIT=1 npm start
 *   npm run test:live                      # BASE_URL defaults to http://localhost:3000
 *   BUDGET=3000 SKIP_TRYON=1 npm run test:live   # cheaper run without try-on units
 *
 * Writes test/results.md with the metrics table for the README.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const BUDGET = Number(process.env.BUDGET ?? 3000);
const SKIP_TRYON = process.env.SKIP_TRYON === "1";
const root = process.cwd();

const inspirations = await images("test/inspirations");
const goodSelfies = await images("test/selfies/good");
const badSelfies = await images("test/selfies/bad");
if (inspirations.length === 0 || goodSelfies.length === 0) {
  console.error("Add images to test/inspirations and test/selfies/good first.");
  process.exit(1);
}

// Quality gate: good selfies should pass, bad ones should be caught.
const gate = [];
for (const [file, expectPass] of [...goodSelfies.map((f) => [f, true]), ...badSelfies.map((f) => [f, false])]) {
  const result = await postImage("/api/quality", "selfie", file);
  const passed = result.ok && result.body.pass === true;
  gate.push({ file: path.basename(file), expectPass, passed, message: result.body?.message ?? result.body?.error?.message });
  console.log(`quality  ${path.basename(file)}: ${passed ? "pass" : "retake"} (expected ${expectPass ? "pass" : "retake"})`);
}

const selfie = goodSelfies[0];
const tone = await postImage("/api/skin-tone", "selfie", selfie);
if (!tone.ok) {
  console.error("Skin tone failed:", tone.body);
  process.exit(1);
}
const userTone = tone.body.userTone;
console.log(`skin tone ${userTone.hex} (${userTone.undertone})\n`);

const runs = [];
for (const file of inspirations) {
  const name = path.basename(file);
  const started = Date.now();
  const run = { name, items: 0, matched: 0, total: 0, underBudget: false, seconds: 0, tryOnMode: "-", error: "" };
  try {
    const extract = await postImage("/api/extract", "inspiration", file);
    if (!extract.ok) throw new Error(`extract: ${extract.body?.error?.message}`);
    const items = extract.body.items;
    run.items = items.length;

    const match = await postJson("/api/match", { items, userTone, budget: BUDGET });
    if (!match.ok) throw new Error(`match: ${match.body?.error?.message}`);
    run.matched = match.body.matches.length;
    run.total = match.body.total;
    run.underBudget = match.body.total <= BUDGET;

    if (!SKIP_TRYON) {
      const form = new FormData();
      form.append("selfie", await blob(selfie), path.basename(selfie));
      form.append("matches", JSON.stringify(match.body.matches));
      const tryon = await post("/api/tryon", form);
      if (!tryon.ok) throw new Error(`tryon: ${tryon.body?.error?.message}`);
      run.tryOnMode = tryon.body.mode;
    }
  } catch (error) {
    run.error = error.message;
  }
  // Skin tone is computed once up front, as it is per selfie, not per look.
  run.seconds = (Date.now() - started) / 1000;
  runs.push(run);
  console.log(`${name}: ${run.matched}/${run.items} matched, ₹${run.total}, ${run.seconds.toFixed(1)}s, ${run.tryOnMode}${run.error ? `, ERROR ${run.error}` : ""}`);
}

const ok = runs.filter((r) => !r.error);
const itemsTotal = runs.reduce((s, r) => s + r.items, 0);
const matchedTotal = runs.reduce((s, r) => s + r.matched, 0);
const matchRate = itemsTotal ? Math.round((matchedTotal / itemsTotal) * 100) : 0;
const underBudget = runs.filter((r) => r.underBudget).length;
const times = ok.map((r) => r.seconds).sort((a, b) => a - b);
const median = times.length ? times[Math.floor(times.length / 2)] : 0;
const slowest = times.at(-1) ?? 0;
const badCaught = gate.filter((g) => !g.expectPass && !g.passed).length;
const goodPassed = gate.filter((g) => g.expectPass && g.passed).length;
const date = new Date().toISOString().slice(0, 10);

const md = `## 10-image test results (${date})

Budget ₹${BUDGET.toLocaleString("en-IN")}, ${runs.length} inspiration images, live YouCam and Claude APIs${SKIP_TRYON ? " (try-on skipped)" : ""}.

| Metric | Target | Result |
| --- | --- | --- |
| Look items matched to a catalog product | 80% or more | ${matchRate}% (${matchedTotal} of ${itemsTotal}) |
| Total look cost vs budget | Under budget in 10 of 10 runs | ${underBudget} of ${runs.length} |
| Time from upload to try-on result | Under 60 seconds | median ${median.toFixed(1)}s, slowest ${slowest.toFixed(1)}s${SKIP_TRYON ? " (no try-on)" : ""} |
| Poor-quality selfies caught by the quality gate | All test cases | ${badCaught} of ${gate.length - goodSelfies.length} caught; ${goodPassed} of ${goodSelfies.length} good selfies passed |

<details><summary>Per-image runs</summary>

| Image | Items | Matched | Total (₹) | Seconds | Try-on | Error |
| --- | --- | --- | --- | --- | --- | --- |
${runs.map((r) => `| ${r.name} | ${r.items} | ${r.matched} | ${r.total} | ${r.seconds.toFixed(1)} | ${r.tryOnMode} | ${r.error} |`).join("\n")}

| Selfie | Expected | Result | Message |
| --- | --- | --- | --- |
${gate.map((g) => `| ${g.file} | ${g.expectPass ? "pass" : "retake"} | ${g.passed ? "pass" : "retake"} | ${g.message ?? ""} |`).join("\n")}

</details>
`;

await writeFile(path.join(root, "test/results.md"), md);
console.log(`\n${md}\nWrote test/results.md`);

async function images(dir) {
  try {
    const files = await readdir(path.join(root, dir));
    return files.filter((f) => /\.(jpe?g|png)$/i.test(f)).sort().map((f) => path.join(root, dir, f));
  } catch {
    return [];
  }
}

async function blob(file) {
  const type = /\.png$/i.test(file) ? "image/png" : "image/jpeg";
  return new Blob([await readFile(file)], { type });
}

async function postImage(route, field, file) {
  const form = new FormData();
  form.append(field, await blob(file), path.basename(file));
  return post(route, form);
}

async function postJson(route, body) {
  return post(route, JSON.stringify(body), { "content-type": "application/json" });
}

async function post(route, body, headers = {}) {
  const response = await fetch(`${BASE_URL}${route}`, { method: "POST", body, headers, signal: AbortSignal.timeout(300_000) });
  const json = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, body: json };
}
