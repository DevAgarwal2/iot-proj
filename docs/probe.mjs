import { chromium } from "playwright";

const base = process.env.APP_URL || "http://35.95.2.77";
const browser = await chromium.launch({
  channel: "chromium",
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const page = await browser.newPage();
await page.goto(`${base}/dashboard/record`, { waitUntil: "networkidle" });

const info = await page.evaluate(() => ({
  isSecureContext: window.isSecureContext,
  hasMediaDevices: typeof navigator.mediaDevices !== "undefined",
  hasGetUserMedia:
    typeof navigator.mediaDevices?.getUserMedia === "function",
}));
console.log("secure-context probe:", JSON.stringify(info));

// Try to start and read any error surfaced in the UI
await page.click("button:has(svg.lucide-mic)");
await page.fill('input[placeholder="Lecture title (optional)"]', "probe");
await page.getByRole("button", { name: "Start Recording" }).click();
await page.waitForTimeout(2500);
const body = (await page.textContent("body")) ?? "";
const err = /Failed to start recording|not available|getUserMedia/i.test(body);
console.log("error text shown on page:", err);
await browser.close();
