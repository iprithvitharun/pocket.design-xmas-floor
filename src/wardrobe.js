/*
 * Winter wardrobe: dresses the page's own teammate sprites for Christmas, in your browser only.
 *
 * Given one sprite image (a sheet of frames, or a single pose), it finds in each frame the face
 * (and from it the person's skin tone), the chin, the top they are wearing, bare arms, hands and
 * bare legs, and repaints them:
 *   - the top becomes a knitted jumper in the same colour family (so everyone stays recognisable),
 *     with a Fair Isle band across the chest and ribbing
 *   - bare arms get sleeves down to the wrist, hands get mittens with a cream cuff
 *   - bare legs get wool tights
 *   - a striped scarf goes round the neck
 * Shading is kept by scaling each new colour with the original pixel's brightness.
 *
 * window.pxfWinterize(source, { cols, rows, ap }) -> OffscreenCanvas (same size as source)
 *   ap: natural pixels per art pixel (the sprites are drawn on a grid of about 2.25 CSS px)
 * window.pxfWardrobe: a small cache + background worker around it (see the end of this file).
 */
function pxfWardrobeModule(root) {
  'use strict';

  // ------------------------------------------------------------------ colour helpers
  function hsv(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) {
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return [h, mx ? d / mx : 0, mx / 255];
  }
  const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  const qkey = (r, g, b) => ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);

  // Knitwear in the colour family of what each person already wears.
  // band: the Fair Isle stripe; mitt: mittens; scarf: [main, stripe]
  const CREAM = '#f3ead8';
  const KNITS = {
    red:     { base: '#b8333b', band: CREAM,     mitt: '#2e6a4c', scarf: ['#2e6a4c', CREAM] },
    green:   { base: '#2e6a4c', band: CREAM,     mitt: '#b8333b', scarf: ['#b8333b', CREAM] },
    blue:    { base: '#2f4377', band: CREAM,     mitt: '#b8333b', scarf: ['#b8333b', CREAM] },
    sky:     { base: '#7097c4', band: CREAM,     mitt: '#b8333b', scarf: ['#b8333b', CREAM] },
    cream:   { base: '#efe4cf', band: '#b8333b', mitt: '#b8333b', scarf: ['#2e6a4c', CREAM] },
    grey:    { base: '#8d909a', band: '#b8333b', mitt: '#b8333b', scarf: ['#b8333b', CREAM] },
    dark:    { base: '#3b3a46', band: '#d6b980', mitt: '#b8333b', scarf: ['#b8333b', CREAM] },
    mustard: { base: '#c9902c', band: CREAM,     mitt: '#2e6a4c', scarf: ['#2e6a4c', CREAM] },
    plum:    { base: '#6a3a6b', band: CREAM,     mitt: '#2e6a4c', scarf: ['#2e6a4c', CREAM] }
  };
  function knitFor(r, g, b) {
    const [h, s, v] = hsv(r, g, b);
    if (s < 0.2) return v > 0.72 ? KNITS.cream : v > 0.38 ? KNITS.grey : KNITS.dark;
    if (v < 0.24) return KNITS.dark;
    if (h < 18 || h >= 330) return KNITS.red;
    if (h < 50) return s < 0.45 && v > 0.6 ? KNITS.cream : KNITS.mustard;
    if (h < 70) return KNITS.mustard;
    if (h < 196) return KNITS.green;
    if (h < 250) return v > 0.62 && s < 0.55 ? KNITS.sky : KNITS.blue;
    return KNITS.plum;
  }
  const TIGHTS = '#3a3147';

  // ------------------------------------------------------------------ frame analysis
  function Frame(d, W, x0, y0, fw, fh, ap) {
    const N = fw * fh;
    const f = { d, W, x0, y0, fw, fh, ap, N, A: new Uint8Array(N), H: new Float32Array(N), S: new Float32Array(N), V: new Float32Array(N), t: -1, b: -1, l: fw, r: -1 };
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const i = ((y0 + y) * W + x0 + x) * 4, k = y * fw + x;
      if (d[i + 3] < 110) continue;
      f.A[k] = 1;
      const c = hsv(d[i], d[i + 1], d[i + 2]); f.H[k] = c[0]; f.S[k] = c[1]; f.V[k] = c[2];
      if (f.t < 0) f.t = y; f.b = y; if (x < f.l) f.l = x; if (x > f.r) f.r = x;
    }
    f.px = k => ((y0 + ((k / fw) | 0)) * W + x0 + (k % fw)) * 4;
    return f.t < 0 ? null : f;
  }
  const skinish = (f, k) => f.A[k] && f.H[k] >= 6 && f.H[k] <= 44 && f.S[k] >= 0.14 && f.S[k] <= 0.72 && f.V[k] >= 0.3;
  const skinOf = tone => (f, k) => f.A[k] && hueDist(f.H[k], tone.h) < 11 && Math.abs(f.S[k] - tone.s) < 0.17 && f.V[k] > tone.v * 0.56 && f.V[k] < Math.min(1.01, tone.v * 1.22);

  // The face: the most common skin-like colour in the head, which is about the top 14 art px.
  function faceTone(f) {
    const { ap, fw } = f;
    const headBot = Math.min(f.b, f.t + Math.round(14 * ap));
    const hist = new Map();
    for (let y = f.t; y < headBot; y++) for (let x = f.l; x <= f.r; x++) {
      const k = y * fw + x; if (!skinish(f, k)) continue;
      const key = (Math.round(f.H[k] / 4) << 8) | Math.round(f.S[k] * 20);
      hist.set(key, (hist.get(key) || 0) + 1);
    }
    let best = 0, bk = -1;
    for (const [key, n] of hist) if (n > best) { best = n; bk = key; }
    if (best < ap * ap * 4) return null;
    const h0 = (bk >> 8) * 4, s0 = (bk & 255) / 20;
    let sv = 0, n = 0, sh = 0, ss = 0;
    for (let y = f.t; y < headBot; y++) for (let x = f.l; x <= f.r; x++) {
      const k = y * fw + x; if (!skinish(f, k)) continue;
      if (hueDist(f.H[k], h0) < 8 && Math.abs(f.S[k] - s0) < 0.12) { sv += f.V[k]; sh += f.H[k]; ss += f.S[k]; n++; }
    }
    return { h: sh / n, s: ss / n, v: sv / n, n };
  }

  // Where the face is, which way it looks, and where the neck starts.
  function locateHead(f, isSkin) {
    const { ap, fw } = f;
    const headBot = Math.min(f.b, f.t + Math.round(16 * ap));
    const rowSkin = new Int32Array(f.fh), rowL = new Int32Array(f.fh).fill(fw), rowR = new Int32Array(f.fh).fill(-1);
    let hx = 0, hn = 0, sx = 0, sn = 0;
    for (let y = f.t; y <= f.b; y++) for (let x = f.l; x <= f.r; x++) {
      const k = y * fw + x; if (!f.A[k]) continue;
      const head = y < f.t + 12 * ap;
      if (head) { hx += x; hn++; }
      if (isSkin(f, k)) { rowSkin[y]++; if (x < rowL[y]) rowL[y] = x; if (x > rowR[y]) rowR[y] = x; if (head) { sx += x; sn++; } }
    }
    // the face: the widest skin row in the head
    let faceW = 0, faceY = -1;
    for (let y = f.t; y < headBot; y++) if (rowSkin[y] > faceW) { faceW = rowSkin[y]; faceY = y; }
    const hcx = hx / Math.max(1, hn);
    if (faceW < 4 * ap || sn < ap * ap * 10) return { view: 'back', cx: Math.round(hcx), hcx, chin: -1, faceY: -1 };
    const fcx = sx / sn;
    const view = Math.abs(fcx - hcx) > ap * 1.4 ? (fcx > hcx ? 'right' : 'left') : 'front';
    // the neck: below the eyes, a run of rows that are skin in the middle and much narrower than the
    // face (a run, so a lip or a chin patch between beard and moustache doesn't count)
    let chin = -1, neckW = 0, neckCx = fcx, run = 0, first = -1, fl0 = 0, fr0 = 0;
    for (let y = faceY + Math.round(2 * ap); y < Math.min(f.b, faceY + 16 * ap); y++) {
      let mid = 0, rl = fw, rr = -1;
      for (let x = Math.round(fcx - faceW * 0.34); x <= Math.round(fcx + faceW * 0.34); x++) {
        if (x < 0 || x >= fw) continue;
        if (isSkin(f, y * fw + x)) { mid++; if (x < rl) rl = x; if (x > rr) rr = x; }
      }
      if (mid >= ap * 1.5 && rowSkin[y] < faceW * 0.52) {
        if (run === 0) { first = y; fl0 = rl; fr0 = rr; }
        run++;
        if (run >= Math.round(1.6 * ap)) { chin = first; neckW = fr0 - fl0 + 1; neckCx = (fl0 + fr0) / 2; break; }
      } else run = 0;
    }
    return { view, cx: Math.round(fcx), hcx, chin, faceW, neckW, neckCx, faceY };
  }

  // The top: the most common cloth colour on the chest. Dark colours (headphones, a beard, straps)
  // only win when there is little else, so a black T-shirt still counts.
  function chestColour(f, isSkin, chin, cx) {
    const { ap, fw, d } = f;
    const y0 = chin + Math.round(2.6 * ap), y1 = Math.min(f.b, chin + Math.round(10 * ap));
    const bucket = new Map();
    let total = 0;
    for (let y = y0; y < y1; y++) for (let x = cx - Math.round(3.5 * ap); x <= cx + Math.round(3.5 * ap); x++) {
      if (x < 0 || x >= fw) continue;
      const k = y * fw + x; if (!f.A[k] || isSkin(f, k) || f.V[k] < 0.12) continue;
      const i = f.px(k), key = qkey(d[i], d[i + 1], d[i + 2]);
      const e = bucket.get(key) || { n: 0, r: 0, g: 0, b: 0, dark: f.V[k] < 0.3 };
      e.n++; e.r += d[i]; e.g += d[i + 1]; e.b += d[i + 2]; total++;
      bucket.set(key, e);
    }
    let best = null, bestLight = null;
    for (const e of bucket.values()) {
      if (!best || e.n > best.n) best = e;
      if (!e.dark && (!bestLight || e.n > bestLight.n)) bestLight = e;
    }
    if (bestLight && bestLight.n >= total * 0.22) best = bestLight;
    return best && best.n > ap * ap ? { rgb: [best.r / best.n, best.g / best.n, best.b / best.n], n: best.n } : null;
  }

  // ------------------------------------------------------------------ painting one frame
  function shadeTo(rgb, ratio) {
    const k = Math.max(0.42, Math.min(1.35, ratio));
    return k <= 1 ? rgb.map(c => c * k) : rgb.map(c => c + (255 - c) * (k - 1) * 0.9);
  }

  // Does this pixel match the cloth colour of their top (allowing for its shading)?
  function clothTest(gm, isSkin) {
    if (!gm) return () => false;
    const gl = lum(gm[0], gm[1], gm[2]) + 1, gs = gm[0] + gm[1] + gm[2] + 1;
    const gc = [gm[0] / gs, gm[1] / gs, gm[2] / gs];
    const neutral = hsv(gm[0], gm[1], gm[2])[1] < 0.2;
    return (f, k) => {
      if (!f.A[k] || isSkin(f, k)) return false;
      const d = f.d, i = f.px(k);
      const L = lum(d[i], d[i + 1], d[i + 2]) + 1, s = d[i] + d[i + 1] + d[i + 2] + 1, ratio = L / gl;
      if (ratio < (neutral ? 0.6 : 0.4) || ratio > (neutral ? 1.5 : 1.9)) return false;
      const dc = Math.abs(d[i] / s - gc[0]) + Math.abs(d[i + 1] / s - gc[1]) + Math.abs(d[i + 2] / s - gc[2]);
      return dc < (neutral ? 0.06 : 0.11);
    };
  }

  // Where the scarf goes: on the collar when the top has one close under the face; otherwise
  // (a low neckline) on the neck, which is the last run of skin down the middle before the cloth.
  function scarfLine(f, sheet) {
    const { ap, fw } = f;
    const view = f.info.view;
    // Side and back views: read the silhouette. Seen from the side, the throat is the deepest notch
    // in the front outline between the face and the chest; from behind, the neck is the narrowest
    // row under the head (long hair hides it, and then the other views decide).
    if (view !== 'front') {
      const edge = new Float32Array(f.fh).fill(NaN), skinEdge = new Uint8Array(f.fh);
      for (let y = f.t; y <= f.b; y++) {
        let lo = -1, hi = -1;
        for (let x = f.l; x <= f.r; x++) if (f.A[y * fw + x]) { if (lo < 0) lo = x; hi = x; }
        if (lo < 0) continue;
        edge[y] = view === 'left' ? -lo : view === 'right' ? hi : hi - lo; // bigger = sticks out more / wider
        // is the front of this row skin (a nose, a chin) rather than hair?
        const x0 = view === 'left' ? lo : hi, dir = view === 'left' ? 1 : -1;
        for (let k = 1; k <= Math.round(1.5 * ap); k++) { const x = x0 + dir * k; if (x >= 0 && x < fw && sheet.isSkin(f, y * fw + x)) { skinEdge[y] = 1; break; } }
      }
      if (view === 'back') {
        let headW = 0;
        for (let y = f.t; y < f.t + 10 * ap; y++) if (edge[y] > headW) headW = edge[y];
        let best = Infinity, by = -1;
        for (let y = f.t + Math.round(8 * ap); y < f.t + Math.round(20 * ap) && y < f.b; y++) if (edge[y] < best) { best = edge[y]; by = y; }
        return by > 0 && best < headW * 0.72 ? by + Math.round(1.4 * ap) : null;
      }
      let nose = -1, most = -Infinity;
      for (let y = f.t + Math.round(3 * ap); y < f.t + Math.round(18 * ap) && y < f.b; y++) if (skinEdge[y] && edge[y] > most) { most = edge[y]; nose = y; }
      if (nose < 0) return null;
      let throat = -1, deep = Infinity;
      for (let y = nose + Math.round(2 * ap); y < nose + Math.round(9 * ap) && y < f.b; y++) if (edge[y] < deep) { deep = edge[y]; throat = y; }
      // it must be a real notch: the chest below sticks out again
      let chest = -Infinity;
      for (let y = throat + 1; y < throat + Math.round(5 * ap) && y < f.b; y++) if (edge[y] > chest) chest = edge[y];
      return throat > 0 && chest > deep + ap * 0.75 ? throat + Math.round(1.5 * ap) : null;
    }
    const isSkin = sheet.isSkin, isCloth = sheet.isCloth, cx = f.cx;
    // start below the chin line for this view (eye whites and teeth are not a collar)
    const from = Math.max(f.info.faceY >= 0 && f.info.view !== 'back' ? f.info.faceY + Math.round(3 * ap) : 0, f.chin - Math.round(ap));
    const to = Math.min(f.b - 4 * ap, from + 22 * ap);
    const frac = (y, test, w) => { let n = 0, m = 0; for (let x = cx - Math.round(w * ap); x <= cx + Math.round(w * ap); x++) { if (x < 0 || x >= fw) continue; m++; if (test(f, y * fw + x)) n++; } return m ? n / m : 0; };
    let collar = -1;
    for (let y = Math.max(0, from); y < to; y++) {
      if (frac(y, isCloth, 2) >= 0.5 && frac(y + Math.round(ap), isCloth, 2) >= 0.5) { collar = y; break; }
    }
    let neck = -1, inSkin = false;
    for (let y = Math.max(0, from - ap); y < (collar >= 0 ? collar : to); y++) {
      const sk = frac(y, isSkin, 0.6) >= 0.5;
      if (sk && !inSkin) neck = y;
      inSkin = sk;
    }
    if (collar >= 0 && (neck < 0 || collar - neck <= 4.5 * ap)) return collar + Math.round(0.5 * ap);
    if (neck >= 0) return neck + Math.round(2.4 * ap);
    return null;
  }

  // The top they are wearing (every pixel below the scarf matching the cloth colour) and its hem.
  function cloth(f, sheet) {
    const { ap, fw, fh, N } = f;
    const top = f.sBot + 1, footY = f.b - Math.round(2.8 * ap);
    const garment = new Uint8Array(N);
    let gBot = -1;
    if (sheet.garment) {
      for (let y = Math.max(0, top); y < footY; y++) for (let x = f.l; x <= f.r; x++) {
        const k = y * fw + x; if (sheet.isCloth(f, k)) garment[k] = 1;
      }
      // drop specks: keep only pixels with enough garment around them (kills stray matches in hair or shoes)
      const keep = new Uint8Array(N), R = Math.max(1, Math.round(ap));
      for (let y = Math.max(0, top); y < footY; y++) for (let x = f.l; x <= f.r; x++) {
        const k = y * fw + x; if (!garment[k]) continue;
        let n = 0, m = 0;
        for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const yy = y + dy, xx = x + dx; if (yy < 0 || yy >= fh || xx < 0 || xx >= fw) continue; m++; if (garment[yy * fw + xx]) n++; }
        if (n > m * 0.3) keep[k] = 1;
      }
      // keep the cloth joined to the chest; small gaps (a laptop edge, a strap) are bridged
      const reach = new Uint8Array(N), gap = Math.round(2 * ap), st = [];
      for (let y = Math.max(0, top); y < Math.min(footY, top + 5 * ap); y++) for (let x = f.cx - Math.round(3 * ap); x <= f.cx + Math.round(3 * ap); x++) {
        if (x < 0 || x >= fw) continue; const k = y * fw + x; if (keep[k] && !reach[k]) { reach[k] = 1; st.push(k); }
      }
      while (st.length) {
        const k = st.pop(), y = (k / fw) | 0, x = k - y * fw;
        for (let dy = -gap; dy <= gap; dy++) for (let dx = -gap; dx <= gap; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > gap) continue;
          const yy = y + dy, xx = x + dx; if (yy < 0 || yy >= fh || xx < 0 || xx >= fw) continue;
          const j = yy * fw + xx; if (keep[j] && !reach[j]) { reach[j] = 1; st.push(j); }
        }
      }
      let any = false;
      for (let k = 0; k < N; k++) if (reach[k]) { any = true; break; }
      const src = any ? reach : keep;
      for (let k = 0; k < N; k++) { garment[k] = src[k]; if (src[k]) { const y = (k / fw) | 0; if (y > gBot) gBot = y; } }
    }
    if (gBot < 0) gBot = f.sBot + Math.round((f.b - f.t) * 0.3);
    return { garment, gBot };
  }

  function dress(f, sheet, ink, dbg) {
    const { ap, fw, fh, N, d } = f;
    const isSkin = sheet.isSkin;
    const t = f.t, b = f.b, chin = f.chin, cx = f.cx, view = f.info.view;
    const gm = sheet.garment;
    const knit = gm ? knitFor(gm[0], gm[1], gm[2]) : KNITS.cream;
    const { garment, gBot } = f.cloth;
    const sBot = f.sBot, sTop = sBot - Math.round(2.5 * ap);
    const bodyTop = sBot + 1;
    // 3. bare skin below the neck: arms and hands above the hem, legs below it
    const paint = new Uint8Array(N); // 1 jumper, 2 mitten, 3 tights, 5 band, 6 cuff
    for (let k = 0; k < N; k++) if (garment[k]) paint[k] = 1;
    const lab = new Int32Array(N).fill(-1), comps = [];
    for (let y = bodyTop; y <= b; y++) for (let x = f.l; x <= f.r; x++) {
      const k = y * fw + x;
      if (lab[k] >= 0 || !isSkin(f, k)) continue;
      const c = { px: [], top: y, bot: y };
      lab[k] = comps.length; const st = [k];
      while (st.length) {
        const q = st.pop(), qy = (q / fw) | 0, qx = q - qy * fw;
        c.px.push(q); if (qy > c.bot) c.bot = qy;
        for (const j of [qx > 0 ? q - 1 : -1, qx < fw - 1 ? q + 1 : -1, qy > bodyTop ? q - fw : -1, qy < b ? q + fw : -1]) {
          if (j >= 0 && lab[j] < 0 && isSkin(f, j)) { lab[j] = comps.length; st.push(j); }
        }
      }
      comps.push(c);
    }
    const handH = Math.round(2.4 * ap), colW = 3 * ap;
    for (const c of comps) {
      if (c.px.length < ap * ap * 0.6) continue;
      let cy = 0; for (const k of c.px) cy += (k / fw) | 0; cy /= c.px.length;
      // a leg: below the hem, or (sitting, knees up) in the lower part of the figure
      if (c.top > gBot - ap || cy > t + (b - t) * 0.6) { for (const k of c.px) paint[k] = 3; continue; }
      // an arm (or the chest above a low neckline): the lowest part of each limb is the hand
      const lowest = new Map();
      for (const k of c.px) { const y = (k / fw) | 0, g = Math.floor((k % fw) / colW); if (!(lowest.get(g) >= y)) lowest.set(g, y); }
      for (const k of c.px) {
        const y = (k / fw) | 0, g = Math.floor((k % fw) / colW);
        const low = Math.max(lowest.get(g), lowest.get(g - 1) || 0, lowest.get(g + 1) || 0);
        // the hand: near the bottom of its limb, and below the chest
        paint[k] = (c.bot - c.top < handH * 1.2 || y > low - handH) && y > sBot + 3 * ap ? 2 : 1;
      }
    }
    // mitten cuffs: the first rows of a mitten under a sleeve
    for (let y = 1; y < fh; y++) for (let x = 0; x < fw; x++) {
      const k = y * fw + x;
      if (paint[k] === 2 && paint[k - fw] === 1) for (let dy = 0; dy < Math.round(0.8 * ap) && y + dy < fh; dy++) if (paint[k + dy * fw] === 2) paint[k + dy * fw] = 6;
    }

    // 4. Fair Isle band across the chest: two solid rows with a row of stitches between
    const bandY = sBot + Math.round(1.6 * ap), st = ap * 0.85;
    if (knit !== KNITS.dark) for (let y = bandY; y < bandY + 3 * st && y < fh; y++) for (let x = 0; x < fw; x++) {
      const k = y * fw + x; if (paint[k] !== 1) continue;
      const gy = Math.floor((y - bandY) / st), gx = Math.floor((x - cx + 64 * st) / st);
      if (gy !== 1 || gx % 2 === 0) paint[k] = 5;
    }
    // ribbed hem: the bottom row of the jumper a little darker
    const rib = new Uint8Array(N);
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const k = y * fw + x; if (paint[k] !== 1) continue;
      const below = y + Math.round(ap) < fh ? paint[k + Math.round(ap) * fw] : 0;
      if (below !== 1 && below !== 5) rib[k] = 1;
    }

    // 5. the scarf: a band round the neck with a tail hanging on one side
    const scarf = new Uint8Array(N);
    const half = Math.max(2.6 * ap, Math.min(f.neckW ? f.neckW / 2 + 1.3 * ap : 3.6 * ap, 4.8 * ap));
    const scx = view === 'left' ? cx + 0.4 * ap : view === 'right' ? cx - 0.4 * ap : cx;
    for (let y = sTop; y <= sBot; y++) {
      const inset = y === sTop || y === sBot ? ap * 0.5 : 0;
      for (let x = Math.round(scx - half + inset); x <= Math.round(scx + half - inset); x++) if (x >= 0 && x < fw && y >= 0 && y < fh) scarf[y * fw + x] = 1;
    }
    // From the side or behind, the scarf only shows where the neck or collar does; long hair hides it.
    // (A dark top can't be told from dark hair, so then only bare neck counts.)
    let hidden = false;
    if (view !== 'front') {
      let skin = 0, cloth = 0, all = 0;
      for (let y = sTop; y <= sBot; y++) for (let x = cx - Math.round(2 * ap); x <= cx + Math.round(2 * ap); x++) {
        const k = y * fw + x; if (x < 0 || x >= fw || y < 0 || y >= fh || !f.A[k]) continue; all++;
        if (isSkin(f, k)) skin++; else if (sheet.isCloth(f, k)) cloth++;
      }
      const seen = knit === KNITS.dark ? skin : skin + cloth;
      hidden = !all || seen < all * (knit === KNITS.dark ? 0.25 : 0.35);
      if (hidden) scarf.fill(0);
    }
    if (view === 'back' || hidden) {
      // no tail from behind
    } else {
      const tw = Math.round(1.9 * ap), tl = Math.round(4.6 * ap);
      const tx = view === 'front' ? Math.round(scx - half * 0.55) : view === 'left' ? Math.round(scx - half + 0.4 * ap) : Math.round(scx + half - 0.4 * ap - tw);
      for (let y = sBot; y < sBot + tl && y < fh; y++) {
        const fringe = y >= sBot + tl - Math.round(0.7 * ap);
        for (let x = tx; x < tx + tw; x++) if (x >= 0 && x < fw && (!fringe || Math.floor((x - tx) / (ap * 0.6)) % 2 === 0)) scarf[y * fw + x] = 2;
      }
    }

    if (dbg) dbg.push({ x0: f.x0, y0: f.y0, t, b, chin, faceY: f.info.faceY, rawChin: f.info.chin, sTop, sBot, gBot, view, knit: knit.base });
    // ---- paint
    const dark = knit === KNITS.dark;
    const base = dark && gm ? gm.map(v => Math.max(v, 38)) : hex(knit.base), band = hex(knit.band), mitt = hex(knit.mitt), tights = hex(TIGHTS);
    const s1 = hex(knit.scarf[0]), s2 = hex(knit.scarf[1]), cuff = hex(CREAM);
    const gL = gm ? lum(gm[0], gm[1], gm[2]) : 170, skL = sheet.skinL;
    for (let k = 0; k < N; k++) {
      const p = paint[k]; if (!p || scarf[k]) continue;
      const i = f.px(k), L = lum(d[i], d[i + 1], d[i + 2]);
      let c;
      if (p === 1 || p === 5) {
        // a dark top keeps its own pixels (long dark hair over it would be knitted too); only the
        // new sleeves are painted, in the top's own colour
        if (dark && garment[k]) continue;
        c = shadeTo(p === 5 ? band : base, L / (garment[k] ? gL : skL));
        if (rib[k]) c = c.map(v => v * 0.86);
      } else if (p === 2) c = shadeTo(mitt, L / skL);
      else if (p === 6) c = shadeTo(cuff, L / skL);
      else c = shadeTo(tights, L / skL);
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
    }
    const e = Math.max(1, Math.round(ap * 0.7));
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const k = y * fw + x; if (!scarf[k]) continue;
      let edge = false;
      for (const [dx, dy] of [[-e, 0], [e, 0], [0, -e], [0, e]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= fw || yy >= fh || !scarf[yy * fw + xx]) { edge = true; break; }
      }
      let c;
      if (edge) c = ink;
      else if (scarf[k] === 2) c = Math.floor((y - sBot) / ap) % 3 === 2 ? s2 : s1;
      else {
        c = Math.floor((x - scx + 64 * ap) / (ap * 1.4)) % 4 === 0 ? s2 : s1;
        if (y > sTop + ap * 1.6) c = c.map(v => v * 0.8); // the fold underneath
        else if (y < sTop + ap * 0.7) c = c.map(v => Math.min(255, v * 1.12));
      }
      const i = f.px(k);
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
  }

  // ------------------------------------------------------------------ the sheet
  function winterize(src, opt) {
    opt = opt || {};
    const cols = opt.cols || 1, rows = opt.rows || 1;
    const W = src.width, Hh = src.height;
    const c = new OffscreenCanvas(W, Hh), g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, 0, 0);
    const img = g.getImageData(0, 0, W, Hh), d = img.data;
    const fw = Math.floor(W / cols), fh = Math.floor(Hh / rows);
    const ap = opt.ap || Math.max(2, fh / 64);

    // the sprite's outline ink: the average very dark colour
    let ink = [34, 28, 40];
    {
      let n = 0, sr = 0, sg = 0, sb = 0;
      for (let i = 0; i < d.length; i += 4 * 7) if (d[i + 3] > 200 && lum(d[i], d[i + 1], d[i + 2]) < 45) { sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; n++; }
      if (n > 20) ink = [sr / n, sg / n, sb / n];
    }

    const frames = [];
    for (let q = 0; q < rows; q++) for (let p = 0; p < cols; p++) { const f = Frame(d, W, p * fw, q * fh, fw, fh, ap); if (f) frames.push(f); }
    if (!frames.length) return c;

    // pass 1: one skin tone for the whole sheet, from the clearest face
    let tone = null;
    for (const f of frames) { const t = faceTone(f); if (t && (!tone || t.n > tone.n)) tone = t; }
    // seen only from behind (a seated pose facing away): take the tone from the neck and hands instead
    if (!tone) {
      const hist = new Map();
      for (const f of frames) for (let k = 0; k < f.N; k++) {
        if (!skinish(f, k)) continue;
        const key = (Math.round(f.H[k] / 4) << 8) | Math.round(f.S[k] * 20);
        const e = hist.get(key) || { n: 0, h: 0, s: 0, v: 0 };
        e.n++; e.h += f.H[k]; e.s += f.S[k]; e.v += f.V[k]; hist.set(key, e);
      }
      let best = null;
      for (const e of hist.values()) if (!best || e.n > best.n) best = e;
      tone = best && best.n > ap * ap * 3 ? { h: best.h / best.n, s: best.s / best.n, v: best.v / best.n, n: 0 } : { h: -999, s: 0, v: 2, n: 0 };
    }
    const isSkin = skinOf(tone);
    // pass 2: heads. Chins are noisy on single frames (beards, sunglasses), so each frame uses the
    // median for its view; that also keeps the scarf from jittering while someone walks.
    const groupOf = v => (v === 'left' || v === 'right' ? 'side' : v);
    const med = arr => { if (!arr.length) return null; const a = arr.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
    const byGroup = (fn) => {
      const m = { front: [], side: [], back: [] };
      for (const f of frames) { const v = fn(f); if (v != null) m[groupOf(f.info.view)].push(v); }
      const all = [].concat(m.front, m.side, m.back);
      const out = {};
      for (const k of Object.keys(m)) out[k] = med(m[k]) ?? med(k === 'back' ? m.side.concat(m.front) : all);
      return out;
    };
    for (const f of frames) f.info = locateHead(f, isSkin);
    const chinOff = byGroup(f => (f.info.chin >= 0 ? f.info.chin - f.t : null));
    const neckDx = byGroup(f => (f.info.chin >= 0 ? f.info.neckCx - f.info.hcx : null));
    const neckW = byGroup(f => (f.info.chin >= 0 ? f.info.neckW : null));
    for (const f of frames) {
      const gk = groupOf(f.info.view);
      f.chin = f.t + Math.round(chinOff[gk] ?? 16 * ap);
      f.cx = Math.round(f.info.hcx + (neckDx[gk] ?? 0));
      f.neckW = neckW[gk] || 0;
    }
    // the cloth colour on the chest: most votes across the frames
    const votes = new Map();
    for (const f of frames) {
      if (f.info.view === 'back') continue;
      const cc = chestColour(f, isSkin, f.chin, f.cx);
      if (!cc) continue;
      const key = qkey(cc.rgb[0], cc.rgb[1], cc.rgb[2]);
      const e = votes.get(key) || { n: 0, r: 0, g: 0, b: 0 };
      e.n += cc.n; e.r += cc.rgb[0] * cc.n; e.g += cc.rgb[1] * cc.n; e.b += cc.rgb[2] * cc.n;
      votes.set(key, e);
    }
    // nobody faces us in this image: let the back views vote
    if (!votes.size) for (const f of frames) {
      const cc = chestColour(f, isSkin, f.chin, f.cx);
      if (!cc) continue;
      const key = qkey(cc.rgb[0], cc.rgb[1], cc.rgb[2]);
      const e = votes.get(key) || { n: 0, r: 0, g: 0, b: 0 };
      e.n += cc.n; e.r += cc.rgb[0] * cc.n; e.g += cc.rgb[1] * cc.n; e.b += cc.rgb[2] * cc.n;
      votes.set(key, e);
    }
    let gv = null;
    for (const e of votes.values()) if (!gv || e.n > gv.n) gv = e;
    // skin brightness, to shade what used to be bare skin
    let sl = 0, sn = 0;
    for (const f of frames) for (let k = 0; k < f.N; k += 3) if (isSkin(f, k)) { const i = f.px(k); sl += lum(d[i], d[i + 1], d[i + 2]); sn++; }
    const garment = gv ? [gv.r / gv.n, gv.g / gv.n, gv.b / gv.n] : null;
    const sheet = { isSkin, garment, isCloth: clothTest(garment, isSkin), skinL: sn ? sl / sn : 170 };
    // pass 3: where the scarf sits, again one line per view; then the top below it
    const scarfOff = byGroup(f => { const y = scarfLine(f, sheet); return y == null ? null : y - f.t; });
    for (const f of frames) {
      const off = scarfOff[groupOf(f.info.view)];
      const hgt = f.b - f.t, standing = hgt > 44 * ap;
      const lo = standing ? hgt * 0.27 : 15 * ap, hi = standing ? hgt * 0.52 : 24 * ap;
      f.sBot = f.t + Math.round(Math.max(lo, Math.min(hi, off != null ? off : f.chin - f.t + 2.6 * ap)));
      f.cloth = cloth(f, sheet);
    }
    // pass 4: dress every frame
    for (const f of frames) dress(f, sheet, ink, opt.debug);
    g.putImageData(img, 0, 0);
    return c;
  }

  root.pxfWinterize = winterize;
}

pxfWardrobeModule(window);

// ---------------------------------------------------------------- cache + worker
// Dressing a sprite sheet takes a few hundred ms, so it runs in a worker (when the page allows one),
// one image at a time, and each result is kept for the rest of the visit as a blob: URL.
window.pxfWardrobe = (function () {
  'use strict';
  const done = new Map();    // original url -> dressed blob url (or null if it failed)
  const orig = new Map();    // dressed blob url -> original url
  const queue = [];
  const waiting = new Set();
  const POOL = Math.min(3, Math.max(1, (navigator.hardwareConcurrency || 2) - 1));
  let workers = null;        // [{ w, busy }] once started; [] if the page won't allow workers
  let inlineBusy = false;

  // frames are 1:2 and every sheet has four rows (one per direction); stills are one frame
  const layout = (w, h, still) => (still ? { cols: 1, rows: 1 } : { cols: Math.max(1, Math.round(w / (h / 4 / 2))), rows: 4 });

  function startWorkers() {
    workers = [];
    let url;
    try {
      const src = pxfWardrobeModule.toString() + `
        pxfWardrobeModule(self);
        self.onmessage = async (e) => {
          const { url, still, artCss, cssH } = e.data;
          try {
            const r = await fetch(url, { mode: 'cors', credentials: 'omit' });
            if (!r.ok) throw new Error(String(r.status));
            const bm = await createImageBitmap(await r.blob());
            const L = (${layout.toString()})(bm.width, bm.height, still);
            const ap = (bm.height / L.rows) / cssH * artCss;
            const out = self.pxfWinterize(bm, { cols: L.cols, rows: L.rows, ap });
            self.postMessage({ url, blob: await out.convertToBlob({ type: 'image/png' }) });
          } catch (err) { self.postMessage({ url, error: String((err && err.message) || err) }); }
        };`;
      url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      for (let i = 0; i < POOL; i++) {
        const slot = { w: new Worker(url), busy: false, job: null };
        slot.w.onmessage = e => { slot.busy = false; slot.job = null; finish(e.data.url, e.data.blob || null); };
        // a worker that can't start (the page may not allow it) hands its job back and retires;
        // with none left, the main thread takes over
        slot.w.onerror = () => {
          const i = workers.indexOf(slot); if (i >= 0) workers.splice(i, 1);
          if (slot.job) queue.unshift(slot.job);
          pump();
        };
        workers.push(slot);
      }
    } catch (e) { workers = []; }
  }

  // fallback when workers aren't allowed: the main thread, one image at a time
  async function inline(job) {
    inlineBusy = true;
    try {
      const r = await fetch(job.url, { mode: 'cors', credentials: 'omit' });
      const bm = await createImageBitmap(await r.blob());
      const L = layout(bm.width, bm.height, job.still);
      const out = window.pxfWinterize(bm, { cols: L.cols, rows: L.rows, ap: (bm.height / L.rows) / job.cssH * job.artCss });
      inlineBusy = false;
      finish(job.url, await out.convertToBlob({ type: 'image/png' }));
    } catch (e) { inlineBusy = false; finish(job.url, null); }
  }

  function finish(url, blob) {
    waiting.delete(url);
    const u = blob ? URL.createObjectURL(blob) : null;
    done.set(url, u);
    if (u) orig.set(u, url);
    setTimeout(pump, 30);
  }

  function pump() {
    if (!workers) startWorkers();
    while (queue.length) {
      const slot = workers.find(s => !s.busy);
      if (slot) {
        const job = queue.shift();
        slot.busy = true; slot.job = job;
        slot.w.postMessage({ url: job.url, still: job.still, artCss: job.artCss, cssH: job.cssH });
      } else if (!workers.length && !inlineBusy) {
        inline(queue.shift());
        return;
      } else return;
    }
  }

  return {
    // The dressed version of a sprite image, or null while it's still being made.
    // still: a single pose; cssH: the height of one frame on screen; first: jump the queue.
    get(url, opt) {
      opt = opt || {};
      if (!url || orig.has(url)) return null;
      if (done.has(url)) return done.get(url);
      if (!waiting.has(url)) {
        waiting.add(url);
        const job = { url, still: !!opt.still, cssH: opt.cssH || 144, artCss: 2.25 };
        if (opt.first) queue.unshift(job); else queue.push(job);
        pump();
      }
      return null;
    },
    originalOf: url => orig.get(url) || url,
    isDressed: url => orig.has(url),
    // handy in DevTools
    stats: () => ({ dressed: orig.size, failed: [...done.values()].filter(v => !v).length, queued: queue.length, workers: workers ? workers.length : 0 })
  };
})();
