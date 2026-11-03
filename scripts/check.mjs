// Smoke test: serve docs/, load every demo with every preset in headless Chromium, and fail on console
// errors or pages without a painted canvas. Options: --out <file> writes per-canvas pixel hashes for comparisons.
import { chromium } from "playwright-chromium";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "docs");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png" };
const EXTRA = {  // settings beyond the slide presets
  conv_playground: ["pool=gavg&image=disks", "image=graphene&spec=phase&hann=0", "image=butterfly&kernel=gauss&pad=circular&stride=3&padn=2"],
  layer_playground: ["k=5&stride=2&relu=1&cout=4&x=90&y=20&b1=0.3"],
  cnn_viewer: ["digit=7&model=1"],
};
const out = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : null;

const server = createServer((req, res) => {
  let path = join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (existsSync(path) && statSync(path).isDirectory()) path = join(path, "index.html");
  if (!existsSync(path)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
  res.end(readFileSync(path));
}).listen(0, "127.0.0.1");
await new Promise(r => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;

const { demos } = JSON.parse(readFileSync(join(ROOT, "presets.json"), "utf8"));
const cases = [{ id: "index", url: `${base}/` }];
for (const d of demos) for (const h of ["", ...d.presets.map(p => p.hash), ...(EXTRA[d.id] ?? [])]) cases.push({ id: `${d.id}#${h}`, url: `${base}/${d.id}/#${h}` });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1 });
const results = []; let failed = 0;
for (const { id, url } of cases) {
  const errors = [];
  const onConsole = m => { if (m.type() === "error") errors.push(m.text()); };
  const onError = e => errors.push(`pageerror: ${e.message}`);
  page.on("console", onConsole); page.on("pageerror", onError);
  await page.goto("about:blank");
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const info = await page.evaluate(() => {
    const hash = bytes => { let h = 2166136261; for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
    const canvases = [...document.querySelectorAll("canvas")].map(c => {
      const d = c.width && c.height ? c.getContext("2d").getImageData(0, 0, c.width, c.height).data : new Uint8Array();
      return { id: c.id || c.className || "", w: c.width, h: c.height, css: c.clientWidth, hash: hash(d) };
    });
    const texts = [...document.querySelectorAll("figcaption, #params, #info, .value, #rf, h2, .shape, aside")].map(e => e.innerText.replace(/\s+/g, " ").trim());
    return { title: document.title, canvases, texts, links: document.querySelectorAll("a").length };
  });
  page.off("console", onConsole); page.off("pageerror", onError);
  const painted = info.canvases.some(c => c.w > 0);
  const ok = errors.length === 0 && (id === "index" ? info.links > 0 : painted);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${id}  ${info.canvases.length} canvases${errors.length ? `  ${errors.join(" | ")}` : ""}`);
  results.push({ id, url, errors, ...info });
}
await browser.close(); server.close();
if (out) writeFileSync(out, JSON.stringify(results, null, 1));
console.log(`${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
