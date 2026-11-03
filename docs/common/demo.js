// Shared helpers of the course demos (ES module), imported as
//   import { $, hashState, segButtons, zoomController, paintPixels, gray, diverging } from "../common/demo.js";
// Palette and colormaps follow the lecture figures (lectures/03_cnns/python/palette.py in the course repository).

export const $ = id => document.getElementById(id);
export const sub = (base, s) => `<i>${base}</i><sub>${s}</sub>`;

// ---------- palette ----------
export const PALETTE = { blue: "#5b8fc9", orange: "#f0a058", green: "#6cb36a", red: "#e06666", purple: "#9c84c9", teal: "#5bb5b0", yellow: "#e6c35c", gray: "#8c96a0", dark: "#2c3e50", edge: "#d0d6dc" };
export const SERIES = [PALETTE.orange, PALETTE.purple, PALETTE.teal, PALETTE.yellow, PALETTE.red, PALETTE.blue];  // distinct categories, e.g. one colour per layer
export const DIVERGING = [[47, 95, 153], [91, 143, 201], [255, 255, 255], [224, 102, 102], [176, 58, 58]];  // signed values: dark blue, blue, white, red, dark red

export const lerp = (a, b, t) => a + (b - a) * t;
export function diverging(v, vmax) {  // [r, g, b] of a signed value, white at zero, saturated at ±vmax
  const t = Math.max(-1, Math.min(1, vmax > 0 ? v / vmax : 0)) * 2 + 2, i = Math.min(3, Math.floor(t)), f = t - i;
  return DIVERGING[i].map((c, q) => Math.round(lerp(c, DIVERGING[i + 1][q], f)));
}
export function gray(v, hi) {  // [r, g, b] of an intensity, black at 0 and white at hi
  const g = Math.round(255 * Math.max(0, Math.min(1, hi > 0 ? v / hi : 0)));
  return [g, g, g];
}
export function paintPixels(canvas, w, h, pixel) {  // pixel(q) -> [r, g, b] for q = row * w + column
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext("2d"), im = g.createImageData(w, h);
  for (let q = 0; q < w * h; q++) im.data.set([...pixel(q), 255], 4 * q);
  g.putImageData(im, 0, 0);
}

// ---------- state in the URL hash, so that a link reproduces a setting ----------
export function hashState(DEFAULTS, validate = () => {}, { skip = [] } = {}) {
  const state = { ...DEFAULTS };
  function read() {  // defaults, then the hash (or the query string), then the demo's own validation
    Object.assign(state, DEFAULTS);
    const p = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));
    for (const key of Object.keys(DEFAULTS)) if (p.has(key)) state[key] = typeof DEFAULTS[key] === "number" ? Number(p.get(key)) : p.get(key);
    validate(state);
    return state;
  }
  function write() {  // only the settings that differ from the defaults; skip keys that cannot be shared (uploads)
    const p = new URLSearchParams();
    for (const [key, v] of Object.entries(state)) if (!skip.includes(key) && String(v) !== String(DEFAULTS[key])) p.set(key, v);
    history.replaceState(null, "", "#" + p.toString());
  }
  return { state, read, write };
}

// ---------- controls ----------
// Segmented buttons: <div class="seg" id="stride"><button data-v="1">1</button>...</div>; numeric state keys get numbers.
// Returns a function that marks the active button of every group.
export function segButtons(groups, state, onChange) {
  for (const [id, key] of groups)
    $(id).addEventListener("click", e => {
      const v = e.target.dataset.v;
      if (v !== undefined) { state[key] = typeof state[key] === "number" ? Number(v) : v; onChange(); }
    });
  return () => { for (const [id, key] of groups) for (const b of $(id).querySelectorAll("button")) b.classList.toggle("on", b.dataset.v === String(state[key])); };
}
export function copyLink(el) { el.addEventListener("click", e => { e.preventDefault(); navigator.clipboard?.writeText(location.href); }); }

// ---------- zoom: pinch, Ctrl+scroll or a two-finger touch on an image zooms all image panels alike ----------
// Panels are <div class="frame"><div class="inner" data-a data-st><canvas>...</div></div>. The view is a region of
// the input image (centre cx, cy in input pixels, zoom z >= 1); every panel shows the part of its canvas that covers
// this region, so a stride-2 output shows its pixels over the input they sample. The inner wrapper maps canvas
// pixel q to input coordinate a + q * st; a wrapper without data-st (a single value) is not zoomed. The page itself
// never zooms. Call bind() after the frames exist, apply() after painting, and setMapping() when painting.
export function zoomController({ size, onSelect } = {}) {
  const view = { z: 1, cx: 0, cy: 0 }, S = size;
  function setMapping(inner, a, st) { inner.dataset.a = a; inner.dataset.st = st; }
  function clamp() {
    view.z = Math.min(32, Math.max(1, view.z));
    const half = S() / (2 * view.z);
    view.cx = Math.min(S() - half, Math.max(half, view.cx)); view.cy = Math.min(S() - half, Math.max(half, view.cy));
  }
  function apply() {
    for (const frame of document.querySelectorAll(".frame")) {
      const inner = frame.firstElementChild, canvas = inner?.querySelector("canvas"), F = frame.clientWidth;
      frame.classList.toggle("zoomed", view.z > 1);
      if (!canvas) continue;
      if (view.z === 1 || !F || inner.dataset.st === undefined) { inner.style.transform = ""; inner.style.removeProperty("--sw"); continue; }
      const a = Number(inner.dataset.a), st = Number(inner.dataset.st), css = canvas.clientWidth / canvas.width;  // CSS px per canvas px
      const W = S() / view.z, zz = F * st / (W * css);  // scale that maps the region width onto the frame
      const dx = -inner.offsetLeft - zz * css * (view.cx - W / 2 - a) / st, dy = -inner.offsetTop - zz * css * (view.cy - W / 2 - a) / st;
      inner.style.transformOrigin = "0 0";
      inner.style.transform = `translate(${dx}px, ${dy}px) scale(${zz})`;
      inner.style.setProperty("--sw", `${2 / zz}px`);  // keeps overlay strokes 2 px wide
    }
  }
  function coord(frame, clientX, clientY) {  // input coordinate under the pointer, from the frame's own canvas
    const inner = frame.firstElementChild, canvas = inner.querySelector("canvas"), r = canvas.getBoundingClientRect();
    const a = Number(inner.dataset.a ?? 0), st = Number(inner.dataset.st ?? 1);
    return [a + (clientX - r.left) / r.width * canvas.width * st, a + (clientY - r.top) / r.height * canvas.height * st];
  }
  function zoomAt(frame, clientX, clientY, factor) {
    const [u, v] = coord(frame, clientX, clientY);
    if (view.z === 1) { view.cx = S() / 2; view.cy = S() / 2; }
    const z0 = view.z; view.z = Math.min(32, Math.max(1, z0 * factor));
    view.cx = u + (view.cx - u) * z0 / view.z; view.cy = v + (view.cy - v) * z0 / view.z;  // keep the point under the pointer
    clamp(); apply();
  }
  function pan(frame, dx, dy) { const k = S() / view.z / frame.clientWidth; view.cx -= dx * k; view.cy -= dy * k; clamp(); apply(); }
  function reset() { view.z = 1; apply(); }
  function bind() {
    for (const frame of document.querySelectorAll(".frame")) {
      if (frame.dataset.zoom) continue;
      frame.dataset.zoom = "1";
      frame.addEventListener("wheel", e => {  // trackpad pinch arrives as Ctrl+wheel in Chrome and Firefox
        if (e.ctrlKey) { e.preventDefault(); zoomAt(frame, e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01)); }
        else if (view.z > 1) { e.preventDefault(); pan(frame, -e.deltaX, -e.deltaY); }
      }, { passive: false });
      let gesture = 1;  // Safari trackpad pinch
      frame.addEventListener("gesturestart", e => { e.preventDefault(); gesture = 1; });
      frame.addEventListener("gesturechange", e => { e.preventDefault(); zoomAt(frame, e.clientX, e.clientY, e.scale / gesture); gesture = e.scale; });
      const points = new Map(); let spread = null, moved = 0;  // touch pinch with two pointers, drag to pan, click to select
      frame.addEventListener("pointerdown", e => { frame.setPointerCapture(e.pointerId); points.set(e.pointerId, [e.clientX, e.clientY]); spread = null; moved = 0; });
      frame.addEventListener("pointermove", e => {
        if (!points.has(e.pointerId)) return;
        const prev = points.get(e.pointerId); points.set(e.pointerId, [e.clientX, e.clientY]);
        moved += Math.abs(e.clientX - prev[0]) + Math.abs(e.clientY - prev[1]);
        if (points.size === 2) {
          const [pa, pb] = [...points.values()], d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
          if (spread) zoomAt(frame, (pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, d / spread);
          spread = d;
        } else if (view.z > 1) pan(frame, e.clientX - prev[0], e.clientY - prev[1]);
      });
      frame.addEventListener("pointerup", e => {
        const single = points.size === 1;
        points.delete(e.pointerId); spread = null;
        if (onSelect && single && moved < 4) {
          const [x, y] = coord(frame, e.clientX, e.clientY), n = S();
          onSelect(Math.max(0, Math.min(n - 1, Math.floor(x))), Math.max(0, Math.min(n - 1, Math.floor(y))));
        }
      });
      frame.addEventListener("pointercancel", e => { points.delete(e.pointerId); spread = null; });
      frame.addEventListener("dblclick", reset);
    }
  }
  return { view, setMapping, apply, bind, reset };
}
