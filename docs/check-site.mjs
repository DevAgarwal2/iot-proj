import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, "..", "tests", "fixtures", "speech.wav");
const base = process.env.APP_URL || "http://35.95.2.77";
const shots = path.join(here, "shots");
fs.mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({
  channel: "chromium",
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${fixture}`,
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await context.newPage();
const log = (m) => console.log(m);

let recordingId = null;
try {
  // 1. record page
  await page.goto(`${base}/dashboard/record`, { waitUntil: "networkidle" });
  await page.waitForSelector("button svg.lucide-mic", { timeout: 30000 });
  await page.screenshot({ path: path.join(shots, "01-record.png") });
  log("record page loaded");

  // 2. start recording
  await page.click("button:has(svg.lucide-mic)");
  await page.fill('input[placeholder="Lecture title (optional)"]', `Deployed check ${Date.now()}`);
  await page.getByRole("button", { name: "Start Recording" }).click();
  await page.waitForSelector("button:has(svg.lucide-square)", { timeout: 30000 });
  log("recording started");

  // 3. wait for live transcription
  await page.waitForSelector("text=Live Transcript", { timeout: 40000 });
  await page.waitForTimeout(11000);
  await page.screenshot({ path: path.join(shots, "02-live.png") });
  const liveText = (await page.textContent("body")) ?? "";
  log("live transcript visible: " + /fox/i.test(liveText));

  // 4. stop -> processing -> transcript
  await page.click("button:has(svg.lucide-square)");
  await page.waitForURL(/\/dashboard\/transcript\?id=/, { timeout: 180000 });
  recordingId = new URL(page.url()).searchParams.get("id");
  log("navigated to transcript, id=" + recordingId);
  await page.waitForSelector("text=Speakers", { timeout: 60000 });
  await page.screenshot({ path: path.join(shots, "03-transcript.png") });
  const tText = (await page.textContent("body")) ?? "";
  log("transcript contains 'fox': " + /fox/i.test(tText));
  log("transcript has speaker legend: " + /Speakers/.test(tText));

  // 5. settings page
  await page.goto(`${base}/dashboard/settings`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=End words", { timeout: 30000 });
  await page.screenshot({ path: path.join(shots, "04-settings.png") });
  log("settings page loaded");

  // 6. transcript list + insights
  await page.goto(`${base}/dashboard/transcript`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(shots, "05-transcript-list.png") });
  log("transcript list loaded");

  await page.goto(`${base}/dashboard/insights`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(shots, "06-insights.png") });
  log("insights page loaded");

  log("RESULT: OK");
} catch (err) {
  log("RESULT: FAIL -> " + (err && err.message ? err.message : String(err)));
  try { await page.screenshot({ path: path.join(shots, "99-failure.png") }); } catch {}
  process.exitCode = 1;
} finally {
  await browser.close();
  if (recordingId) fs.writeFileSync("/tmp/deployed_rid.txt", recordingId);
}
