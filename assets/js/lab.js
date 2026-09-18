/* Laboratório interativo do topo da página.
   - Regressão linear: a reta é ajustada por gradiente descendente sobre o MSE.
     Clique adiciona pontos; arrastar (mouse/caneta) move um ponto e o modelo se reajusta.
   - K-means (k = 3): passos de atribuição e atualização animados, com as regiões
     de decisão e a trajetória de cada centroide.
   Respeita prefers-reduced-motion (mostra o resultado final sem animar) e pausa
   quando o gráfico sai da tela. */
(() => {
  'use strict';

  const root = document.querySelector('[data-lab]');
  if (!root) return;
  const canvas = root.querySelector('[data-lab-canvas]');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const readout = root.querySelector('[data-lab-readout]');
  const hint = root.querySelector('[data-lab-hint]');
  const codeEl = root.querySelector('[data-lab-code]');
  const tabs = Array.from(root.querySelectorAll('[data-lab-mode]'));
  let T = {};
  try { T = JSON.parse(root.dataset.text || '{}'); } catch (e) { T = {}; }

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const DEC = T.decimal || '.';
  const CODE = { regression: 'LinearRegression().fit(X, y)', kmeans: 'KMeans(n_clusters=3).fit(X)' };
  const PAD = { l: 16, r: 16, t: 16, b: 16 };
  const LR = 0.35;
  const STEPS_PER_FRAME = 1;
  const MAX_REG_POINTS = 60;
  const MAX_KM_POINTS = 240;

  // ---------- utilitários ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeOut = (u) => 1 - Math.pow(1 - u, 3);
  const easeInOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
  const randn = () => {
    let u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '–').replace('.', DEC).replace(/^-/, '−');
  const last = (arr) => arr[arr.length - 1];
  const now = () => performance.now();

  let W = 0, H = 0, dpr = 1;
  const sx = (x) => PAD.l + x * (W - PAD.l - PAD.r);
  const sy = (y) => H - PAD.b - y * (H - PAD.t - PAD.b);
  const ix = (px) => (px - PAD.l) / (W - PAD.l - PAD.r);
  const iy = (py) => (H - PAD.b - py) / (H - PAD.t - PAD.b);

  // ---------- cores (tokens do CSS; mudam com o tema) ----------
  let C = {};
  let SERIES = [];
  const hexToRgb = (hex) => {
    const h = hex.replace('#', '').trim();
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const n = parseInt(full, 16);
    return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [128, 128, 128];
  };
  const readColors = () => {
    const cs = getComputedStyle(root);
    const g = (name) => cs.getPropertyValue(name).trim();
    C = {
      surface: g('--chart-surface'), grid: g('--chart-grid'), axis: g('--chart-axis'),
      text: g('--chart-text'), ink: g('--text'), muted: g('--muted'),
      c1: g('--c1'), c2: g('--c2'), c3: g('--c3'),
      mono: g('--font-mono') || 'monospace',
    };
    SERIES = [C.c1, C.c2, C.c3];
  };

  // ---------- estado ----------
  let mode = 'regression';
  const reg = { pts: [], w: 0, b: 0, epoch: 0, loss: [], converged: false, startAt: 0 };
  const km = { pts: [], cents: [], trails: [], k: 3, iter: 0, phase: 'assign', phaseT: 0, from: null, to: null, inertia: [], converged: false, startAt: 0 };
  const ripples = [];
  let drag = null;
  let hoverPt = null;
  let downAt = null;

  // ---------- regressão ----------
  function regGenerate() {
    const n = 20;
    const slope = 0.45 + Math.random() * 0.3;
    const icpt = 0.1 + Math.random() * 0.14;
    const t0 = now();
    reg.pts = [];
    for (let i = 0; i < n; i++) {
      const x = 0.06 + ((i + Math.random()) / n) * 0.88;
      const y = clamp(icpt + slope * x + randn() * 0.075, 0.04, 0.96);
      reg.pts.push({ x, y, born: reduce.matches ? 0 : t0 + i * 22 });
    }
    reg.startAt = reduce.matches ? 0 : t0 + n * 22 + 150;
    regResetModel();
  }
  function regResetModel() {
    reg.w = -0.45; reg.b = 0.8; reg.epoch = 0; reg.loss = []; reg.converged = false;
  }
  function regStep() {
    const n = reg.pts.length;
    if (!n) { reg.converged = true; return; }
    let gw = 0, gb = 0, sse = 0;
    for (const p of reg.pts) {
      const e = reg.w * p.x + reg.b - p.y;
      gw += e * p.x; gb += e; sse += e * e;
    }
    gw = (2 * gw) / n; gb = (2 * gb) / n;
    reg.w -= LR * gw; reg.b -= LR * gb; reg.epoch += 1;
    reg.loss.push(sse / n);
    if (reg.loss.length > 300) reg.loss.shift();
    if (Math.hypot(gw, gb) < 2e-4) reg.converged = true;
  }
  function regStats() {
    const n = reg.pts.length;
    if (!n) return { r2: NaN, rmse: 0 };
    let my = 0;
    for (const p of reg.pts) my += p.y;
    my /= n;
    let sse = 0, sst = 0;
    for (const p of reg.pts) {
      const e = p.y - (reg.w * p.x + reg.b);
      sse += e * e; sst += (p.y - my) * (p.y - my);
    }
    return { r2: sst > 0 ? 1 - sse / sst : NaN, rmse: Math.sqrt(sse / n) };
  }

  // ---------- k-means ----------
  function kmGenerate() {
    const centers = [];
    let tries = 0;
    while (centers.length < km.k && tries++ < 800) {
      const c = { x: 0.16 + Math.random() * 0.68, y: 0.18 + Math.random() * 0.64 };
      if (centers.every((d) => Math.hypot(d.x - c.x, d.y - c.y) > 0.34)) centers.push(c);
    }
    const t0 = now();
    km.pts = [];
    centers.forEach((c) => {
      const n = 28 + Math.floor(Math.random() * 10);
      const s = 0.055 + Math.random() * 0.03;
      for (let i = 0; i < n; i++) {
        km.pts.push({ x: clamp(c.x + randn() * s, 0.03, 0.97), y: clamp(c.y + randn() * s, 0.03, 0.97), c: -1, born: 0 });
      }
    });
    km.pts.sort(() => Math.random() - 0.5);
    km.pts.forEach((p, i) => { p.born = reduce.matches ? 0 : t0 + i * 4; });
    km.startAt = reduce.matches ? 0 : t0 + km.pts.length * 4 + 200;
    kmInit();
  }
  function kmInit() {
    // Centroides em posições aleatórias (não em pontos), para o movimento ficar visível.
    km.cents = [];
    let tries = 0;
    while (km.cents.length < km.k && tries++ < 800) {
      const c = { x: 0.12 + Math.random() * 0.76, y: 0.12 + Math.random() * 0.76 };
      if (km.cents.every((d) => Math.hypot(d.x - c.x, d.y - c.y) > 0.22)) km.cents.push(c);
    }
    while (km.cents.length < km.k) km.cents.push({ x: Math.random(), y: Math.random() });
    km.trails = km.cents.map((c) => [{ x: c.x, y: c.y }]);
    km.pts.forEach((p) => { p.c = -1; });
    km.iter = 0; km.inertia = []; km.converged = false;
    km.phase = 'assign'; km.phaseT = Math.max(now(), km.startAt);
  }
  function kmAssign() {
    let changed = 0, inertia = 0;
    for (const p of km.pts) {
      let best = 0, bd = Infinity;
      km.cents.forEach((c, j) => {
        const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
        if (d < bd) { bd = d; best = j; }
      });
      if (p.c !== best) { p.c = best; changed += 1; }
      inertia += bd;
    }
    km.inertia.push(inertia);
    return changed;
  }
  function kmMeans() {
    return km.cents.map((c, j) => {
      let x = 0, y = 0, n = 0;
      for (const p of km.pts) if (p.c === j) { x += p.x; y += p.y; n += 1; }
      if (n) return { x: x / n, y: y / n };
      // Cluster vazio: reposiciona no ponto mais distante do seu centroide atual
      let far = km.pts[0], fd = -1;
      for (const p of km.pts) {
        const q = km.cents[p.c] || c;
        const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
        if (d > fd) { fd = d; far = p; }
      }
      return far ? { x: far.x, y: far.y } : { x: c.x, y: c.y };
    });
  }
  // Avança a animação do k-means; devolve true enquanto houver algo acontecendo
  function kmUpdate(t) {
    if (km.converged || !km.pts.length) return false;
    if (km.phase === 'assign') {
      if (t < km.phaseT + (km.iter === 0 ? 450 : 320)) return true;
      const changed = kmAssign();
      if (changed === 0 && km.iter > 0) { km.converged = true; return false; }
      km.from = km.cents.map((c) => ({ x: c.x, y: c.y }));
      km.to = kmMeans();
      km.phase = 'move'; km.phaseT = t;
      return true;
    }
    const u = Math.min(1, (t - km.phaseT) / 650);
    const e = easeInOut(u);
    km.cents = km.from.map((f, j) => ({ x: f.x + (km.to[j].x - f.x) * e, y: f.y + (km.to[j].y - f.y) * e }));
    if (u >= 1) {
      km.trails.forEach((tr, j) => tr.push({ x: km.cents[j].x, y: km.cents[j].y }));
      km.iter += 1; km.phase = 'assign'; km.phaseT = t;
    }
    return true;
  }
  // Sem animação: roda até convergir (prefers-reduced-motion)
  function settle() {
    if (mode === 'regression') {
      let guard = 0;
      while (!reg.converged && guard++ < 5000) regStep();
    } else {
      let guard = 0;
      while (!km.converged && guard++ < 60) {
        const changed = kmAssign();
        if (changed === 0 && km.iter > 0) { km.converged = true; break; }
        km.cents = kmMeans();
        km.trails.forEach((tr, j) => tr.push({ x: km.cents[j].x, y: km.cents[j].y }));
        km.iter += 1;
      }
    }
  }

  // ---------- desenho ----------
  function line(x0, y0, x1, y1) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }

  function appear(p, t) {
    if (!p.born) return 1;
    return easeOut(clamp((t - p.born) / 280, 0, 1));
  }

  function drawPoint(x, y, color, r, a) {
    if (a <= 0) return;
    ctx.globalAlpha = a;
    ctx.beginPath(); ctx.arc(x, y, r + 2, 0, Math.PI * 2); ctx.fillStyle = C.surface; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawFrame() {
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1;
    ctx.strokeStyle = C.grid;
    for (let i = 1; i < 4; i++) {
      const gx = Math.round(sx(i / 4)) + 0.5;
      const gy = Math.round(sy(i / 4)) + 0.5;
      line(gx, sy(0), gx, sy(1));
      line(sx(0), gy, sx(1), gy);
    }
    ctx.strokeStyle = C.axis;
    const ax = Math.round(sx(0)) + 0.5;
    const ay = Math.round(sy(0)) + 0.5;
    line(ax, sy(1), ax, ay);
    line(ax, ay, sx(1), ay);
    ctx.fillStyle = C.text;
    ctx.font = `500 11px ${C.mono}`;
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'right';
    ctx.fillText('x', sx(1), ay - 4);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('y', ax + 5, sy(1));
  }

  function drawRipples(t) {
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      const u = (t - r.t) / 650;
      if (u >= 1) { ripples.splice(i, 1); continue; }
      ctx.globalAlpha = (1 - u) * 0.6;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx(r.x), sy(r.y), 5 + easeOut(u) * 22, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawRegression(t) {
    const { rmse } = regStats();
    const y0 = reg.b, y1 = reg.w + reg.b;
    ctx.save();
    ctx.beginPath(); ctx.rect(sx(0), sy(1), sx(1) - sx(0), sy(0) - sy(1)); ctx.clip();
    if (reg.pts.length > 1) {
      ctx.globalAlpha = 0.13;
      ctx.fillStyle = C.c1;
      ctx.beginPath();
      ctx.moveTo(sx(0), sy(y0 + rmse)); ctx.lineTo(sx(1), sy(y1 + rmse));
      ctx.lineTo(sx(1), sy(y1 - rmse)); ctx.lineTo(sx(0), sy(y0 - rmse));
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = C.muted;
    ctx.lineWidth = 1;
    for (const p of reg.pts) {
      const a = appear(p, t);
      if (a <= 0) continue;
      ctx.globalAlpha = 0.45 * a;
      line(sx(p.x), sy(p.y), sx(p.x), sy(reg.w * p.x + reg.b));
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = C.c1;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    line(sx(0), sy(y0), sx(1), sy(y1));
    ctx.restore();
    for (const p of reg.pts) {
      const a = appear(p, t);
      const big = p === drag || p === hoverPt;
      drawPoint(sx(p.x), sy(p.y), C.c2, (big ? 6.5 : 5) * (0.4 + 0.6 * a), a);
    }
  }

  // Regiões de decisão: grade de baixa resolução, ampliada com suavização
  const regionCanvas = document.createElement('canvas');
  const rctx = regionCanvas.getContext('2d');
  function drawRegions() {
    if (!rctx) return;
    const cols = Math.max(8, Math.round((sx(1) - sx(0)) / 6));
    const rows = Math.max(8, Math.round((sy(0) - sy(1)) / 6));
    if (regionCanvas.width !== cols || regionCanvas.height !== rows) { regionCanvas.width = cols; regionCanvas.height = rows; }
    const img = rctx.createImageData(cols, rows);
    const rgb = SERIES.map(hexToRgb);
    for (let r = 0; r < rows; r++) {
      const y = 1 - (r + 0.5) / rows;
      for (let c = 0; c < cols; c++) {
        const x = (c + 0.5) / cols;
        let best = 0, bd = Infinity;
        for (let j = 0; j < km.cents.length; j++) {
          const d = (x - km.cents[j].x) ** 2 + (y - km.cents[j].y) ** 2;
          if (d < bd) { bd = d; best = j; }
        }
        const k = (r * cols + c) * 4;
        img.data[k] = rgb[best][0]; img.data[k + 1] = rgb[best][1]; img.data[k + 2] = rgb[best][2]; img.data[k + 3] = 255;
      }
    }
    rctx.putImageData(img, 0, 0);
    ctx.save();
    ctx.globalAlpha = 0.09;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(regionCanvas, sx(0), sy(1), sx(1) - sx(0), sy(0) - sy(1));
    ctx.restore();
  }

  function drawCentroid(x, y, color) {
    const r = 7.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = C.surface; ctx.fillRect(-r - 2.5, -r - 2.5, (r + 2.5) * 2, (r + 2.5) * 2);
    ctx.fillStyle = color; ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.strokeRect(-r, -r, r * 2, r * 2);
    ctx.restore();
  }

  function drawKmeans(t) {
    if (km.pts.some((p) => p.c >= 0)) drawRegions();
    km.trails.forEach((tr, j) => {
      const pts = km.phase === 'move' && !km.converged ? tr.concat([km.cents[j]]) : tr;
      if (pts.length < 2) return;
      ctx.strokeStyle = SERIES[j];
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(sx(p.x), sy(p.y)) : ctx.moveTo(sx(p.x), sy(p.y))));
      ctx.stroke();
      ctx.globalAlpha = 1;
      for (let i = 0; i < tr.length - (km.converged ? 1 : 0); i++) {
        ctx.beginPath(); ctx.arc(sx(tr[i].x), sy(tr[i].y), 2.2, 0, Math.PI * 2);
        ctx.fillStyle = SERIES[j]; ctx.globalAlpha = 0.7; ctx.fill(); ctx.globalAlpha = 1;
      }
    });
    for (const p of km.pts) {
      const a = appear(p, t);
      drawPoint(sx(p.x), sy(p.y), p.c >= 0 ? SERIES[p.c] : C.muted, 4.5 * (0.4 + 0.6 * a), a);
    }
    if (t >= km.startAt || !km.startAt) km.cents.forEach((c, j) => drawCentroid(sx(c.x), sy(c.y), SERIES[j]));
  }

  function draw(t = now()) {
    if (!W || !H) return;
    drawFrame();
    if (mode === 'regression') drawRegression(t); else drawKmeans(t);
    drawRipples(t);
    updateReadout();
  }

  // ---------- leitura (texto + minigráfico) ----------
  const R = {};
  const make = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  };
  const metric = (parent, key) => {
    const wrap = make('span');
    if (key) { wrap.append(make('span', 'k', `${key} `)); }
    const v = make('span', 'v');
    wrap.append(v);
    parent.append(wrap);
    return v;
  };
  const legendItem = (parent, kind, color, label) => {
    const item = make('span', 'lg');
    const sw = make('span', `sw${kind === 'dot' ? '' : ` sw--${kind}`}`);
    sw.style.background = color;
    const txt = make('span', null, label);
    item.append(sw, txt);
    parent.append(item);
    return txt;
  };
  function buildReadout() {
    if (!readout) return;
    readout.textContent = '';
    const metrics = make('div', 'lab__metrics');
    const legend = make('div', 'lab__legend');
    if (mode === 'regression') {
      R.eq = metric(metrics, null);
      R.r2 = metric(metrics, 'R²');
      R.ep = metric(metrics, T.epoch || 'epoch');
      legendItem(legend, 'dot', C.c2, T.data || 'data');
      legendItem(legend, 'line', C.c1, T.model || 'model');
      legendItem(legend, 'band', C.c1, '±1 RMSE');
    } else {
      R.k = metric(metrics, null);
      R.it = metric(metrics, T.iter || 'iteration');
      R.in = metric(metrics, T.inertia || 'inertia');
      R.counts = SERIES.map((c, j) => legendItem(legend, 'dot', c, `${T.cluster || 'cluster'} ${j + 1}`));
      legendItem(legend, 'x', C.ink, T.centroid || 'centroid');
    }
    // Minigráfico: curva de perda (regressão) ou inércia por iteração (k-means)
    R.sparkCanvas = make('canvas');
    R.sparkCanvas.width = 0;
    if (mode === 'regression') {
      const spark = make('span', 'lab__spark');
      spark.append(make('span', 'k', T.loss || 'loss'), R.sparkCanvas);
      metrics.append(spark);
    } else {
      R.in.parentElement.classList.add('lab__spark');
      R.in.parentElement.append(R.sparkCanvas);
    }
    R.status = make('span', 'ok');
    metrics.append(R.status);
    readout.append(metrics, legend);
  }

  function drawSpark(series, logScale) {
    const cv = R.sparkCanvas;
    if (!cv) return;
    const w = 64, h = 18;
    const pr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== w * pr) { cv.width = w * pr; cv.height = h * pr; cv.style.width = `${w}px`; cv.style.height = `${h}px`; }
    const c = cv.getContext('2d');
    if (!c) return;
    c.setTransform(pr, 0, 0, pr, 0, 0);
    c.clearRect(0, 0, w, h);
    if (series.length < 2) return;
    const vals = logScale ? series.map((v) => Math.log(v + 1e-9)) : series;
    let lo = Infinity, hi = -Infinity;
    vals.forEach((v) => { lo = Math.min(lo, v); hi = Math.max(hi, v); });
    const X = (i) => 2 + (i / (vals.length - 1)) * (w - 4);
    const Y = (v) => (hi > lo ? h - 2 - ((v - lo) / (hi - lo)) * (h - 4) : h / 2);
    c.beginPath();
    vals.forEach((v, i) => (i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v))));
    c.strokeStyle = mode === 'regression' ? C.c1 : C.ink;
    c.lineWidth = 1.5; c.lineJoin = 'round'; c.stroke();
    c.beginPath(); c.arc(X(vals.length - 1), Y(last(vals)), 2.2, 0, Math.PI * 2);
    c.fillStyle = c.strokeStyle; c.fill();
  }

  function updateReadout() {
    if (!R.status) return;
    if (mode === 'regression') {
      const { r2 } = regStats();
      const sign = reg.b < 0 ? '−' : '+';
      R.eq.textContent = `ŷ = ${fmt(reg.w)}x ${sign} ${fmt(Math.abs(reg.b))}`;
      R.r2.textContent = fmt(r2, 3);
      R.ep.textContent = String(reg.epoch);
      R.status.textContent = reg.converged && reg.epoch > 0 ? `✓ ${T.converged || 'converged'}` : '';
      drawSpark(reg.loss, true);
    } else {
      R.k.textContent = `k = ${km.k}`;
      R.it.textContent = String(km.iter);
      R.in.textContent = km.inertia.length ? fmt(last(km.inertia), 2) : '–';
      const counts = [0, 0, 0];
      km.pts.forEach((p) => { if (p.c >= 0) counts[p.c] += 1; });
      R.counts.forEach((el, j) => { el.textContent = `${T.cluster || 'cluster'} ${j + 1}${counts[j] ? ` (${counts[j]})` : ''}`; });
      R.status.textContent = km.converged ? `✓ ${T.converged || 'converged'}` : '';
      drawSpark(km.inertia, false);
    }
  }

  // ---------- laço de animação ----------
  let running = false;
  let visible = true;
  function busyBirths(t, pts) { return pts.some((p) => p.born && t < p.born + 300); }
  function frame(t) {
    let busy = false;
    if (mode === 'regression') {
      if (!reg.converged && t >= reg.startAt) {
        for (let i = 0; i < STEPS_PER_FRAME && !reg.converged; i++) regStep();
      }
      busy = !reg.converged || busyBirths(t, reg.pts);
    } else {
      busy = kmUpdate(t) || busyBirths(t, km.pts);
    }
    busy = busy || ripples.length > 0 || Boolean(drag);
    draw(t);
    if (busy && visible) requestAnimationFrame(frame);
    else running = false;
  }
  function wake() {
    if (reduce.matches) { settle(); draw(); return; }
    if (running || !visible) return;
    running = true;
    requestAnimationFrame(frame);
  }

  // ---------- modos ----------
  function setMode(next, focusTab) {
    mode = next;
    tabs.forEach((tab) => {
      const on = tab.dataset.labMode === next;
      tab.setAttribute('aria-checked', String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on && focusTab) tab.focus();
    });
    if (codeEl) codeEl.textContent = CODE[next];
    if (hint) hint.textContent = next === 'regression' ? T.hint_regression || '' : T.hint_kmeans || '';
    canvas.setAttribute('aria-label', next === 'regression' ? T.desc_regression || '' : T.desc_kmeans || '');
    hoverPt = null; drag = null;
    canvas.classList.remove('is-hovering', 'is-grabbing');
    if (next === 'regression' && !reg.pts.length) regGenerate();
    if (next === 'kmeans' && !km.pts.length) kmGenerate();
    buildReadout();
    draw();
    wake();
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => { if (tab.dataset.labMode !== mode) setMode(tab.dataset.labMode); });
    tab.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
      const nextTab = tabs[(i + dir + tabs.length) % tabs.length];
      setMode(nextTab.dataset.labMode, true);
    });
  });

  // ---------- interação ----------
  function addPoint(x, y) {
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    const t = now();
    const p = { x: clamp(x, 0.01, 0.99), y: clamp(y, 0.01, 0.99), born: reduce.matches ? 0 : t, c: -1 };
    if (!reduce.matches) ripples.push({ x: p.x, y: p.y, t, color: mode === 'regression' ? C.c2 : C.ink });
    if (mode === 'regression') {
      reg.pts.push(p);
      if (reg.pts.length > MAX_REG_POINTS) reg.pts.shift();
      reg.converged = false;
    } else {
      km.pts.push(p);
      if (km.pts.length > MAX_KM_POINTS) km.pts.shift();
      km.converged = false;
      if (km.phase !== 'move') { km.phase = 'assign'; km.phaseT = t - 1000; }
    }
    wake();
  }
  function addRandomPoint() {
    if (mode === 'regression') {
      const x = 0.05 + Math.random() * 0.9;
      addPoint(x, clamp(reg.w * x + reg.b + randn() * 0.12, 0.03, 0.97));
    } else {
      const c = km.cents[Math.floor(Math.random() * km.cents.length)] || { x: 0.5, y: 0.5 };
      addPoint(clamp(c.x + randn() * 0.07, 0.03, 0.97), clamp(c.y + randn() * 0.07, 0.03, 0.97));
    }
  }
  function reset() {
    ripples.length = 0;
    if (mode === 'regression') regGenerate(); else kmGenerate();
    buildReadout();
    draw();
    wake();
  }

  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const nearest = (px, py, maxDist) => {
    let best = null, bd = maxDist * maxDist;
    for (const p of reg.pts) {
      const d = (sx(p.x) - px) ** 2 + (sy(p.y) - py) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  };

  canvas.addEventListener('pointerdown', (e) => {
    const { x, y } = local(e);
    if (mode === 'regression' && e.pointerType !== 'touch') {
      const p = nearest(x, y, 16);
      if (p) {
        drag = p;
        canvas.setPointerCapture(e.pointerId);
        canvas.classList.add('is-grabbing');
        wake();
        return;
      }
    }
    downAt = { x, y };
  });
  canvas.addEventListener('pointermove', (e) => {
    const { x, y } = local(e);
    if (drag) {
      drag.x = clamp(ix(x), 0.01, 0.99);
      drag.y = clamp(iy(y), 0.01, 0.99);
      reg.converged = false;
      wake();
      return;
    }
    if (mode === 'regression' && e.pointerType === 'mouse') {
      const p = nearest(x, y, 16);
      if (p !== hoverPt) {
        hoverPt = p;
        canvas.classList.toggle('is-hovering', Boolean(p));
        if (!running) draw();
      }
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    const { x, y } = local(e);
    if (drag) {
      drag = null;
      canvas.classList.remove('is-grabbing');
      return;
    }
    if (downAt && Math.hypot(x - downAt.x, y - downAt.y) < 8) addPoint(ix(x), iy(y));
    downAt = null;
  });
  canvas.addEventListener('pointercancel', () => {
    drag = null; downAt = null;
    canvas.classList.remove('is-grabbing');
  });
  canvas.addEventListener('pointerleave', () => {
    if (hoverPt && !drag) {
      hoverPt = null;
      canvas.classList.remove('is-hovering');
      if (!running) draw();
    }
  });

  const addBtn = root.querySelector('[data-lab-add]');
  const resetBtn = root.querySelector('[data-lab-reset]');
  if (addBtn) addBtn.addEventListener('click', addRandomPoint);
  if (resetBtn) resetBtn.addEventListener('click', reset);

  // ---------- tamanho, tema e visibilidade ----------
  function resize() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener('resize', resize);

  document.addEventListener('themechange', () => { readColors(); buildReadout(); draw(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => draw());

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting && !document.hidden;
      if (visible) wake();
    }).observe(root);
  }
  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
    if (visible) wake();
  });

  // ---------- início ----------
  // ?lab=kmeans abre direto no k-means (útil para compartilhar)
  let initial = 'regression';
  try { if (new URLSearchParams(window.location.search).get('lab') === 'kmeans') initial = 'kmeans'; } catch (e) { /* ignora */ }
  readColors();
  resize();
  setMode(initial);
})();
