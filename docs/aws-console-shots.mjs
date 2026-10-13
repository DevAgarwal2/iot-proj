import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "aws-shots");
fs.mkdirSync(out, { recursive: true });

const login = fs.readFileSync("/tmp/console_login.txt", "utf8").trim();
const R = "us-west-2";

const pages = [
  ["01-console-home", `https://${R}.console.aws.amazon.com/console/home?region=${R}`],
  ["02-ec2-instances", `https://${R}.console.aws.amazon.com/ec2/home?region=${R}#Instances:`],
  ["03-rds-databases", `https://${R}.console.aws.amazon.com/rds/home?region=${R}#databases:`],
  ["04-lambda", `https://${R}.console.aws.amazon.com/lambda/home?region=${R}#/functions`],
  ["05-sqs", `https://${R}.console.aws.amazon.com/sqs/v3/home?region=${R}#/queues`],
  ["06-s3", `https://s3.console.aws.amazon.com/s3/buckets?region=${R}`],
  ["07-secrets", `https://${R}.console.aws.amazon.com/secretsmanager/listsecrets?region=${R}`],
  ["08-ecr", `https://${R}.console.aws.amazon.com/ecr/repositories?region=${R}`],
];

const browser = await chromium.launch({ channel: "chromium" });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page = await ctx.newPage();

console.log("logging in...");
await page.goto(login, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(12000);

for (const [name, url] of pages) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(9000);
    await page.screenshot({ path: path.join(out, `${name}.png`) });
    console.log("shot:", name);
  } catch (e) {
    console.log("failed:", name, String(e).slice(0, 120));
  }
}

await browser.close();
console.log("done");
