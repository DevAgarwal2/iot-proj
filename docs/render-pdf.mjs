import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const input = path.join(here, "report.html");
const output = path.join(here, "Lecture-Notes-Project-Report.pdf");

const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage();
await page.goto("file://" + input, { waitUntil: "networkidle" });
await page.emulateMedia({ media: "print" });
await page.pdf({
  path: output,
  format: "A4",
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: "<div></div>",
  footerTemplate:
    '<div style="width:100%;font-size:8px;color:#999;text-align:center;">Lecture Notes — Project Report &nbsp;|&nbsp; page <span class="pageNumber"></span></div>',
  margin: { top: "16mm", bottom: "16mm", left: "16mm", right: "16mm" },
});
await browser.close();
console.log("wrote", output);
