/* Pocket Christmas Floor: the cat.
   A small rigged quadruped. Each pose lays out a body, head, four jointed legs and a tail as
   shapes, rasterises them onto a 1 px grid, snaps every pixel to a fixed palette, then adds rim
   light, underside shade and a coloured outline. Frames are cached, so the work runs once per
   pose rather than once per animation frame.

   window.drawCatRig(ctx, x, y, opt) draws with the context's current transform, where one unit
   is one cat pixel. (x, y) is the point on the floor under the cat. Returns { top }: the highest
   point of the head (or hat), relative to y, in cat pixels.

   opt: dir 'down'|'up'|'left'|'right', walk, phase (radians, one stride per 2π), idle (seconds
   standing still), time (seconds, for idle tail and breathing), blink, hop, sleeping, hat, coat,
   peek (while sleeping: -1 or 1 opens one eye, looking left or right on screen). */
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;
  const W = 88, H = 70, OX = 44, OY = 60; // frame size and floor point, in cat pixels
  const INK = '#3a2216';

  // ---------------------------------------------------------------- colour
  const parse = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const hex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const A = parse(a), B = parse(b); return hex(A.map((v, i) => v + (B[i] - v) * t)); };
  const valid = (h, d) => (typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h) ? h.toLowerCase() : d);

  const palettes = new Map();
  function paletteFor(coat) {
    coat = coat || {};
    const sig = [coat.fur, coat.stripe, coat.belly, coat.ear, coat.eye, coat.nose].join(',');
    let P = palettes.get(sig);
    if (P) return P;
    const fur = valid(coat.fur, '#d98a45');
    const stripe = valid(coat.stripe, '#a9581f');
    const cream = valid(coat.belly, '#f4e2c4');
    P = {
      fur,
      furL: mix(fur, '#ffeccc', 0.42),
      furD: mix(fur, '#5a2810', 0.3),
      furF: mix(fur, '#4a2412', 0.45), // far-side legs, in shadow
      stripe,
      stripeD: mix(stripe, '#3a1a0c', 0.38),
      cream,
      creamL: mix(cream, '#ffffff', 0.55),
      creamD: mix(cream, '#a8794e', 0.35),
      ear: valid(coat.ear, '#e29b93'),
      iris: valid(coat.eye, '#b7b445'),
      pupil: '#22150d',
      glint: '#fffbea',
      nose: valid(coat.nose, '#d27378'),
      line: mix(fur, INK, 0.62),
      hat: '#c8382e',
      hatL: '#e65a45',
      hatD: '#8e231f',
      trim: '#f8f2e9',
      trimD: '#d3c6b8'
    };
    const keys = Object.keys(P);
    P.keys = keys;
    P.rgb = keys.map(k => parse(P[k]));
    P.edge = keys.map(k => parse(mix(P[k], INK, 0.72)));
    P.index = {};
    keys.forEach((k, i) => { P.index[k] = i; });
    // rim light where a pixel has nothing above it, shade where it has nothing below
    P.top = { fur: 'furL', furD: 'fur', furF: 'furD', cream: 'creamL', hat: 'hatL' };
    P.bot = { fur: 'furD', furL: 'fur', furD: 'furF', cream: 'creamD', creamL: 'cream', stripe: 'stripeD', hat: 'hatD', trim: 'trimD' };
    P.sig = sig;
    palettes.set(sig, P);
    return P;
  }

  // ---------------------------------------------------------------- pen
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  function pen(g, P) {
    const col = k => P[k] || k;
    const d = {
      ell(x, y, rx, ry, k, rot) { g.fillStyle = col(k); g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, TAU); g.fill(); },
      poly(pts, k) {
        g.fillStyle = col(k); g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
        g.closePath(); g.fill();
      },
      line(pts, w, k) {
        g.strokeStyle = col(k); g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
        g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
        g.stroke();
      },
      arc(cx, cy, rx, ry, a0, a1, w, k) {
        g.strokeStyle = col(k); g.lineWidth = w; g.lineCap = 'round';
        g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, a0, a1); g.stroke();
      },
      // pixel-exact detail (eyes, nose, stripes); the transform is an integer translate
      px(x, y, w, h, k) { g.fillStyle = col(k); g.fillRect(Math.round(x), Math.round(y), w, h); },
      // a short band across a limb, for tabby leg stripes
      bar(a, b, t, w, k) {
        const p = lerp(a, b, t), dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
        const nx = (-dy / L) * w / 2, ny = (dx / L) * w / 2;
        d.line([[p[0] - nx, p[1] - ny], [p[0] + nx, p[1] + ny]], 1.3, k);
      },
      clip(shapes, fn) {
        g.save(); g.beginPath();
        for (const s of shapes) {
          const r = s[4] || 0;
          g.moveTo(s[0] + s[2] * Math.cos(r), s[1] + s[2] * Math.sin(r));
          g.ellipse(s[0], s[1], s[2], s[3], r, 0, TAU);
        }
        g.clip(); fn(); g.restore();
      },
      // a tapering tail along a cubic curve, with tabby rings and a dark tip
      tail(p0, p1, p2, p3, w0, w1, rings) {
        const N = 28, pts = [];
        for (let i = 0; i <= N; i++) {
          const t = i / N, u = 1 - t;
          pts.push([
            u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
            u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
          ]);
        }
        for (let i = 0; i <= N; i++) {
          const t = i / N, w = w0 + (w1 - w0) * t;
          d.ell(pts[i][0], pts[i][1], w / 2, w / 2, t > 0.84 ? 'stripeD' : 'fur');
        }
        for (const rt of rings || []) {
          const i = Math.round(rt * N), a = pts[Math.max(0, i - 1)], b = pts[Math.min(N, i + 1)];
          d.bar(a, b, 0.5, w0 + (w1 - w0) * rt + 0.6, 'stripe');
        }
      }
    };
    return d;
  }

  // ---------------------------------------------------------------- rig
  // two-bone reach: the middle joint bends toward -x (backwards for a cat facing right)
  function ik(a, b, l1, l2) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const dd = Math.min(Math.hypot(dx, dy), l1 + l2 - 0.01);
    const c = (l1 * l1 + dd * dd - l2 * l2) / (2 * l1 * dd);
    const k = Math.atan2(dy, dx) + Math.acos(Math.max(-1, Math.min(1, c)));
    return [a[0] + Math.cos(k) * l1, a[1] + Math.sin(k) * l1];
  }
  // a trot: the paw is planted for 60% of the stride and swings forward for the rest
  function gait(t, off, S, lift) {
    if (t == null) return { x: 0, y: 0, up: false };
    const u = (((t - off) % 1) + 1) % 1;
    if (u < 0.6) return { x: S * (0.5 - u / 0.6), y: 0, up: false };
    const k = (u - 0.6) / 0.4;
    return { x: S * (-0.5 + (0.5 - 0.5 * Math.cos(Math.PI * k))), y: -lift * Math.sin(Math.PI * k), up: true };
  }
  const bobOf = t => (t == null ? 0 : Math.sin(t * TAU * 2) > 0.2 ? -1 : 0);

  // wob swings the soft tip and pompom with the stride (and the idle tail sway)
  function hat(d, x, y, flop, wob) {
    wob = wob || 0;
    const tx = x + flop * 6.8 + wob, ty = y - 8.2 + Math.abs(wob) * 0.5;
    d.poly([[x - 4.2, y], [x + 4.2, y], [x + flop * 2.5 + wob * 0.35, y - 5.5], [tx, ty], [x + flop * 0.5 + wob * 0.3, y - 6.8]], 'hat');
    d.ell(x, y, 5.2, 1.8, 'trim');
    d.ell(tx + flop * 0.4, ty, 2.2, 2.2, 'trim');
    return y - 11;
  }

  function frontLeg(d, S, F, k, near) {
    const E = ik(S, F, 8.5, 8);
    if (near) {
      d.line([lerp(S, E, 0.6), E], 6.2, 'line'); d.line([E, F], 5.2, 'line');
      d.ell(F[0] + 1, F[1], 3.4, 2.4, 'line');
    }
    d.line([S, E], 4.4, k); d.line([E, F], 3.4, k);
    if (near) { d.bar(S, E, 0.8, 4.4, 'stripe'); d.bar(E, F, 0.3, 3.4, 'stripe'); }
    d.ell(F[0] + 1, F[1], 2.5, 1.5, near ? 'furL' : k);
  }
  function hindLeg(d, K, F, k, near, thigh) {
    const J = ik(K, F, 7, 6.5);
    if (near) {
      d.line([K, J], 6.2, 'line'); d.line([J, F], 5.2, 'line');
      d.ell(F[0] + 1, F[1], 3.4, 2.4, 'line');
    }
    d.line([K, J], 4.4, k); d.line([J, F], 3.4, k);
    if (near && thigh) {
      d.ell(thigh[0], thigh[1], 6.5, 7, 'fur');
      d.line([[thigh[0] - 3, thigh[1] - 5.5], [thigh[0] - 1, thigh[1] - 1], [thigh[0] - 2, thigh[1] + 3]], 1.4, 'stripe');
      d.arc(thigh[0], thigh[1], 6.5, 7, -0.7, 1.15, 1, 'line');
      d.bar(J, F, 0.35, 3.4, 'stripe');
    }
    d.ell(F[0] + 1, F[1], 2.5, 1.5, near ? 'furL' : k);
  }

  // ---------------------------------------------------------------- heads
  function eyePair(d, x1, x2, y, blink) {
    for (const x of [x1, x2]) {
      if (blink) { d.px(x, y + 1, 3, 1, 'line'); continue; }
      d.px(x, y - 1, 3, 1, 'line');
      d.px(x, y, 3, 2, 'iris');
      d.px(x + 1, y, 1, 2, 'pupil');
      d.px(x, y, 1, 1, 'glint');
    }
  }
  function headSide(d, hx, hy, o) {
    d.poly([[hx - 6, hy - 3], [hx - 5, hy - 10], [hx - 1.5, hy - 4.5]], 'furD');
    d.ell(hx, hy, 6.5, 6, 'fur');
    d.ell(hx + 1, hy + 3, 5.6, 3.6, 'fur');
    d.ell(hx + 5.5, hy + 2.4, 3.1, 2.6, 'fur');
    d.ell(hx + 5, hy + 4.3, 3.2, 1.6, 'cream');
    d.ell(hx + 6.4, hy + 2.4, 1.8, 1.6, 'cream');
    d.ell(hx + 1, hy + 5, 4, 1.4, 'cream');
    d.px(hx - 2, hy - 6, 1, 3, 'stripe'); d.px(hx, hy - 6, 1, 2, 'stripe'); d.px(hx - 4, hy - 5, 1, 2, 'stripe');
    d.line([[hx, hy + 1.5], [hx - 4, hy + 2.5]], 1, 'stripe');
    d.line([[hx, hy - 0.5], [hx - 4.5, hy - 0.5]], 1, 'stripe');
    let top = hy - 11;
    if (o.hat) top = Math.min(top, hat(d, hx - 1, hy - 5.5, -1, o.sw));
    d.poly([[hx - 2, hy - 4.5], [hx + 1, hy - 11], [hx + 4, hy - 4]], 'fur');
    d.poly([[hx - 0.4, hy - 5], [hx + 1, hy - 9], [hx + 2.6, hy - 5]], 'ear');
    if (o.blink) d.px(hx + 1, hy - 1, 4, 1, 'line');
    else { d.px(hx + 1, hy - 3, 4, 1, 'line'); d.px(hx + 1, hy - 2, 3, 2, 'iris'); d.px(hx + 2, hy - 2, 1, 2, 'pupil'); d.px(hx + 3, hy - 2, 1, 1, 'glint'); }
    d.px(hx + 7, hy, 2, 1, 'nose');
    d.px(hx + 6, hy + 3, 2, 1, 'line');
    return top;
  }
  function headFront(d, hx, hy, o) {
    for (const s of [-1, 1]) {
      d.poly([[hx + s * 7.6, hy - 2.5], [hx + s * 6.8, hy - 11], [hx + s * 2.2, hy - 5.5]], 'fur');
      d.poly([[hx + s * 6.4, hy - 4], [hx + s * 6, hy - 9], [hx + s * 3.6, hy - 5.5]], 'ear');
    }
    d.ell(hx, hy, 7.5, 6.5, 'fur');
    d.ell(hx, hy + 3, 8.3, 4, 'fur');
    d.ell(hx - 1.7, hy + 3.3, 2.4, 1.8, 'cream');
    d.ell(hx + 1.7, hy + 3.3, 2.4, 1.8, 'cream');
    d.ell(hx, hy + 5, 2.2, 1.3, 'cream');
    d.px(hx - 1, hy - 6, 2, 3, 'stripe'); d.px(hx - 3, hy - 5, 1, 2, 'stripe'); d.px(hx + 2, hy - 5, 1, 2, 'stripe');
    d.px(hx - 8, hy + 1, 2, 1, 'stripe'); d.px(hx + 6, hy + 1, 2, 1, 'stripe');
    d.px(hx - 8, hy + 3, 2, 1, 'stripe'); d.px(hx + 6, hy + 3, 2, 1, 'stripe');
    eyePair(d, hx - 5, hx + 2, hy - 1, o.blink);
    d.px(hx - 1, hy + 1, 2, 1, 'nose');
    d.px(hx - 1, hy + 3, 2, 1, 'line');
    let top = hy - 11;
    if (o.hat) top = Math.min(top, hat(d, hx, hy - 5.5, 1, o.sw));
    return top;
  }
  function headBack(d, hx, hy, o) {
    for (const s of [-1, 1]) d.poly([[hx + s * 6.6, hy - 2], [hx + s * 5.8, hy - 10.5], [hx + s * 1.8, hy - 4.5]], 'fur');
    d.ell(hx, hy, 6.5, 6, 'fur');
    d.ell(hx, hy + 2.5, 7.3, 3.6, 'fur');
    d.px(hx - 1, hy - 6, 2, 4, 'stripe'); d.px(hx - 4, hy - 4, 1, 3, 'stripe'); d.px(hx + 3, hy - 4, 1, 3, 'stripe');
    d.px(hx - 6, hy + 1, 2, 1, 'stripe'); d.px(hx + 4, hy + 1, 2, 1, 'stripe');
    let top = hy - 10.5;
    if (o.hat) top = Math.min(top, hat(d, hx, hy - 5, -1, o.sw));
    return top;
  }

  // ---------------------------------------------------------------- poses (side poses face right)
  function walkSide(d, o) {
    const t = o.t, b = bobOf(t), S = 14, L = 3.2;
    const gNF = gait(t, 0, S, L), gFH = gait(t, 0, S, L), gFF = gait(t, 0.5, S, L), gNH = gait(t, 0.5, S, L);
    frontLeg(d, [12.5, -16 + b], [13 + gFF.x, -1.5 + gFF.y], 'furF', false);
    hindLeg(d, [-7 + gFH.x * 0.35, -12 + b], [-10 + gFH.x, -1.5 + gFH.y], 'furF', false);
    const sw = o.sw;
    d.tail([-18, -21 + b], [-25, -23 + b], [-27 + sw * 0.5, -35 + b], [-22 + sw, -41 + b], 4, 2.6, [0.3, 0.47, 0.62, 0.76]);
    const body = [[-12, -17.5 + b, 8.5, 8.5], [-2, -18.5 + b, 11, 6.5], [9, -18 + b, 7.5, 7.5], [-6, -12.5 + b, 6, 2.6], [14.5, -23 + b, 5, 6.5, -0.5]];
    for (const e of body) d.ell(e[0], e[1], e[2], e[3], 'fur', e[4]);
    d.clip(body, () => {
      d.ell(0, -11 + b, 10, 1.9, 'cream');
      d.ell(16, -19 + b, 3, 5.5, 'cream');
      for (const x of [-17, -12.5, -8, -3.5, 1, 5.5]) d.line([[x + 1, -26 + b], [x, -21 + b], [x + 0.8, -16.5 + b]], 1.6, 'stripe');
      d.line([[-19, -24.6 + b], [-12, -25.3 + b], [-2, -24.4 + b], [8, -24.9 + b], [12.5, -26.5 + b]], 2.2, 'stripeD');
    });
    hindLeg(d, [-9 + gNH.x * 0.35, -12 + b], [-12 + gNH.x, -1.5 + gNH.y], 'fur', true, [-11.5, -16 + b]);
    frontLeg(d, [10, -16 + b], [11 + gNF.x, -1.5 + gNF.y], 'fur', true);
    return { top: headSide(d, 20, -30 + b, o), shadow: 16 };
  }

  function walkFront(d, o) {
    const t = o.t, b = bobOf(t), S = 14, L = 3;
    const gFL = gait(t, 0, S, L), gHR = gait(t, 0, S, L), gFR = gait(t, 0.5, S, L), gHL = gait(t, 0.5, S, L);
    const fy = gg => gg.x * 0.42 + gg.y * 0.9; // toward the viewer is down the screen
    d.tail([3, -16 + b], [10, -18 + b], [13.5 + o.sw * 0.5, -27 + b], [10.5 + o.sw, -33 + b], 3.8, 2.6, [0.38, 0.56, 0.72]);
    for (const [s, gg] of [[-1, gHL], [1, gHR]]) {
      const paw = [s * 6.5, -4 + fy(gg)];
      d.line([[s * 6.5, -11 + b], paw], 3.4, 'furF');
      d.ell(paw[0], paw[1], 2.3, 1.4, 'furF');
    }
    d.ell(-6, -13.5 + b, 4.2, 5, 'furD'); d.ell(6, -13.5 + b, 4.2, 5, 'furD');
    d.ell(0, -15 + b, 6.4, 6.8, 'fur');
    d.clip([[0, -15 + b, 6.4, 6.8]], () => d.ell(0, -12.5 + b, 3.8, 5.5, 'cream'));
    const legs = [[-1, gFL], [1, gFR]].map(([s, gg]) => ({ S: [s * 3.5, -12 + b], F: [s * 3.5, -1 + fy(gg)] }));
    for (const l of legs) { d.line([[l.S[0], l.S[1] + 4], l.F], 6, 'line'); d.ell(l.F[0], l.F[1], 3.4, 2.4, 'line'); }
    for (const l of legs) { d.line([l.S, l.F], 4.2, 'fur'); d.bar(l.S, l.F, 0.5, 4.2, 'stripe'); d.ell(l.F[0], l.F[1], 2.5, 1.5, 'furL'); }
    return { top: headFront(d, 0, -27 + b, o), shadow: 11 };
  }

  function walkBack(d, o) {
    const t = o.t, b = bobOf(t), S = 14, L = 3;
    const gFL = gait(t, 0, S, L), gHR = gait(t, 0, S, L), gFR = gait(t, 0.5, S, L), gHL = gait(t, 0.5, S, L);
    const fy = gg => -gg.x * 0.42 + gg.y * 0.9; // away from the viewer is up the screen
    for (const [s, gg] of [[-1, gFL], [1, gFR]]) {
      const paw = [s * 4, -8 + fy(gg)];
      d.line([[s * 4, -13 + b], paw], 3.4, 'furF');
      d.ell(paw[0], paw[1], 2.2, 1.3, 'furF');
    }
    const top = headBack(d, 0, -29 + b, o);
    const body = [[0, -22 + b, 7.5, 5], [0, -17 + b, 8.5, 9]];
    for (const e of body) d.ell(e[0], e[1], e[2], e[3], 'fur');
    d.clip(body, () => {
      for (const y of [-23, -19.5, -16, -12.5]) d.line([[-8, y + 1.6 + b], [-4, y + b], [0, y - 0.5 + b], [4, y + b], [8, y + 1.6 + b]], 1.5, 'stripe');
      d.line([[0, -26 + b], [0, -9 + b]], 2, 'stripeD');
    });
    const hind = [[-1, gHL], [1, gHR]].map(([s, gg]) => ({ s, gg, K: [s * 6, -6 + b], F: [s * 6.3, -1 + fy(gg) * 0.8] }));
    for (const h of hind) { d.line([h.K, h.F], 6, 'line'); d.ell(h.F[0], h.F[1], 3.4, 2.4, 'line'); }
    for (const s of [-1, 1]) d.ell(s * 5.5, -9.5 + b, 5.5, 6.5, 'fur');
    d.clip([[-5.5, -9.5 + b, 5.5, 6.5], [5.5, -9.5 + b, 5.5, 6.5]], () => {
      for (const s of [-1, 1]) d.arc(s * 5.5, -9.5 + b, 3.5, 4.2, s < 0 ? 2.4 : -0.9, s < 0 ? 4.0 : 0.7, 1.4, 'stripe');
    });
    for (const h of hind) {
      d.line([h.K, h.F], 4.2, 'fur');
      d.ell(h.F[0], h.F[1], 2.5, 1.5, 'furL');
      if (h.gg.up) d.px(h.F[0] - 1, h.F[1], 2, 1, 'nose');
    }
    d.tail([0.5, -8 + b], [2.5, -16 + b], [9 + o.sw * 0.5, -21 + b], [11.5 + o.sw, -30 + b], 4, 2.6, [0.3, 0.5, 0.68]);
    return { top, shadow: 11 };
  }

  function sitFront(d, o) {
    for (const s of [-1, 1]) d.ell(s * 7.5, -7, 6, 7, 'fur');
    d.tail([8, -5], [11.5, 0.5], [3, 1.6], [-5 + o.sw, 0.2], 3.6, 2.6, [0.25, 0.5, 0.72]);
    d.ell(0, -14, 8, 10, 'fur');
    d.clip([[0, -14, 8, 10]], () => {
      d.ell(0, -15, 4.6, 7.5, 'cream');
      for (const s of [-1, 1]) {
        d.line([[s * 7.5, -19], [s * 5.8, -16], [s * 6.8, -12]], 1.5, 'stripe');
        d.line([[s * 8, -14], [s * 6.3, -11], [s * 7.2, -7]], 1.5, 'stripe');
      }
    });
    d.clip([[-7.5, -7, 6, 7], [7.5, -7, 6, 7]], () => {
      for (const s of [-1, 1]) d.arc(s * 8.5, -7, 3.5, 4, s < 0 ? 2.2 : -1.2, s < 0 ? 4.3 : 0.9, 1.4, 'stripe');
    });
    const legs = [-1, 1].map(s => ({ S: [s * 3, -15], F: [s * 3, -1.5] }));
    for (const l of legs) { d.line([[l.S[0], -10], l.F], 6, 'line'); d.ell(l.F[0], -1, 3.4, 2.4, 'line'); }
    for (const l of legs) { d.line([l.S, l.F], 4, 'fur'); d.bar(l.S, l.F, 0.62, 4, 'stripe'); d.bar(l.S, l.F, 0.85, 4, 'stripe'); d.ell(l.F[0], -1, 2.6, 1.6, 'furL'); }
    return { top: headFront(d, 0, -29, o), shadow: 12 };
  }

  function sitSide(d, o) {
    d.line([[8.5, -13], [9.5, -1.5]], 3.4, 'furF');
    d.ell(10.5, -1, 2.3, 1.4, 'furF');
    d.tail([-13, -4], [-19.5, -2], [-12, 1.6], [-2 + o.sw, 0.6], 3.6, 2.6, [0.22, 0.45, 0.68]);
    const body = [[-6, -8, 9, 8], [2, -14.5, 6.5, 10, 0.35], [6.5, -17, 5.5, 7], [9.5, -23, 4.6, 6, -0.3]];
    for (const e of body) d.ell(e[0], e[1], e[2], e[3], 'fur', e[4]);
    d.clip(body, () => {
      d.ell(9.8, -17, 2.8, 6.5, 'cream');
      d.line([[0, -22], [-1, -17], [0, -12]], 1.6, 'stripe');
      d.line([[3.5, -23.5], [2.5, -19]], 1.6, 'stripe');
      d.line([[-3.5, -18], [-5, -13]], 1.6, 'stripe');
      d.arc(-6, -8, 5.5, 5, -2.7, -0.4, 1.5, 'stripe');
      d.arc(-6, -8, 2.6, 2.3, -2.9, 0.2, 1.4, 'stripe');
      d.line([[-10.5, -2], [-14.5, -4]], 1.5, 'stripe');
    });
    d.ell(-6, -8, 7.5, 6.8, 'fur');
    d.arc(-6, -8, 2.8, 2.5, -3.0, 0.3, 1.4, 'stripe');
    d.arc(-6, -8, 5.4, 5, -2.5, -0.6, 1.4, 'stripe');
    d.arc(-6, -8, 7.5, 6.8, -0.6, 1.4, 1, 'line');
    d.ell(-1, -1.4, 5, 1.7, 'line');
    d.ell(-1, -1.4, 4.3, 1.4, 'fur');
    d.ell(3, -1.2, 2.4, 1.5, 'furL');
    d.line([[6, -9], [6.5, -1.5]], 6, 'line'); d.ell(7.5, -1, 3.4, 2.4, 'line');
    d.line([[6, -14], [6.5, -1.5]], 4, 'fur');
    d.bar([6, -14], [6.5, -1.5], 0.6, 4, 'stripe'); d.bar([6, -14], [6.5, -1.5], 0.82, 4, 'stripe');
    d.ell(7.5, -1, 2.6, 1.5, 'furL');
    return { top: headSide(d, 12, -31, o), shadow: 14 };
  }

  function sitBack(d, o) {
    for (const s of [-1, 1]) d.ell(s * 10.5, -1, 2.5, 1.4, 'furL');
    for (const s of [-1, 1]) d.ell(s * 7, -7, 6.5, 7, 'fur');
    const body = [[0, -14, 8, 10.5], [0, -21, 7, 5]];
    for (const e of body) d.ell(e[0], e[1], e[2], e[3], 'fur');
    d.clip(body.concat([[-7, -7, 6.5, 7], [7, -7, 6.5, 7]]), () => {
      for (const y of [-21, -17.5, -14, -10.5]) d.line([[-8.5, y + 1.6], [-4, y], [0, y - 0.5], [4, y], [8.5, y + 1.6]], 1.5, 'stripe');
      d.line([[0, -25], [0, -4]], 2, 'stripeD');
      for (const s of [-1, 1]) d.arc(s * 8, -6, 3.5, 4, s < 0 ? 2.3 : -1.0, s < 0 ? 4.1 : 0.8, 1.4, 'stripe');
    });
    const top = headBack(d, 0, -30, o);
    d.tail([1, -2.5], [8, 1.4], [14, 0], [15 + o.sw, -5], 3.6, 2.6, [0.25, 0.5, 0.72]);
    return { top, shadow: 12 };
  }

  function sleepPose(d, o) {
    const br = o.breath ? 0.6 : 0;
    const body = [[-2, -11 - br / 2, 19, 10.5 + br], [-10, -12.5 - br / 2, 10, 9.5 + br]];
    for (const e of body) d.ell(e[0], e[1], e[2], e[3], 'fur');
    d.clip(body, () => {
      for (const x of [-18, -13, -8, -3, 2]) d.line([[x + 1.5, -22], [x, -15], [x + 1, -9]], 1.8, 'stripe');
      d.arc(-2, -11, 17.5, 9.5, Math.PI * 1.08, Math.PI * 1.9, 2.2, 'stripeD');
      d.arc(-10, -12.5, 6, 5.5, 3.6, 5.6, 1.5, 'stripe');
    });
    for (const s of [-1, 1]) {
      d.poly([[10 + s * 5, -15.5], [10 + s * 5.6, -23.5], [10 + s * 1, -17.5]], 'fur');
      d.poly([[10 + s * 4.3, -16.5], [10 + s * 4.8, -21.5], [10 + s * 2.4, -17.5]], 'ear');
    }
    d.ell(10, -12, 8, 7, 'fur');
    d.ell(10, -9, 8.6, 4, 'fur');
    d.ell(8.3, -8.5, 2.4, 1.7, 'cream'); d.ell(11.7, -8.5, 2.4, 1.7, 'cream');
    d.px(9, -18, 2, 3, 'stripe'); d.px(7, -17, 1, 2, 'stripe'); d.px(12, -17, 1, 2, 'stripe');
    d.px(2, -11, 2, 1, 'stripe'); d.px(16, -11, 2, 1, 'stripe');
    d.px(6, -12, 3, 1, 'line');
    // one eye opens to check on whoever is walking past; the pupil looks their way
    if (o.peek) { d.px(12, -14, 3, 1, 'line'); d.px(12, -13, 3, 2, 'iris'); d.px(13 + o.peek, -13, 1, 2, 'pupil'); }
    else d.px(12, -12, 3, 1, 'line');
    d.px(9, -10, 2, 1, 'nose');
    let top = -23.5;
    if (o.hat) top = Math.min(top, hat(d, 10, -18, -1));
    for (const x of [6, 13]) { d.ell(x, -3.5, 3.6, 2.5, 'line'); }
    for (const x of [6, 13]) { d.ell(x, -3.5, 3, 1.8, 'furL'); }
    d.tail([-20, -6], [-21.5, 1.2], [-5, 2.4], [12, 0.8], 4.6, 3.2, [0.2, 0.38, 0.55, 0.72]);
    return { top, shadow: 20 };
  }

  // ---------------------------------------------------------------- rasterise
  function finish(g, P) {
    const img = g.getImageData(0, 0, W, H), px = img.data, n = W * H;
    const idx = new Int16Array(n).fill(-1);
    const rgb = P.rgb, m = rgb.length;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      if (px[o + 3] < 120) continue;
      let best = 0, bd = Infinity;
      for (let j = 0; j < m; j++) {
        const c = rgb[j], dr = px[o] - c[0], dg = px[o + 1] - c[1], db = px[o + 2] - c[2];
        const e = dr * dr * 3 + dg * dg * 4 + db * db * 2;
        if (e < bd) { bd = e; best = j; }
      }
      idx[i] = best;
    }
    const keys = P.keys, I = P.index, shaded = Int16Array.from(idx);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x, v = idx[i];
        if (v < 0) continue;
        const k = keys[v];
        const up = y > 0 ? idx[i - W] : -1, dn = y < H - 1 ? idx[i + W] : -1;
        if (up < 0 && P.top[k]) shaded[i] = I[P.top[k]];
        else if (dn < 0 && P.bot[k]) shaded[i] = I[P.bot[k]];
      }
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x, o = i * 4, v = shaded[i];
        if (v >= 0) { const c = rgb[v]; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255; continue; }
        const nb = (y > 0 ? shaded[i - W] : -1) >= 0 ? shaded[i - W]
          : (y < H - 1 ? shaded[i + W] : -1) >= 0 ? shaded[i + W]
          : (x > 0 ? shaded[i - 1] : -1) >= 0 ? shaded[i - 1]
          : (x < W - 1 ? shaded[i + 1] : -1) >= 0 ? shaded[i + 1] : -1;
        if (nb >= 0) { const c = P.edge[nb]; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255; }
        else px[o + 3] = 0;
      }
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.putImageData(img, 0, 0);
  }

  function build(P, pose, view, o) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.setTransform(1, 0, 0, 1, OX, OY);
    const d = pen(g, P);
    let r;
    if (pose === 'sleep') r = sleepPose(d, o);
    else if (view === 'side') r = pose === 'sit' ? sitSide(d, o) : walkSide(d, o);
    else if (view === 'down') r = pose === 'sit' ? sitFront(d, o) : walkFront(d, o);
    else r = pose === 'sit' ? sitBack(d, o) : walkBack(d, o);
    finish(g, P);
    return { canvas: cv, top: Math.floor(r.top) - 1, shadow: r.shadow };
  }

  // ---------------------------------------------------------------- draw
  const cache = new Map();
  const SWAY = [0, 1, 2, 1, 0, -1];

  function shadow(ctx, x, y, rx) {
    ctx.fillStyle = 'rgba(42, 26, 18, 0.2)';
    ctx.fillRect(x - rx, y - 1, rx * 2, 2);
    ctx.fillRect(x - rx + 3, y - 2, rx * 2 - 6, 1);
    ctx.fillRect(x - rx + 3, y + 1, rx * 2 - 6, 1);
  }
  function zzz(ctx, x, y, time) {
    for (let i = 0; i < 3; i++) {
      const k = (time * 0.6 + i / 3) % 1, s = 3 + Math.round(k * 2);
      const zx = Math.round(x + 16 + k * 8), zy = Math.round(y - 26 - k * 16);
      ctx.globalAlpha = Math.sin(k * Math.PI) * 0.9;
      for (const [c, oy] of [['#4a2c1c', 1], ['#fff7ea', 0]]) {
        ctx.fillStyle = c;
        ctx.fillRect(zx, zy + oy, s, 1);
        for (let j = 1; j < s - 1; j++) ctx.fillRect(zx + s - 1 - j, zy + j + oy, 1, 1);
        ctx.fillRect(zx, zy + s - 1 + oy, s, 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawCatRig(ctx, x, y, opt) {
    opt = opt || {};
    const P = paletteFor(opt.coat);
    const dir = /^(up|left|right)$/.test(opt.dir) ? opt.dir : 'down';
    const view = dir === 'left' || dir === 'right' ? 'side' : dir;
    const time = Number(opt.time) || 0;
    const pose = opt.sleeping ? 'sleep' : opt.walk ? 'walk' : (Number(opt.idle) || 0) < 0.35 ? 'stand' : 'sit';
    let f = 0, sw = 0, breath = 0;
    if (pose === 'walk') {
      const t = ((((Number(opt.phase) || 0) / TAU) % 1) + 1) % 1;
      f = Math.floor(t * 8) % 8;
      sw = Math.round(Math.sin((f / 8) * TAU) * 1.5);
    } else if (pose === 'sleep') breath = Math.floor(time * 0.8) % 2;
    else sw = SWAY[Math.floor(time * 2.2) % SWAY.length];
    const blink = opt.blink > 0 && pose !== 'sleep' ? 1 : 0;
    const hatOn = opt.hat ? 1 : 0;
    // peek is given on screen; a cat facing left is drawn flipped, so its eyes look the other way
    const peek = pose === 'sleep' ? Math.sign(Number(opt.peek) || 0) * (dir === 'left' ? -1 : 1) : 0;
    const key = [P.sig, pose, view, f, sw, breath, blink, hatOn, peek].join('|');
    let fr = cache.get(key);
    if (!fr) {
      fr = build(P, pose, view, { t: pose === 'walk' ? f / 8 : null, sw, breath, blink, hat: !!hatOn, peek });
      cache.set(key, fr);
      if (cache.size > 320) cache.delete(cache.keys().next().value);
    }
    const hop = Math.max(0, Math.round(Number(opt.hop) || 0));
    x = Math.round(x); y = Math.round(y);
    ctx.imageSmoothingEnabled = false;
    shadow(ctx, x, y, fr.shadow);
    if (dir === 'left') {
      ctx.save(); ctx.translate(x, 0); ctx.scale(-1, 1);
      ctx.drawImage(fr.canvas, -OX, y - OY - hop);
      ctx.restore();
    } else {
      ctx.drawImage(fr.canvas, x - OX, y - OY - hop);
    }
    if (pose === 'sleep' && !peek) zzz(ctx, x, y, time);
    return { top: fr.top - hop };
  }

  root.drawCatRig = drawCatRig;
})(typeof window !== 'undefined' ? window : globalThis);
