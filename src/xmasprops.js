/* Christmas props for a 1:1 pixel-art canvas. The caller scales the canvas. */
(function () {
  'use strict';

  var OUTLINE = '#2e2433';

  function pixel(ctx, x, y, w, h, color) {
    if (w <= 0 || h <= 0) return;
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function shadow(ctx, x, y, rx, ry) {
    ctx.fillStyle = 'rgba(46,36,51,0.17)';
    ctx.beginPath();
    ctx.ellipse(Math.round(x), Math.round(y), Math.round(rx), Math.round(ry), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function clamp(value, low, high, fallback) {
    value = Number(value);
    return Math.max(low, Math.min(high, Math.round(Number.isFinite(value) ? value : fallback)));
  }

  function color(value, fallback) {
    if (typeof value !== 'string') return fallback;
    if (/^#[0-9a-f]{3}$/i.test(value)) {
      return '#' + value.slice(1).split('').map(function (c) { return c + c; }).join('');
    }
    return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  }

  function shade(hex, amount) {
    var n = parseInt(hex.slice(1), 16);
    var parts = [n >> 16 & 255, n >> 8 & 255, n & 255];
    return '#' + parts.map(function (channel) {
      var shifted = amount < 0 ? channel * (1 + amount) : channel + (255 - channel) * amount;
      return Math.round(Math.max(0, Math.min(255, shifted))).toString(16).padStart(2, '0');
    }).join('');
  }

  function drawTree(ctx, cx, cy, opt) {
    opt = opt || {};
    cx = Math.round(cx); cy = Math.round(cy);
    var phase = Number(opt.phase) || 0;
    shadow(ctx, cx, cy - 1, 28, 5);

    // Trunk and woven red stand sit behind the lowest boughs.
    pixel(ctx, cx - 5, cy - 19, 10, 17, OUTLINE);
    pixel(ctx, cx - 4, cy - 18, 8, 15, '#6d3e35');
    pixel(ctx, cx - 3, cy - 18, 3, 14, '#aa6845');
    pixel(ctx, cx + 2, cy - 17, 1, 12, '#4b3036');
    pixel(ctx, cx - 9, cy - 9, 18, 9, OUTLINE);
    pixel(ctx, cx - 8, cy - 8, 16, 7, '#8b393e');
    pixel(ctx, cx - 8, cy - 8, 16, 2, '#c66b58');
    pixel(ctx, cx - 7, cy - 4, 14, 1, '#5c303b');
    pixel(ctx, cx - 6, cy - 6, 1, 5, '#d69b6f');
    pixel(ctx, cx - 1, cy - 6, 1, 5, '#d69b6f');
    pixel(ctx, cx + 4, cy - 6, 1, 5, '#d69b6f');

    var tiers = [
      { top: -79, bottom: -54, half: 11 },
      { top: -67, bottom: -38, half: 18 },
      { top: -51, bottom: -22, half: 23 },
      { top: -35, bottom: -9, half: 28 }
    ];
    tiers.forEach(function (tier, t) {
      var height = tier.bottom - tier.top;
      for (var row = 0; row <= height; row++) {
        var fraction = row / height;
        var half = Math.max(2, Math.round(2 + (tier.half - 2) * fraction));
        // One-pixel notches make the bough edges irregular rather than triangular.
        if (row > 4 && row < height - 2 && row % 7 === (t * 2) % 7) half -= 2;
        var y = cy + tier.top + row;
        pixel(ctx, cx - half, y, half * 2 + 1, 1, OUTLINE);
        if (half > 1) {
          pixel(ctx, cx - half + 1, y, half * 2 - 1, 1, '#31745c');
          pixel(ctx, cx + Math.round(half * 0.1), y, Math.max(1, Math.round(half * 0.8)), 1, '#1d554b');
          if (row > 2 && row < height - 1) {
            pixel(ctx, cx - half + 2, y, Math.max(1, Math.round(half * 0.65)), 1, '#5b9d6c');
          }
          if (row > 7 && row % 6 === 1) {
            pixel(ctx, cx - half + 3, y, 3, 1, '#9bc581');
          }
        }
      }
      // Small hanging points give each tier a layered, pine-needle edge.
      var edgeY = cy + tier.bottom + 1;
      [-0.7, -0.28, 0.19, 0.65].forEach(function (v, i) {
        var bx = cx + Math.round(v * tier.half);
        pixel(ctx, bx - 1, edgeY, 3, i % 2 ? 1 : 2, OUTLINE);
        pixel(ctx, bx, edgeY, 1, 1, '#245b4d');
      });
    });

    // The garland follows the visible fronts of the four stacked tiers.
    var garlands = [
      { y: -61, half: 8 }, { y: -45, half: 14 },
      { y: -29, half: 19 }, { y: -14, half: 24 }
    ];
    var lightColors = ['#ffe7a0', '#f3a1a0', '#a8dbeb', '#fff8dc'];
    var lightIndex = 0;
    garlands.forEach(function (line, tierIndex) {
      for (var j = -line.half; j <= line.half; j += 2) {
        var dip = Math.round(3 * (1 - Math.abs(j) / line.half));
        var gy = cy + line.y + dip;
        pixel(ctx, cx + j, gy, 2, 1, '#b99355');
        if ((j + line.half) % 6 < 2) {
          var twinkle = Math.sin(phase * (1.1 + (lightIndex % 4) * 0.13) + lightIndex * 2.4);
          var lit = twinkle > -0.35;
          pixel(ctx, cx + j, gy - 1, 1, 1, lit ? lightColors[lightIndex % 4] : '#6d7768');
          if (twinkle > 0.72) pixel(ctx, cx + j + 1, gy - 2, 1, 1, '#fff8df');
          lightIndex++;
        }
      }
    });

    var ornaments = [
      [-3, -70, '#c94e50'], [6, -59, '#e9bd64'], [-11, -51, '#94c5dc'],
      [10, -47, '#f5e9d9'], [-5, -39, '#d35b58'], [17, -32, '#e9bd64'],
      [-17, -30, '#f3e8dd'], [3, -26, '#9ac5db'], [-11, -18, '#e9bd64'],
      [11, -17, '#d35955'], [-22, -12, '#9cc9dd'], [21, -12, '#f2e7d7']
    ];
    ornaments.forEach(function (o) {
      pixel(ctx, cx + o[0] - 1, cy + o[1] - 1, 4, 4, OUTLINE);
      pixel(ctx, cx + o[0], cy + o[1], 2, 2, o[2]);
      pixel(ctx, cx + o[0], cy + o[1], 1, 1, '#fff4d9');
    });

    // Nine-pixel star, gently alternating between two warm golds.
    var gold = Math.sin(phase * 1.7) > 0 ? '#ffd876' : '#edb958';
    pixel(ctx, cx - 1, cy - 90, 3, 2, OUTLINE);
    pixel(ctx, cx - 1, cy - 88, 3, 1, gold);
    pixel(ctx, cx - 5, cy - 87, 11, 2, OUTLINE);
    pixel(ctx, cx - 4, cy - 86, 9, 1, gold);
    pixel(ctx, cx - 3, cy - 85, 7, 3, OUTLINE);
    pixel(ctx, cx - 2, cy - 85, 5, 2, gold);
    pixel(ctx, cx - 3, cy - 82, 2, 3, OUTLINE);
    pixel(ctx, cx + 2, cy - 82, 2, 3, OUTLINE);
    pixel(ctx, cx - 2, cy - 83, 5, 1, '#fff1ad');
    pixel(ctx, cx - 2, cy - 82, 1, 2, gold);
    pixel(ctx, cx + 2, cy - 82, 1, 2, gold);
  }

  function drawGift(ctx, cx, cy, opt) {
    opt = opt || {};
    cx = Math.round(cx); cy = Math.round(cy);
    var w = clamp(opt.w, 8, 18, 12);
    var h = clamp(opt.h, 7, 16, 10);
    var box = color(opt.box, '#bd5b55');
    var ribbon = color(opt.ribbon, '#ead078');
    var x = cx - Math.floor(w / 2);
    var y = cy - h;
    var cross = x + Math.floor(w / 2);
    shadow(ctx, cx, cy, Math.ceil(w / 2) + 2, 3);
    pixel(ctx, x - 1, y - 1, w + 2, h + 1, OUTLINE);
    pixel(ctx, x, y, w, h - 1, box);
    pixel(ctx, x, y, w, 2, shade(box, 0.28));
    pixel(ctx, x + w - 3, y + 2, 3, h - 3, shade(box, -0.25));
    pixel(ctx, x, cy - 3, w, 2, shade(box, -0.15));
    pixel(ctx, x + 1, y + 2, 1, Math.max(1, h - 5), shade(box, 0.18));

    // Both bands have a shaded edge, including the visible top of the box.
    pixel(ctx, cross - 2, y, 4, h - 1, shade(ribbon, -0.28));
    pixel(ctx, cross - 1, y, 2, h - 1, ribbon);
    pixel(ctx, cross - 1, y + 1, 1, Math.max(1, h - 3), shade(ribbon, 0.32));
    pixel(ctx, x, y + Math.max(3, Math.round(h * 0.43)), w, 3, shade(ribbon, -0.28));
    pixel(ctx, x, y + Math.max(3, Math.round(h * 0.43)), w - 2, 2, ribbon);
    pixel(ctx, x + 1, y + Math.max(3, Math.round(h * 0.43)), w - 4, 1, shade(ribbon, 0.35));

    pixel(ctx, cross - 5, y - 4, 4, 4, OUTLINE);
    pixel(ctx, cross + 1, y - 4, 4, 4, OUTLINE);
    pixel(ctx, cross - 4, y - 3, 3, 2, shade(ribbon, 0.2));
    pixel(ctx, cross + 1, y - 3, 3, 2, shade(ribbon, -0.1));
    pixel(ctx, cross - 1, y - 3, 2, 3, OUTLINE);
    pixel(ctx, cross - 1, y - 2, 2, 1, shade(ribbon, 0.42));
  }

  function drawSantaHat(ctx, cx, cy, opt) {
    opt = opt || {};
    cx = Math.round(cx); cy = Math.round(cy);
    var flip = !!opt.flip;
    function hat(x, y, w, h, ink) {
      pixel(ctx, flip ? cx - x - w : cx + x, cy + y, w, h, ink);
    }
    // The cap arches left and drops into a small, dangling pom.
    hat(-7, -5, 14, 5, OUTLINE);
    hat(-7, -8, 12, 4, OUTLINE);
    hat(-6, -11, 9, 4, OUTLINE);
    hat(-5, -13, 6, 3, OUTLINE);
    hat(-7, -14, 4, 4, OUTLINE);
    hat(-9, -11, 4, 3, OUTLINE);
    hat(-6, -12, 5, 3, '#bd474b');
    hat(-5, -12, 2, 2, '#e26b5f');
    hat(-6, -10, 8, 4, '#c84c4f');
    hat(-5, -9, 3, 3, '#ed796b');
    hat(-7, -7, 11, 4, '#bd444a');
    hat(2, -7, 3, 4, '#8c3541');
    hat(-5, -6, 5, 2, '#e56a5e');
    hat(-9, -10, 4, 3, '#f4f1e8');
    hat(-8, -10, 2, 1, '#ffffff');
    hat(-9, -8, 4, 1, '#bfd0d6');
    // Fur brim is centered on the supplied head position.
    hat(-9, -4, 18, 5, OUTLINE);
    hat(-8, -3, 16, 3, '#e4eaeb');
    hat(-7, -3, 13, 1, '#ffffff');
    hat(-7, -1, 14, 1, '#b8cbd0');
    hat(-6, 0, 4, 1, '#d5e1e2');
    hat(3, 0, 3, 1, '#d5e1e2');
  }

  function drawSnowPile(ctx, cx, cy, opt) {
    opt = opt || {};
    cx = Math.round(cx); cy = Math.round(cy);
    var w = clamp(opt.w, 20, 90, 44);
    var h = clamp(opt.h, 6, 26, 13);
    var phase = Number(opt.phase) || 0;
    shadow(ctx, cx, cy, Math.round(w * 0.46), 3);
    var lefts = [];
    var rights = [];
    for (var row = 0; row < h; row++) {
      var yy = row / Math.max(1, h - 1);
      var widest = Math.round((w / 2 - 1) * Math.sqrt(1 - Math.pow(1 - yy, 2)));
      var lump = row < h - 2 ? Math.round(Math.sin(row * 0.7) * Math.min(2, w / 18)) : 0;
      var half = Math.max(2, Math.min(Math.floor(w / 2) - 1, widest + lump));
      var left = cx - half;
      var right = cx + half;
      lefts.push(left); rights.push(right);
      pixel(ctx, left, cy - h + row, right - left + 1, 1, OUTLINE);
    }
    for (var r = 1; r < h - 1; r++) {
      var sx = lefts[r] + 1;
      var ex = rights[r] - 1;
      var y = cy - h + r;
      pixel(ctx, sx, y, ex - sx + 1, 1, r > h * 0.7 ? '#d1dfe2' : '#e7f0ed');
      pixel(ctx, sx, y, Math.max(1, Math.round((ex - sx) * 0.6)), 1,
        r < h * 0.45 ? '#fffdf3' : '#f4f8f3');
      pixel(ctx, Math.max(sx, ex - Math.max(1, Math.round(w * 0.13))), y,
        Math.min(ex - sx + 1, Math.max(1, Math.round(w * 0.13))), 1, '#b8cbd2');
      if (r > 2 && lefts[r] < lefts[r - 1]) {
        pixel(ctx, lefts[r] + 2, y, Math.min(4, lefts[r - 1] - lefts[r] + 1), 1, '#ffffff');
      }
    }
    // A little cool underside separates the drift from the floor.
    pixel(ctx, cx - Math.floor(w * 0.28), cy - 2, Math.round(w * 0.53), 1, '#a8bec8');
    [-0.28, 0.08, 0.32].forEach(function (portion, i) {
      var twinkle = Math.sin(phase * (1.3 + i * 0.17) + i * 2.8);
      if (twinkle > -0.1) {
        var px = cx + Math.round(w * portion);
        var py = cy - Math.round(h * (i === 1 ? 0.49 : 0.27));
        pixel(ctx, px, py, 1, 1, twinkle > 0.68 ? '#ffffff' : '#dbece9');
        if (twinkle > 0.78) pixel(ctx, px - 1, py, 1, 1, '#ffffff');
      }
    });
  }

  function drawPawPrint(ctx, cx, cy, opt) {
    opt = opt || {};
    cx = Math.round(cx); cy = Math.round(cy);
    var base = color(opt.color, '#b8cbd2');
    var dark = shade(base, -0.24);
    var light = shade(base, 0.38);
    // Four separate toe pixels and a small heart-shaped central pad.
    pixel(ctx, cx - 3, cy - 2, 1, 1, dark);
    pixel(ctx, cx - 1, cy - 3, 1, 1, base);
    pixel(ctx, cx + 1, cy - 3, 1, 1, light);
    pixel(ctx, cx + 3, cy - 2, 1, 1, dark);
    pixel(ctx, cx - 2, cy, 5, 3, OUTLINE);
    pixel(ctx, cx - 1, cy, 3, 2, base);
    pixel(ctx, cx - 1, cy, 1, 1, light);
    pixel(ctx, cx + 1, cy + 1, 1, 1, dark);
  }

  // Floppy Santa hat. A stiff cone rises from the fur brim, and its soft tip hangs off the top
  // like a pendulum. `angle` is the tip's angle in radians from straight up (positive leans
  // right, about ±2.1 hangs down behind the head); the caller animates it. Each shape is drawn
  // once per 4°, snapped to the palette, shaded and outlined, then cached.
  var FLEX_W = 32, FLEX_H = 32, FLEX_OX = 16, FLEX_OY = 26;
  var FLEX_STEP = Math.PI / 45;
  var FLEX_PAL = [
    ['red', '#c84c4f'], ['redL', '#ed796b'], ['redD', '#8c3541'],
    ['fur', '#e4eaeb'], ['furL', '#ffffff'], ['furD', '#b8cbd0']
  ];
  var FLEX_TOP = { red: 'redL', fur: 'furL' };
  var FLEX_BOT = { red: 'redD', redL: 'red', fur: 'furD', furL: 'fur' };
  var flexFrames = {};

  function hexRgb(h) { return [1, 3, 5].map(function (i) { return parseInt(h.slice(i, i + 2), 16); }); }

  function buildFlexHat(a) {
    var cv = document.createElement('canvas');
    cv.width = FLEX_W; cv.height = FLEX_H;
    var g = cv.getContext('2d', { willReadFrequently: true });
    g.setTransform(1, 0, 0, 1, FLEX_OX, FLEX_OY);
    var col = {};
    FLEX_PAL.forEach(function (p) { col[p[0]] = p[1]; });
    function dot(x, y, r, c) { g.fillStyle = col[c]; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }

    // centreline: from the brim, up through the stiff cone, over into the hanging tip
    var L = 10.5, P = [Math.sin(a) * 1.8, -10.5];
    var T = [P[0] + Math.sin(a) * L, P[1] - Math.cos(a) * L];
    var S = [0, -1], C = [P[0] * 1.4, -18];
    var N = 26, pts = [];
    for (var i = 0; i <= N; i++) {
      var t = i / N, u = 1 - t;
      pts.push([u * u * S[0] + 2 * u * t * C[0] + t * t * T[0], u * u * S[1] + 2 * u * t * C[1] + t * t * T[1]]);
    }
    g.save();
    g.beginPath(); g.rect(-FLEX_OX, -FLEX_OY, FLEX_W, FLEX_OY - 0.5); g.clip();
    for (i = 0; i <= N; i++) dot(pts[i][0], pts[i][1], 5.8 * Math.pow(1 - i / N, 1.25) + 1.1, 'red');
    g.restore();

    // fur brim and pompom
    g.fillStyle = col.fur;
    g.fillRect(-8, -3, 16, 4);
    g.fillRect(-7, -4, 14, 1);
    g.fillStyle = col.furD;
    [[-5, -1], [-1, -2], [3, -1], [6, -2]].forEach(function (p) { g.fillRect(p[0], p[1], 1, 1); });
    dot(T[0], T[1], 2.6, 'fur');
    dot(T[0] - 0.8, T[1] - 0.8, 0.9, 'furL');

    // snap to the palette, light the tops, shade the undersides, outline the outside
    var img = g.getImageData(0, 0, FLEX_W, FLEX_H), px = img.data, n = FLEX_W * FLEX_H;
    var keys = FLEX_PAL.map(function (p) { return p[0]; });
    var rgb = FLEX_PAL.map(function (p) { return hexRgb(p[1]); });
    var ink = hexRgb(OUTLINE);
    var idx = new Int8Array(n).fill(-1), j, o;
    for (i = 0; i < n; i++) {
      o = i * 4;
      if (px[o + 3] < 120) continue;
      var best = 0, bd = Infinity;
      for (j = 0; j < rgb.length; j++) {
        var e = Math.pow(px[o] - rgb[j][0], 2) + Math.pow(px[o + 1] - rgb[j][1], 2) + Math.pow(px[o + 2] - rgb[j][2], 2);
        if (e < bd) { bd = e; best = j; }
      }
      idx[i] = best;
    }
    var shade = Int8Array.from(idx);
    for (i = 0; i < n; i++) {
      if (idx[i] < 0) continue;
      var y = Math.floor(i / FLEX_W), name = keys[idx[i]];
      var up = y > 0 ? idx[i - FLEX_W] : -1, dn = y < FLEX_H - 1 ? idx[i + FLEX_W] : -1;
      if (up < 0 && FLEX_TOP[name]) shade[i] = keys.indexOf(FLEX_TOP[name]);
      else if (dn < 0 && FLEX_BOT[name]) shade[i] = keys.indexOf(FLEX_BOT[name]);
    }
    for (i = 0; i < n; i++) {
      o = i * 4;
      if (shade[i] >= 0) { var c = rgb[shade[i]]; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255; continue; }
      var x = i % FLEX_W, yy = Math.floor(i / FLEX_W);
      var near = (yy > 0 && shade[i - FLEX_W] >= 0) || (yy < FLEX_H - 1 && shade[i + FLEX_W] >= 0) ||
        (x > 0 && shade[i - 1] >= 0) || (x < FLEX_W - 1 && shade[i + 1] >= 0);
      if (near) { px[o] = ink[0]; px[o + 1] = ink[1]; px[o + 2] = ink[2]; px[o + 3] = 255; } else px[o + 3] = 0;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.putImageData(img, 0, 0);
    return cv;
  }

  function drawSantaHatFlex(ctx, cx, cy, opt) {
    var a = Number(opt && opt.angle);
    if (!Number.isFinite(a)) a = -2.1;
    var step = Math.round(Math.max(-2.7, Math.min(2.7, a)) / FLEX_STEP);
    var frame = flexFrames[step] || (flexFrames[step] = buildFlexHat(step * FLEX_STEP));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(frame, Math.round(cx) - FLEX_OX, Math.round(cy) - FLEX_OY);
  }

  var props = {
    drawTree: drawTree,
    drawGift: drawGift,
    drawSantaHat: drawSantaHat,
    drawSantaHatFlex: drawSantaHatFlex,
    drawSnowPile: drawSnowPile,
    drawPawPrint: drawPawPrint
  };
  if (typeof window !== 'undefined') Object.assign(window, props);
  if (typeof module !== 'undefined' && module.exports) module.exports = props;
})();

/*
 * Tree: four shaded pine tiers with ornaments, twinkling garland, and a pulsing star.
 * Gift: a shaded wrapped box with crossed ribbon and a small bow.
 * Santa hat: a flopped red cap with a centered fur brim and pom.
 * Snow pile: a stepped, cool-shaded drift with blinking sparkles.
 * Paw print: four tiny toes and a shaded central cat pad.
 */
