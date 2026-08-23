// Kuppi end-to-end browser tests against a running deployment.
// Usage: node scripts/browser-tests.mjs [baseUrl] — defaults to http://localhost:3200
// Drives headless Edge via puppeteer-core; collects console errors, page errors,
// and failed requests, exercises the main flows, and captures screenshots.

import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE_URL = process.argv[2] ?? "http://localhost:3200";
const ARTIFACTS = path.resolve("test-artifacts");
mkdirSync(ARTIFACTS, { recursive: true });

const results = [];
let browser;

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function withPage(viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("response", (response) => {
      if (response.status() < 400) return;
      // A 401 from a protected procedure while signed out is the expected
      // auth wall, not an error.
      if (response.status() === 401 && response.url().includes("/api/trpc/dashboard.mine")) return;
      failedRequests.push(`${response.status()} ${response.url()}`);
    });
  return { page, consoleErrors, pageErrors, failedRequests };
}

async function main() {
  browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    dumpio: false,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--user-data-dir=" + path.join(ARTIFACTS, "edge-profile-" + Date.now()),
    ],
  });

  // ---------- Desktop flow ----------
  const desktopViewport = { width: 1366, height: 850 };
  const { page, consoleErrors, pageErrors, failedRequests } = await withPage(desktopViewport);

  await page.goto(BASE_URL, { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise((resolve) => setTimeout(resolve, 2200));

  record("home title", (await page.title()).includes("Kuppi"));

  const heroHeadline = await page.$eval("h1", (el) => el.textContent).catch(() => null);
  record("hero headline renders", Boolean(heroHeadline?.includes("Share the note")));

  const canvasMounted = await page.$(".hero-scene-canvas");
  record("Three.js hero canvas mounted", Boolean(canvasMounted));

  await page.screenshot({ path: path.join(ARTIFACTS, "desktop-home.png") });

  // Sign-in modal opens and switches to registration.
  await page.click("header button.bg-\\[\\#5b35e8\\]").catch(() => null);
  const shareButtonClicked = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("header button")];
    const target = buttons.find((button) => button.textContent.includes("Share a resource"));
    target?.click();
    return Boolean(target);
  });
  const modalOpen = await page.waitForSelector(".account-modal, .publish-modal", { timeout: 4000 }).then(() => true).catch(() => false);
  record("auth/upload modal opens from header", modalOpen && shareButtonClicked);

  const signupTab = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll(".account-tabs button")];
    const tab = tabs.find((button) => button.textContent.includes("Create account"));
    tab?.click();
    return Boolean(tab);
  });
  if (signupTab) {
    await page.type('.account-form input[autocomplete="username"]', "kuppi_e2e_check");
    await new Promise((resolve) => setTimeout(resolve, 900));
    const availability = await page.$eval(".account-form small", (el) => el.textContent).catch(() => "");
    record("username availability check fires", availability.length > 0 && !availability.includes("undefined"), availability.trim());
  } else {
    record("username availability check fires", false, "create-account tab not found");
  }
  await page.screenshot({ path: path.join(ARTIFACTS, "desktop-signup-modal.png") });
  await page.click(".modal-close").catch(() => null);

  // Library card → resource modal with preview + comments.
  const cardOpened = await page.evaluate(() => {
    const title = [...document.querySelectorAll(".resource-title")].find((el) => el.textContent.includes("Photosynthesis"));
    title?.click();
    return Boolean(title);
  });
  if (cardOpened) {
    await page.waitForSelector(".resource-modal", { timeout: 4000 }).catch(() => null);
    const previewPresent = Boolean(await page.$(".resource-modal .document-preview"));
    const commentsPresent = Boolean(await page.$(".resource-modal .comment-section"));
    record("resource modal opens with preview + comments", previewPresent && commentsPresent);
    await page.screenshot({ path: path.join(ARTIFACTS, "desktop-resource-modal.png") });
    await page.click(".modal-close").catch(() => null);
  } else {
    record("resource modal opens with preview + comments", false, "library card not found");
  }

  // Dashboard auth wall for anonymous visitors.
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle2" });
  const authWall = await page.$eval(".dashboard-auth-wall h1", (el) => el.textContent).catch(() => null);
  record("dashboard shows sign-in wall when logged out", Boolean(authWall?.includes("personal")));
  await page.screenshot({ path: path.join(ARTIFACTS, "desktop-dashboard-wall.png") });

  // The deliberate anonymous /dashboard visit logs Chrome's own 401 console
  // line for dashboard.mine; that auth-wall rejection is expected.
  const desktopClean = consoleErrors.filter((error) => !error.includes("favicon") && !error.includes("401 (Unauthorized)")) ?? [];
  record("no console/page errors on desktop flows", desktopClean.length === 0 && pageErrors.length === 0 && failedRequests.length === 0,
    [consoleErrors.join(" | "), pageErrors.join(" | "), failedRequests.join(" | ")].filter(Boolean).slice(0, 400));
  await page.close();

  // ---------- Mobile flow ----------
  const mobileViewport = { width: 375, height: 812 };
  const mobile = await withPage(mobileViewport);
  await mobile.page.goto(BASE_URL, { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise((resolve) => setTimeout(resolve, 1800));

  const overflow = await mobile.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  record("mobile: no horizontal overflow at 375px", overflow <= 1, `overflow=${overflow}px`);

  const mobileCanvas = Boolean(await mobile.page.$(".hero-scene-canvas"));
  record("mobile: hero canvas present", mobileCanvas);

  await mobile.page.screenshot({ path: path.join(ARTIFACTS, "mobile-home.png") });

  const mobileModalOpened = await mobile.page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent.includes("Sign in"));
    button?.click();
    return Boolean(button);
  });
  const mobileModal = await mobile.page.waitForSelector(".account-modal", { timeout: 4000 }).then(() => true).catch(() => false);
  record("mobile: sign-in modal usable", mobileModalOpened && mobileModal);
  await mobile.page.screenshot({ path: path.join(ARTIFACTS, "mobile-signin.png") });

  const mobileClean = mobile.consoleErrors.filter((error) => !error.includes("favicon"));
  record("mobile: no console/page errors", mobileClean.length === 0 && mobile.pageErrors.length === 0 && mobile.failedRequests.length === 0,
    [mobile.consoleErrors.join(" | "), mobile.pageErrors.join(" | ")].filter(Boolean).slice(0, 400));
  await mobile.page.close();

  await browser.close();

  const failures = results.filter((result) => !result.passed);
  console.log(`\n${results.length - failures.length}/${results.length} checks passed. Artifacts in ${ARTIFACTS}`);
  process.exit(failures.length ? 1 : 0);
}

main().catch(async (error) => {
  console.error("Test run crashed:", error);
  await browser?.close().catch(() => null);
  process.exit(2);
});
