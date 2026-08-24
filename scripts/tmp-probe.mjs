import puppeteer from "puppeteer-core";
const id = process.argv[2] || "4";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  for (const path of [`/${id}`, `/r/${id}`]) {
    const p = await browser.newPage();
    const errors = [];
    p.on("pageerror", e => errors.push(String(e).slice(0, 80)));
    await p.goto(`https://kuppi.orinai.org${path}`, { waitUntil: "networkidle2", timeout: 45000 });
    await new Promise(r => setTimeout(r, 3000));
    const text = await p.$eval("body", el => el.innerText.slice(0, 200).replace(/\n+/g, " | "));
    console.log(`PATH ${path}: title="${await p.title()}"`);
    console.log(`  body: ${text}`);
    if (errors.length) console.log(`  pageerrors: ${errors.join(" ; ")}`);
    await p.close();
  }
} finally { await browser.close(); }
