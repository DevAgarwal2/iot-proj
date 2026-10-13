import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const base = process.env.APP_URL || "https://35.95.2.77.nip.io";
const shots = path.join(here, "shots");

const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });

const consoleMsgs = [];
const pageErrors = [];
page.on("console", (m) => consoleMsgs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => pageErrors.push(String(e)));

await page.goto(`${base}/dashboard/insights`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

// Click the first recording card title
const titles = await page.locator("h3").allTextContents();
console.log("list titles:", JSON.stringify(titles.slice(0, 5)));

if (titles.length > 0) {
  await page.locator("h3").first().click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(shots, "07-insights-detail.png") });
  const body = (await page.textContent("body")) ?? "";
  console.log("detail has 'Summary':", /Summary/i.test(body));
  console.log("detail has 'Regenerate' button:", /Regenerate/i.test(body));
  console.log("detail has 'Generate insights' button:", /Generate insights/i.test(body));
  console.log("detail has 'No insights generated':", /No insights generated/i.test(body));
  console.log("detail excerpt:", body.replace(/\s+/g, " ").slice(0, 300));
} else {
  console.log("NO TITLES FOUND — list empty");
  await page.screenshot({ path: path.join(shots, "07-insights-empty.png") });
}

console.log("--- console ---");
console.log(consoleMsgs.slice(-15).join("\n") || "(none)");
console.log("--- pageerrors ---");
console.log(pageErrors.join("\n") || "(none)");

await browser.close();
