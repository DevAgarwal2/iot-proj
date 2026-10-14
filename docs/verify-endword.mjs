import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, "..", "tests", "fixtures", "speech.wav");
const base = process.env.APP_URL || "https://35.95.2.77.nip.io";

const log = (m) => console.log(m);
let endWordId = null;
let recordingId = null;

async function addEndWord(word) {
  const res = await fetch(`${base}/api/settings/end-words`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ word }),
  });
  return (await res.json()).id;
}
async function delEndWord(id) {
  await fetch(`${base}/api/settings/end-words?id=${id}`, { method: "DELETE" });
}

const browser = await chromium.launch({
  channel: "chromium",
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${fixture}`,
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await ctx.newPage();

try {
  endWordId = await addEndWord("dog"); // fixture contains "dog"
  log("end word 'dog' added");

  await page.goto(`${base}/dashboard/record`, { waitUntil: "networkidle" });
  await page.waitForSelector("button svg.lucide-mic", { timeout: 30000 });
  await page.click("button:has(svg.lucide-mic)");
  await page.fill('input[placeholder="Lecture title (optional)"]', `Endword check ${Date.now()}`);
  await page.getByRole("button", { name: "Start Recording" }).click();
  await page.waitForSelector("button:has(svg.lucide-square)", { timeout: 30000 });

  // In-progress text should appear quickly (before any end word)
  await page.waitForSelector("text=Live Transcript", { timeout: 40000 });
  await page.waitForTimeout(11000);
  await page.screenshot({ path: path.join(here, "shots", "10-live-endword.png") });

  await page.click("button:has(svg.lucide-square)");
  await page.waitForURL(/\/dashboard\/transcript\?id=/, { timeout: 180000 });
  recordingId = new URL(page.url()).searchParams.get("id");
  await page.waitForSelector("text=Speakers", { timeout: 60000 });
  await page.screenshot({ path: path.join(here, "shots", "11-transcript-endword.png") });

  const rec = await fetch(`${base}/api/recordings/${recordingId}`).then((r) => r.json());
  const texts = rec.segments.map((s) => s.text.trim());
  const joined = texts.join(" ").toLowerCase();
  const report = {
    segmentCount: texts.length,
    texts,
    keepsDog: joined.includes("dog"),
    lineEndsWithDog: texts.some((t) => t.toLowerCase().endsWith("dog")),
    hasFox: joined.includes("fox"),
    insights: Boolean(rec.insights),
  };
  log("REPORT " + JSON.stringify(report));
  log("RESULT: " + (report.keepsDog && report.hasFox && report.insights ? "PASS" : "FAIL"));
} catch (e) {
  log("RESULT: FAIL -> " + (e && e.message ? e.message : String(e)));
  try { await page.screenshot({ path: path.join(here, "shots", "99-endword-fail.png") }); } catch {}
  process.exitCode = 1;
} finally {
  if (recordingId) await fetch(`${base}/api/recordings/${recordingId}`, { method: "DELETE" }).catch(() => {});
  if (endWordId) await delEndWord(endWordId).catch(() => {});
  await browser.close();
  log("cleanup done");
}
