/* =========================================================
   SMASH BREAKER - 家電ぶん投げストレス発散ゲーム
   ライブラリ不使用：3D描画は CSS 3D Transforms（matrix3d / preserve-3d）、
   物理は自前の簡易剛体、効果音は WebAudio 合成、パーティクルは Canvas2D。
   ========================================================= */
(function () {
'use strict';

const G = 9.81;
const S = 100;      // world container: px per meter
const FS = 400;     // face elements: px per meter (resolution of each face)
const FOV = 60;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const easeOutBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const yenFmt = (n) => '¥' + Math.round(n).toLocaleString('ja-JP');
const $ = (id) => document.getElementById(id);
const r7 = (x) => Math.round(x * 1e7) / 1e7;

/* =========================================================
   Minimal 3D math
   ========================================================= */
class V {
  constructor(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new V(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  addS(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  mul(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  crossV(a, b) {
    const x = a.y * b.z - a.z * b.y, y = a.z * b.x - a.x * b.z, z = a.x * b.y - a.y * b.x;
    return this.set(x, y, z);
  }
  lenSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  len() { return Math.sqrt(this.lenSq()); }
  norm() { const l = this.len() || 1; return this.mul(1 / l); }
  min(v) { this.x = Math.min(this.x, v.x); this.y = Math.min(this.y, v.y); this.z = Math.min(this.z, v.z); return this; }
  max(v) { this.x = Math.max(this.x, v.x); this.y = Math.max(this.y, v.y); this.z = Math.max(this.z, v.z); return this; }
  applyQ(q) {
    const x = this.x, y = this.y, z = this.z, qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
    this.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    this.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    this.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    return this;
  }
  randDir() {
    const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    return this.set(s * Math.cos(t), u, s * Math.sin(t));
  }
}
class Q {
  constructor(x, y, z, w) { this.x = x || 0; this.y = y || 0; this.z = z || 0; this.w = w === undefined ? 1 : w; }
  copy(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; }
  clone() { return new Q(this.x, this.y, this.z, this.w); }
  conj() { this.x = -this.x; this.y = -this.y; this.z = -this.z; return this; }
  axisAngle(a, ang) { const h = ang / 2, s = Math.sin(h); this.x = a.x * s; this.y = a.y * s; this.z = a.z * s; this.w = Math.cos(h); return this; }
  euler(x, y, z) { // XYZ order
    const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2), s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
    this.x = s1 * c2 * c3 + c1 * s2 * s3; this.y = c1 * s2 * c3 - s1 * c2 * s3;
    this.z = c1 * c2 * s3 + s1 * s2 * c3; this.w = c1 * c2 * c3 - s1 * s2 * s3;
    return this;
  }
  mulQ(a, b) {
    const ax = a.x, ay = a.y, az = a.z, aw = a.w, bx = b.x, by = b.y, bz = b.z, bw = b.w;
    this.x = ax * bw + aw * bx + ay * bz - az * by; this.y = ay * bw + aw * by + az * bx - ax * bz;
    this.z = az * bw + aw * bz + ax * by - ay * bx; this.w = aw * bw - ax * bx - ay * by - az * bz;
    return this;
  }
  premul(q) { return this.mulQ(q, this); }
  norm() { const l = Math.hypot(this.x, this.y, this.z, this.w) || 1; this.x /= l; this.y /= l; this.z /= l; this.w /= l; return this; }
  random() { return this.euler(rand(0, 6.3), rand(0, 6.3), rand(0, 6.3)); }
}
class M4 {
  constructor() { this.e = new Float64Array(16); this.e[0] = this.e[5] = this.e[10] = this.e[15] = 1; }
  compose(p, q, s) {
    const e = this.e, x = q.x, y = q.y, z = q.z, w = q.w;
    const x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
    e[0] = (1 - (yy + zz)) * s; e[1] = (xy + wz) * s; e[2] = (xz - wy) * s; e[3] = 0;
    e[4] = (xy - wz) * s; e[5] = (1 - (xx + zz)) * s; e[6] = (yz + wx) * s; e[7] = 0;
    e[8] = (xz + wy) * s; e[9] = (yz - wx) * s; e[10] = (1 - (xx + yy)) * s; e[11] = 0;
    e[12] = p.x; e[13] = p.y; e[14] = p.z; e[15] = 1;
    return this;
  }
  css() {
    const e = this.e;
    return 'matrix3d(' + r7(e[0]) + ',' + r7(e[1]) + ',' + r7(e[2]) + ',0,' + r7(e[4]) + ',' + r7(e[5]) + ',' + r7(e[6]) + ',0,' +
      r7(e[8]) + ',' + r7(e[9]) + ',' + r7(e[10]) + ',0,' + r7(e[12]) + ',' + r7(e[13]) + ',' + r7(e[14]) + ',1)';
  }
}
const QI = new Q();
const AX = new V(1, 0, 0), AY = new V(0, 1, 0), AZ = new V(0, 0, 1), V0 = new V();

/* =========================================================
   Sound (all synthesized)
   ========================================================= */
const Snd = {
  ctx: null, out: null, nb: null, on: true, voices: 0,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = this.ctx = new C();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.15;
    this.out = ctx.createGain(); this.out.gain.value = 0.85;
    this.out.connect(comp); comp.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.nb = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.nb.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  },
  ok() { return this.ctx && this.on && this.voices < 56; },
  _dest(pan) {
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); p.connect(this.out); return p;
    }
    return this.out;
  },
  _env(g, t, a, peak, dur) {
    peak = Math.max(peak, 0.0002);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  },
  noise(o) {
    if (!this.ok()) return;
    const c = this.ctx, t = c.currentTime + (o.delay || 0);
    const src = c.createBufferSource(); src.buffer = this.nb;
    const f = c.createBiquadFilter(); f.type = o.type || 'lowpass';
    f.frequency.setValueAtTime(o.f, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
    f.Q.value = o.q || 0.7;
    const g = c.createGain(); this._env(g, t, o.a || 0.002, o.g, o.dur);
    src.connect(f); f.connect(g); g.connect(this._dest(o.pan));
    src.start(t, Math.random() * 0.8); src.stop(t + o.dur + 0.05);
    this.voices++; src.onended = () => { this.voices--; };
  },
  tone(o) {
    if (!this.ok()) return;
    const c = this.ctx, t = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator(); osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
    const g = c.createGain(); this._env(g, t, o.a || 0.002, o.g, o.dur);
    osc.connect(g); g.connect(this._dest(o.pan));
    osc.start(t); osc.stop(t + o.dur + 0.05);
    this.voices++; osc.onended = () => { this.voices--; };
  },
  hit(mat, s, pan, delay, size) {
    if (!this.ok()) return;
    delay = delay || 0; size = size || 0.3;
    const v = clamp((s - 1) / 18, 0.05, 1);
    const hi = size < 0.12 ? 1.8 : 1;
    switch (mat) {
      case 'metal': {
        const f = rand(200, 420) * hi;
        [1, 2.76, 5.4, 8.93].forEach((p, i) => this.tone({ f: f * p, dur: rand(0.4, 1.1) - i * 0.08, g: v * 0.2 / (i + 1), pan, delay }));
        this.noise({ type: 'highpass', f: 2500, dur: 0.05, g: v * 0.5, pan, delay });
        this.tone({ f: 140, f2: 50, dur: 0.12, g: v * 0.4, pan, delay });
        break;
      }
      case 'glass': {
        this.noise({ type: 'highpass', f: 3500, dur: 0.15 + v * 0.2, g: v * 0.45, pan, delay });
        const n = 2 + Math.floor(v * 4);
        for (let i = 0; i < n; i++) this.tone({ f: rand(2500, 6500), dur: rand(0.08, 0.25), g: v * 0.1, pan, delay: delay + rand(0, 0.08) });
        break;
      }
      case 'ceramic': {
        this.noise({ type: 'highpass', f: 1800, dur: 0.12, g: v * 0.5, pan, delay });
        for (let i = 0; i < 3; i++) this.tone({ f: rand(1200, 3400), dur: rand(0.06, 0.18), g: v * 0.12, pan, delay: delay + rand(0, 0.04) });
        break;
      }
      case 'soft': {
        this.noise({ type: 'lowpass', f: 600, dur: 0.08, g: v * 0.35, pan, delay });
        break;
      }
      default: {
        this.noise({ type: 'lowpass', f: 900 + v * 900, dur: 0.12, g: v * 0.7, pan, delay });
        this.tone({ f: 170 * hi, f2: 60, dur: 0.14, g: v * 0.55, pan, delay });
        this.tone({ f: rand(500, 900) * hi, f2: 300, type: 'triangle', dur: 0.06, g: v * 0.15, pan, delay });
      }
    }
  },
  crash(mat, s, pan, big) {
    if (!this.ok()) return;
    const v = clamp(s / 22, 0.35, 1);
    this.tone({ f: big ? 80 : 110, f2: 30, dur: big ? 0.9 : 0.6, g: 0.9 * v, pan });
    this.noise({ type: 'lowpass', f: 2600, f2: 250, dur: 0.75, g: 0.75 * v, pan });
    this.noise({ type: 'bandpass', f: 1300, q: 0.8, dur: 0.35, g: 0.5 * v, pan });
    if (mat === 'glass' || mat === 'ceramic' || big) {
      this.noise({ type: 'highpass', f: 4000, f2: 7000, dur: 1.0, g: 0.45 * v, pan });
      for (let i = 0; i < 16; i++) this.tone({ f: rand(2200, 7500), dur: rand(0.06, 0.3), g: 0.09, pan: pan + rand(-0.3, 0.3), delay: rand(0, 0.7) * rand(0, 1) });
    }
    for (let i = 0; i < 4; i++) this.hit(mat === 'glass' ? 'plastic' : mat, s * rand(0.4, 0.8), pan + rand(-0.3, 0.3), rand(0.05, 0.45), 0.1);
  },
  zap(pan, vol) {
    if (!this.ok()) return;
    vol = vol || 1;
    const c = this.ctx, t = c.currentTime;
    const osc = c.createOscillator(); osc.type = 'sawtooth';
    for (let k = 0; k < 14; k++) osc.frequency.setValueAtTime(rand(60, 900), t + k * 0.025);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 1.2;
    const g = c.createGain(); this._env(g, t, 0.003, 0.22 * vol, 0.38);
    osc.connect(f); f.connect(g); g.connect(this._dest(pan));
    osc.start(t); osc.stop(t + 0.42);
    this.voices++; osc.onended = () => { this.voices--; };
    this.noise({ type: 'highpass', f: 3000, dur: 0.3, g: 0.22 * vol, pan });
  },
  whoosh(p) { this.noise({ type: 'bandpass', f: 350, f2: 1600, q: 1.4, dur: 0.32, a: 0.05, g: 0.18 + p * 0.3 }); },
  chime() { [523, 659, 784, 1047].forEach((f, i) => this.tone({ f, type: 'triangle', dur: 0.6, g: 0.25, delay: i * 0.1 })); }
};

/* =========================================================
   MAIN
   ========================================================= */
function main() {

const viewport = $('viewport'), worldEl = $('world'), handEl = $('hand');
const fxc = $('fxc'), fx2 = fxc.getContext('2d');
let W = 1, H = 1, F = 1, DPR = 1;

/* ---------- camera ---------- */
const CAM = new V(0, 1.65, 5.4);
const camQ0 = new Q().euler(Math.atan2(1.0 - 1.65, 5.4 + 3), 0, 0);
const camPos = CAM.clone(), camQ = camQ0.clone(), camInv = new Q();
const viewM = new M4();

function resize() {
  W = window.innerWidth; H = window.innerHeight;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  // 縦長画面（スマホ縦持ち）では横方向の視野が狭くなりすぎないよう、横 FOV も最低 FOV 度を確保する
  const t = Math.tan(FOV * Math.PI / 360);
  F = Math.min((H / 2) / t, (W / 2) / t);
  viewport.style.perspective = F + 'px';
  fxc.width = Math.round(W * DPR); fxc.height = Math.round(H * DPR);
  fx2.setTransform(DPR, 0, 0, DPR, 0, 0);
  handEl.style.transform = `translateZ(${F}px) scale3d(${S},${-S},${S})`;
}
resize();

function updateCamera(shake) {
  camPos.set(CAM.x + (Math.random() - 0.5) * shake * 0.12, CAM.y + (Math.random() - 0.5) * shake * 0.12, CAM.z);
  camQ.copy(camQ0).mulQ(camQ0, _qa.euler(0, 0, (Math.random() - 0.5) * shake * 0.035));
  camInv.copy(camQ).conj();
  const t = _va.copy(camPos).applyQ(camInv).mul(-1);
  viewM.compose(t, camInv, 1);
  worldEl.style.transform = `translateZ(${F}px) scale3d(${S},${-S},${S}) ` + viewM.css();
}
/* world point -> screen (same projection the browser uses) */
function project(p, out) {
  const c = _vb.copy(p).sub(camPos).applyQ(camInv);
  if (c.z > -0.05) return null;
  const k = F / -c.z;
  out.x = W / 2 + c.x * k; out.y = H / 2 - c.y * k; out.k = k;
  return out;
}

/* =========================================================
   Faces / parts (the CSS 3D "mesh" system)
   ========================================================= */
const _va = new V(), _vb = new V(), _vc = new V(), _vd = new V(), _qa = new Q(), _qb = new Q(), _m = new M4();

function faceMatrix(w, h, c, u, v, n, ps) {
  const k = 1 / ps;
  const tx = c.x - u.x * w / 2 + v.x * h / 2, ty = c.y - u.y * w / 2 + v.y * h / 2, tz = c.z - u.z * w / 2 + v.z * h / 2;
  return `matrix3d(${r7(u.x * k)},${r7(u.y * k)},${r7(u.z * k)},0,${r7(-v.x * k)},${r7(-v.y * k)},${r7(-v.z * k)},0,${r7(n.x * k)},${r7(n.y * k)},${r7(n.z * k)},0,${r7(tx)},${r7(ty)},${r7(tz)},1)`;
}
const rgba = (c, b, a) => `rgba(${(c[0] * b) | 0},${(c[1] * b) | 0},${(c[2] * b) | 0},${a})`;
const SHEEN = 'linear-gradient(115deg, rgba(255,255,255,0) 25%, rgba(255,255,255,.38) 42%, rgba(255,255,255,0) 58%, rgba(255,255,255,.15) 75%, rgba(255,255,255,0) 85%)';

function newPart() {
  const el = document.createElement('div'); el.className = 'part';
  return { el, faces: [], min: new V(1e9, 1e9, 1e9), max: new V(-1e9, -1e9, -1e9), snd: null, sprite: false, core: false };
}
function face(part, w, h, c, u, n, m, opt) {
  opt = opt || {};
  const v = new V().crossV(n, u);
  const el = document.createElement('div');
  el.className = 'f';
  const dbl = !!(opt.dbl || m.dbl);
  if (dbl) el.classList.add('dbl');
  if (opt.round || m.round) el.classList.add('round');
  el.style.width = (w * FS).toFixed(2) + 'px';
  el.style.height = (h * FS).toFixed(2) + 'px';
  const base = faceMatrix(w, h, c, u, v, n, FS);
  el.style.transform = base;
  if (m.tex) el.style.backgroundImage = `url(${m.tex})`;
  else if (m.sheen) el.style.backgroundImage = SHEEN;
  if (opt.clip) el.style.clipPath = opt.clip;
  if (m.ring) { el.style.border = `${m.ring}px solid ${rgba(m.c, 1, m.a)}`; el.style.boxSizing = 'border-box'; }
  else if (!m.tex) el.style.backgroundColor = rgba(m.c, m.emissive ? 1 : 0.85, m.a);
  if (m.emissive && !m.tex) el.style.boxShadow = `0 0 ${Math.round(FS * 0.01)}px ${rgba(m.c, 1, 0.8)}`;
  part.el.appendChild(el);
  if (!part.snd) part.snd = m.snd;
  const f = { el, n: n.clone(), u: u.clone(), v, c: c.clone(), w, h, m, base, dbl, lastB: -1, noShade: !!(m.emissive || opt.noShade), tx: 0, ty: 0, decals: 0 };
  part.faces.push(f);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    _vd.copy(c).addS(u, sx * w / 2).addS(v, sy * h / 2);
    part.min.min(_vd); part.max.max(_vd);
  }
  return f;
}
/* frame helpers for composite shapes */
function fr(x, y, z, rx, ry, rz) { return { o: new V(x, y, z), q: new Q().euler(rx || 0, ry || 0, rz || 0) }; }
const XP = (p, f) => f ? p.applyQ(f.q).add(f.o) : p;
const XD = (d, f) => f ? d.applyQ(f.q) : d;

function addBox(p, w, h, d, m, f, mats) {
  const defs = [
    [w / 2, 0, 0, 1, 0, 0, 0, 0, -1, d, h, 'px'], [-w / 2, 0, 0, -1, 0, 0, 0, 0, 1, d, h, 'nx'],
    [0, h / 2, 0, 0, 1, 0, 1, 0, 0, w, d, 'py'], [0, -h / 2, 0, 0, -1, 0, 1, 0, 0, w, d, 'ny'],
    [0, 0, d / 2, 0, 0, 1, 1, 0, 0, w, h, 'pz'], [0, 0, -d / 2, 0, 0, -1, -1, 0, 0, w, h, 'nz']];
  for (const a of defs) {
    face(p, a[9], a[10], XP(new V(a[0], a[1], a[2]), f), XD(new V(a[6], a[7], a[8]), f), XD(new V(a[3], a[4], a[5]), f), (mats && mats[a[11]]) || m);
  }
}
function addPlate(p, w, h, m, f, opt) {
  return face(p, w, h, XP(new V(), f), XD(new V(1, 0, 0), f), XD(new V(0, 0, 1), f), m, Object.assign({ dbl: true }, opt || {}));
}
function addCyl(p, rt, rb, h, n, m, f, caps, opt) {
  caps = caps || 'both'; opt = opt || {};
  const s = Math.sin(Math.PI / n), cc = Math.cos(Math.PI / n);
  const wt = 2 * rt * s, wb = 2 * rb * s, Wd = Math.max(wt, wb, 0.0005);
  let clip = null;
  if (Math.abs(wt - wb) > 1e-4) {
    const a = (Wd - wt) / 2 / Wd * 100, b = (Wd + wt) / 2 / Wd * 100, c = (Wd + wb) / 2 / Wd * 100, d = (Wd - wb) / 2 / Wd * 100;
    clip = `polygon(${a.toFixed(2)}% 0, ${b.toFixed(2)}% 0, ${c.toFixed(2)}% 100%, ${d.toFixed(2)}% 100%)`;
  }
  for (let i = 0; i < n; i++) {
    const am = (i + 0.5) * Math.PI * 2 / n, sx = Math.sin(am), sz = Math.cos(am);
    const top = new V(sx * rt * cc, h / 2, sz * rt * cc), bot = new V(sx * rb * cc, -h / 2, sz * rb * cc);
    const vv = top.clone().sub(bot), len = vv.len(); vv.mul(1 / len);
    const u = new V(Math.cos(am), 0, -Math.sin(am));
    const nn = new V().crossV(u, vv);
    const c = top.add(bot).mul(0.5);
    face(p, Wd, len, XP(c, f), XD(u, f), XD(nn, f), m, { clip, dbl: opt.dbl });
  }
  const capU = n === 4 ? new V(1, 0, -1).norm() : new V(1, 0, 0);
  const cap = (r, y, ny) => {
    if (r < 0.001) return;
    if (n === 4) face(p, r * Math.SQRT2, r * Math.SQRT2, XP(new V(0, y, 0), f), XD(capU.clone(), f), XD(new V(0, ny, 0), f), m, { dbl: opt.dbl });
    else face(p, 2 * r, 2 * r, XP(new V(0, y, 0), f), XD(new V(1, 0, 0), f), XD(new V(0, ny, 0), f), m, { round: true, dbl: opt.dbl });
  };
  if (caps === 'both' || caps === 'top') cap(rt, h / 2, 1);
  if (caps === 'both' || caps === 'bottom') cap(rb, -h / 2, -1);
}
function addLathe(p, prof, n, m, f, botCap, topCap, opt) {
  for (let j = 0; j < prof.length - 1; j++) {
    const [r0, y0] = prof[j], [r1, y1] = prof[j + 1];
    const yc = (y0 + y1) / 2;
    const sub = { o: XP(new V(0, yc, 0), f), q: f ? f.q.clone() : new Q() };
    let caps = 'none';
    if (j === 0 && botCap) caps = 'bottom';
    if (j === prof.length - 2 && topCap) caps = caps === 'bottom' ? 'both' : 'top';
    addCyl(p, r1, r0, y1 - y0, n, m, sub, caps, opt);
  }
}
function addArc(p, R, t, segs, a0, a1, m, f) {
  const step = (a1 - a0) / segs, chord = 2 * R * Math.sin(Math.abs(step) / 2) * 1.08;
  for (let k = 0; k < segs; k++) {
    const a = a0 + (k + 0.5) * step;
    const q = new Q().euler(0, 0, a + Math.PI / 2);
    const sub = { o: XP(new V(R * Math.cos(a), R * Math.sin(a), 0), f), q: f ? new Q().mulQ(f.q, q) : q };
    addBox(p, chord, t, t, m, sub);
  }
}
function makeSprite(r, m) {
  const p = newPart(); p.sprite = true;
  const fc = face(p, 2 * r, 2 * r, new V(), new V(1, 0, 0), new V(0, 0, 1), m, { round: true, dbl: true, noShade: true });
  const c = m.c;
  fc.el.style.background = `radial-gradient(circle at 34% 30%, ${rgba(c, 1.6, 1)} 0%, ${rgba(c, 1, 1)} 40%, ${rgba(c, 0.35, 1)} 100%)`;
  if (m.emissive) fc.el.style.boxShadow = `0 0 ${Math.round(r * FS * 1.5)}px ${rgba(c, 1, 0.9)}`;
  p.min.set(-r, -r, -r); p.max.set(r, r, r);
  p.snd = m.snd;
  return p;
}

/* lighting (computed per face from its world normal) */
const LIGHT = new V(0.35, 0.85, 0.45).norm();
function shadeFace(f, q) {
  if (f.noShade) return;
  _vc.copy(f.n).applyQ(q);
  let d = _vc.dot(LIGHT);
  if (f.dbl) d = Math.abs(d);
  let b = 0.4 + 0.6 * Math.max(0, d) + (_vc.y > 0.6 ? 0.05 : 0);
  b = Math.round(b * 40) / 40;
  if (b === f.lastB) return;
  f.lastB = b;
  const m = f.m;
  if (m.tex) { f.el.style.filter = `brightness(${(b + 0.12).toFixed(3)})`; return; }
  const col = rgba(m.c, b, m.a);
  if (m.ring) f.el.style.borderColor = col; else f.el.style.backgroundColor = col;
}
function placePart(part, p, q, s, spriteQ, shadeQ) {
  _m.compose(p, part.sprite ? spriteQ : q, s);
  part.el.style.transform = _m.css();
  if (!part.sprite) for (let i = 0; i < part.faces.length; i++) shadeFace(part.faces[i], shadeQ);
}

/* =========================================================
   Surfaces (canvas, can crack) and room
   ========================================================= */
function paintNoise(ctx, w, h, amt) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amt;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}
function blotches(ctx, w, h, p, n, dark, light) {
  for (let i = 0; i < n; i++) {
    const x = rand(0, w), y = rand(0, h), r = rand(0.3, 1.6) * p;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const col = Math.random() < 0.6 ? dark : light;
    g.addColorStop(0, col.replace('A', rand(0.05, 0.16).toFixed(2)));
    g.addColorStop(1, col.replace('A', '0'));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}
class Surface {
  constructor(w, h, ppm, painter) {
    this.ppm = ppm;
    const c = this.canvas = document.createElement('canvas');
    c.width = Math.round(w * ppm); c.height = Math.round(h * ppm);
    this.ctx = c.getContext('2d', { willReadFrequently: true });
    painter(this.ctx, c.width, c.height, ppm);
    this.base = this.ctx.getImageData(0, 0, c.width, c.height);
  }
  reset() { this.ctx.putImageData(this.base, 0, 0); }
  crack(mx, my, k) {
    const ctx = this.ctx, p = this.ppm, x = mx * p, y = my * p;
    k = clamp(k, 0.1, 1.4);
    const r = (0.04 + 0.13 * k) * p;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(10,8,6,0.6)'); g.addColorStop(0.6, 'rgba(20,16,12,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 10 * k; i++) {
      ctx.fillStyle = `rgba(215,205,190,${rand(0.12, 0.35).toFixed(2)})`;
      const a = rand(0, 6.28), d = rand(0, r), s = rand(1, 3.5) * p / 128;
      ctx.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, s, s);
    }
    const n = 3 + Math.floor(k * 7);
    for (let i = 0; i < n; i++) this.branch(x, y, rand(0, Math.PI * 2), (0.12 + 0.75 * k * rand(0.4, 1)) * p, (1 + 2.4 * k) * p / 200, 0);
  }
  branch(x, y, a, len, w, depth) {
    const ctx = this.ctx, segs = 5 + Math.floor(Math.random() * 4), step = len / segs;
    const pts = [[x, y]];
    for (let s = 0; s < segs; s++) {
      a += rand(-0.45, 0.45); x += Math.cos(a) * step; y += Math.sin(a) * step; pts.push([x, y]);
      if (depth < 2 && Math.random() < 0.18) this.branch(x, y, a + rand(-1, 1), len * rand(0.25, 0.5), w * 0.6, depth + 1);
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const line = (ox, oy) => { ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q[0] + ox, q[1] + oy) : ctx.moveTo(q[0] + ox, q[1] + oy)); ctx.stroke(); };
    ctx.strokeStyle = 'rgba(255,245,230,0.16)'; ctx.lineWidth = w; line(w * 0.8, w * 0.8);
    ctx.strokeStyle = 'rgba(14,11,9,0.88)'; ctx.lineWidth = w; line(0, 0);
  }
}
function paintFloor(ctx, w, h, p) {
  ctx.fillStyle = '#6e6c67'; ctx.fillRect(0, 0, w, h);
  blotches(ctx, w, h, p, 60, 'rgba(35,33,30,A)', 'rgba(170,165,155,A)');
  paintNoise(ctx, w, h, 22);
  ctx.strokeStyle = 'rgba(28,26,24,0.65)'; ctx.lineWidth = 2;
  for (let x = 2; x < 8; x += 2) { ctx.beginPath(); ctx.moveTo(x * p, 0); ctx.lineTo(x * p, h); ctx.stroke(); }
  for (let z = 2; z < 10; z += 2) { ctx.beginPath(); ctx.moveTo(0, z * p); ctx.lineTo(w, z * p); ctx.stroke(); }
  const ly = (3.2 + 5) * p;
  for (let x = 0; x < w; x += 0.4 * p) {
    ctx.fillStyle = ((x / (0.4 * p)) | 0) % 2 ? '#1b1b1b' : '#e8b90f';
    ctx.fillRect(x, ly, 0.4 * p, 0.1 * p);
  }
  // darken far end a bit (fake ambient occlusion near the wall)
  const g = ctx.createLinearGradient(0, 0, 0, 1.2 * p);
  g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, 1.2 * p);
  for (const side of [0, 1]) {
    const gx = ctx.createLinearGradient(side ? w : 0, 0, side ? w - 0.8 * p : 0.8 * p, 0);
    gx.addColorStop(0, 'rgba(0,0,0,0.4)'); gx.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gx; ctx.fillRect(0, 0, w, h);
  }
}
function paintBricks(ctx, w, h, p) {
  ctx.fillStyle = '#7d776d'; ctx.fillRect(0, 0, w, h);
  const bw = 0.23 * p, bh = 0.065 * p, m = 0.012 * p;
  for (let row = 0, y = 0; y < h; row++, y += bh + m) {
    const off = (row % 2) * (bw + m) / 2;
    for (let x = -off; x < w; x += bw + m) {
      ctx.fillStyle = `hsl(${rand(6, 20).toFixed(0)},${rand(28, 46).toFixed(0)}%,${rand(25, 39).toFixed(0)}%)`;
      ctx.fillRect(x, y, bw, bh);
    }
  }
  paintNoise(ctx, w, h, 26);
  const g = ctx.createLinearGradient(0, h * 0.55, 0, h);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const cx = 4 * p, cy = 3.5 * p;
  for (let i = 5; i >= 1; i--) {
    ctx.beginPath(); ctx.arc(cx, cy, i * 0.12 * p, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 ? 'rgba(220,35,40,0.85)' : 'rgba(240,238,230,0.85)'; ctx.fill();
  }
  ctx.save(); ctx.translate(cx, cy - 0.95 * p); ctx.rotate(-0.04);
  ctx.font = `${Math.round(0.34 * p)}px "Dela Gothic One", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,225,40,0.92)'; ctx.fillText('ここを狙え！', 0, 0);
  ctx.restore();
  ctx.save(); ctx.translate(1.3 * p, 1.6 * p); ctx.rotate(-0.12);
  ctx.font = `${Math.round(0.2 * p)}px "Dela Gothic One", sans-serif`;
  ctx.fillStyle = 'rgba(120,220,255,0.75)'; ctx.fillText('STRESS', 0, 0); ctx.fillText('FREE ZONE', 0, 0.24 * p);
  ctx.restore();
  ctx.save(); ctx.translate(6.4 * p, 2.0 * p); ctx.rotate(0.08);
  ctx.font = `${Math.round(0.22 * p)}px "Dela Gothic One", sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.textAlign = 'center'; ctx.fillText('ぶっ壊せ!!', 0, 0);
  ctx.restore();
}
function paintConcreteWall(dark) {
  return (ctx, w, h, p) => {
    ctx.fillStyle = '#7b7e82'; ctx.fillRect(0, 0, w, h);
    blotches(ctx, w, h, p, 40, 'rgba(40,42,45,A)', 'rgba(180,182,185,A)');
    for (let i = 0; i < 30; i++) {
      const x = rand(0, w), y0 = rand(0, h * 0.5);
      const g = ctx.createLinearGradient(0, y0, 0, y0 + rand(0.5, 2) * p);
      g.addColorStop(0, 'rgba(30,30,30,0.12)'); g.addColorStop(1, 'rgba(30,30,30,0)');
      ctx.fillStyle = g; ctx.fillRect(x, y0, rand(2, 6), 2 * p);
    }
    paintNoise(ctx, w, h, 18);
    const pw = 0.9 * p, ph = 0.6 * p;
    ctx.strokeStyle = 'rgba(40,42,45,0.35)'; ctx.lineWidth = 1.5;
    for (let x = 0; x < w; x += pw) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += ph) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    for (let x = 0; x < w; x += pw) for (let y = 0; y < h; y += ph) {
      for (const fx of [0.17, 0.5, 0.83]) for (const fy of [0.25, 0.75]) {
        ctx.beginPath(); ctx.arc(x + fx * pw, y + fy * ph, 0.016 * p, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(35,36,38,0.7)'; ctx.fill();
      }
    }
    // shade: walls are lit less than the floor, darker toward the back corner
    const g = ctx.createLinearGradient(0, h * 0.6, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const gx = ctx.createLinearGradient(dark ? w : 0, 0, dark ? 0 : w, 0);
    gx.addColorStop(0, 'rgba(0,0,0,0.45)'); gx.addColorStop(1, 'rgba(0,0,0,0.1)');
    ctx.fillStyle = gx; ctx.fillRect(0, 0, w, h);
  };
}
const floorS = new Surface(8, 10, 110, paintFloor);
const backS = new Surface(8, 5, 180, paintBricks);
const leftS = new Surface(10, 5, 100, paintConcreteWall(false));
const rightS = new Surface(10, 5, 100, paintConcreteWall(true));
const SURFACES = [floorS, backS, leftS, rightS];

function roomFace(el, w, h, c, u, n) {
  const v = new V().crossV(n, u);
  el.classList.add('f');
  el.style.width = (w * S) + 'px'; el.style.height = (h * S) + 'px';
  el.style.transform = faceMatrix(w, h, c, u, v, n, S);
  worldEl.appendChild(el);
  return el;
}
roomFace(floorS.canvas, 8, 10, new V(0, 0, 0), new V(1, 0, 0), new V(0, 1, 0));
roomFace(backS.canvas, 8, 5, new V(0, 2.5, -5), new V(1, 0, 0), new V(0, 0, 1));
roomFace(leftS.canvas, 10, 5, new V(-4, 2.5, 0), new V(0, 0, -1), new V(1, 0, 0));
roomFace(rightS.canvas, 10, 5, new V(4, 2.5, 0), new V(0, 0, 1), new V(-1, 0, 0));
{
  const ceil = document.createElement('div'); ceil.className = 'room';
  ceil.style.background = 'linear-gradient(#141518, #2a2c31)';
  roomFace(ceil, 8, 10, new V(0, 5, 0), new V(1, 0, 0), new V(0, -1, 0));
  for (const x of [-1.6, 1.6]) for (const z of [-3, 0.5]) {
    const t = document.createElement('div'); t.className = 'tube';
    roomFace(t, 0.12, 1.6, new V(x, 4.97, z), new V(1, 0, 0), new V(0, -1, 0));
  }
  const bb = document.createElement('div'); bb.style.background = '#25272b';
  roomFace(bb, 8, 0.12, new V(0, 0.06, -4.99), new V(1, 0, 0), new V(0, 0, 1));
}

/* ---------- physics planes ---------- */
const PLANES = [
  { n: new V(0, 1, 0), d: 0, floor: true, surf: floorS, map: p => [p.x + 4, p.z + 5], dust: [0.55, 0.54, 0.5] },
  { n: new V(0, 0, 1), d: -5, back: true, surf: backS, map: p => [p.x + 4, 5 - p.y], dust: [0.62, 0.42, 0.34] },
  { n: new V(1, 0, 0), d: -4, surf: leftS, map: p => [5 - p.z, 5 - p.y], dust: [0.55, 0.56, 0.58] },
  { n: new V(-1, 0, 0), d: -4, surf: rightS, map: p => [p.z + 5, 5 - p.y], dust: [0.55, 0.56, 0.58] },
  { n: new V(0, 0, -1), d: -7.5, dust: [0.5, 0.5, 0.5] },
  { n: new V(0, -1, 0), d: -5, dust: [0.3, 0.3, 0.3] },
];

/* =========================================================
   Particles (Canvas2D overlay, projected with the same camera)
   ========================================================= */
class Particles {
  constructor(max, opt) {
    opt = opt || {};
    this.max = max; this.i = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.c = new Float32Array(max * 3); this.a = new Float32Array(max);
    this.s = new Float32Array(max); this.grow = new Float32Array(max);
    this.life = new Float32Array(max); this.ml = new Float32Array(max);
    this.additive = !!opt.additive; this.floor = !!opt.floor;
    this.gravity = opt.gravity === undefined ? 1 : opt.gravity; this.drag = opt.drag || 0;
  }
  emit(px, py, pz, vx, vy, vz, life, r, g, b, a, size, grow) {
    const i = this.i; this.i = (this.i + 1) % this.max;
    this.p[i * 3] = px; this.p[i * 3 + 1] = py; this.p[i * 3 + 2] = pz;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.c[i * 3] = r; this.c[i * 3 + 1] = g; this.c[i * 3 + 2] = b;
    this.a[i] = a; this.s[i] = size; this.grow[i] = grow || 0;
    this.life[i] = life; this.ml[i] = life;
  }
  update(dt) {
    const p = this.p, v = this.v, gdt = G * this.gravity * dt, dr = Math.max(0, 1 - this.drag * dt);
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const j = i * 3;
      v[j + 1] -= gdt;
      if (this.drag) { v[j] *= dr; v[j + 1] *= dr; v[j + 2] *= dr; }
      p[j] += v[j] * dt; p[j + 1] += v[j + 1] * dt; p[j + 2] += v[j + 2] * dt;
      if (this.floor && p[j + 1] < 0.004) {
        p[j + 1] = 0.004; v[j + 1] = -v[j + 1] * 0.2; v[j] *= 0.5; v[j + 2] *= 0.5;
        if (Math.abs(v[j + 1]) < 0.2) v[j + 1] = 0;
      }
      if (p[j + 2] < -4.99) { p[j + 2] = -4.99; v[j + 2] *= -0.2; }
      if (p[j] < -3.99) { p[j] = -3.99; v[j] *= -0.2; } else if (p[j] > 3.99) { p[j] = 3.99; v[j] *= -0.2; }
      this.s[i] += this.grow[i] * dt;
    }
  }
  draw(ctx) {
    ctx.globalCompositeOperation = this.additive ? 'lighter' : 'source-over';
    const o = { x: 0, y: 0, k: 0 }, pt = _vd;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      pt.set(this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]);
      if (!project(pt, o)) continue;
      const rad = Math.max(0.6, this.s[i] * o.k * 0.5);
      const al = this.a[i] * Math.min(1, this.life[i] / (this.ml[i] * 0.4));
      ctx.fillStyle = `rgba(${(this.c[i * 3] * 255) | 0},${(this.c[i * 3 + 1] * 255) | 0},${(this.c[i * 3 + 2] * 255) | 0},${al.toFixed(3)})`;
      if (rad < 1.5) ctx.fillRect(o.x - rad, o.y - rad, rad * 2, rad * 2);
      else { ctx.beginPath(); ctx.arc(o.x, o.y, rad, 0, 6.2832); ctx.fill(); }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  clear() { this.life.fill(0); }
}
const dusts = new Particles(900, { gravity: -0.03, drag: 1.6 });
const grains = new Particles(2500, { floor: true, gravity: 1, drag: 0.2 });
const sparks = new Particles(1500, { additive: true, floor: true, gravity: 0.7 });
const PSYS = [dusts, grains, sparks];

function sparkBurst(pos, n, electric) {
  for (let i = 0; i < n; i++) {
    const d = _va.randDir().mul(electric ? rand(2, 9) : rand(1.5, 7));
    const c = electric ? (Math.random() < 0.5 ? [0.55, 0.85, 1] : [0.9, 0.95, 1]) : (Math.random() < 0.5 ? [1, 0.75, 0.3] : [1, 0.5, 0.15]);
    sparks.emit(pos.x, pos.y, pos.z, d.x, d.y + rand(0, 2), d.z, rand(0.15, electric ? 0.35 : 0.6), c[0], c[1], c[2], 1, rand(0.012, 0.022), 0);
  }
}
function dustBurst(pos, plane, n, col) {
  col = col || (plane && plane.dust) || [0.5, 0.5, 0.5];
  const nn = plane ? plane.n : AY;
  for (let i = 0; i < n; i++) {
    const d = _va.randDir().mul(rand(0.3, 1.2)).addS(nn, rand(0.4, 1.8));
    const k = rand(0.85, 1.1);
    dusts.emit(pos.x + rand(-0.05, 0.05), pos.y + rand(-0.05, 0.05), pos.z + rand(-0.05, 0.05), d.x, d.y, d.z,
      rand(0.8, 1.7), col[0] * k, col[1] * k, col[2] * k, rand(0.2, 0.35), rand(0.1, 0.25), rand(0.4, 0.8));
  }
}
function grainBurst(pos, n, col, alpha, size, spd) {
  for (let i = 0; i < n; i++) {
    const d = _va.randDir().mul(rand(0.3, 1) * spd);
    const c = Array.isArray(col[0]) ? pick(col) : col;
    grains.emit(pos.x, pos.y, pos.z, d.x, d.y + rand(0.5, 2.5), d.z, rand(3, 6), c[0], c[1], c[2], alpha, size * rand(0.7, 1.3), 0);
  }
}

/* =========================================================
   Materials & textures
   ========================================================= */
function hex(c) { return [(c >> 16) & 255, (c >> 8) & 255, c & 255]; }
function M(c, o) { return Object.assign({ c: hex(c), a: 1, snd: 'plastic' }, o || {}); }
function texURL(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return c.toDataURL();
}
const laptopTex = texURL(512, 330, (ctx, w, h) => {
  ctx.fillStyle = '#1e1f29'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#2c2e3b'; ctx.fillRect(0, 0, w, 18);
  ['#ff5f56', '#ffbd2e', '#27c93f'].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(10 + i * 14, 9, 4, 0, 7); ctx.fill(); });
  const cols = ['#c792ea', '#82aaff', '#c3e88d', '#f78c6c', '#89ddff', '#ffcb6b'];
  for (let y = 28; y < h - 6; y += 11) {
    ctx.fillStyle = '#4a4d63'; ctx.fillRect(6, y, 14, 5);
    let x = 28 + (Math.random() * 4 | 0) * 12;
    while (x < w - 60 && Math.random() < 0.85) { const lw = rand(14, 70); ctx.fillStyle = pick(cols); ctx.fillRect(x, y, lw, 5); x += lw + 6; }
  }
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#f2f2f2'; ctx.fillRect(96, 100, 320, 130);
  ctx.fillStyle = '#d93a3a'; ctx.fillRect(96, 100, 320, 24);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.fillText('エラー', 106, 117);
  ctx.fillStyle = '#222'; ctx.font = 'bold 15px sans-serif';
  ctx.fillText('仕様が変更されました。', 116, 152);
  ctx.fillText('納期は「今日」です。', 116, 176);
  ctx.fillStyle = '#3b7ddd'; ctx.fillRect(330, 196, 70, 24);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.fillText('OK', 356, 213);
});
const crtTex = texURL(256, 200, (ctx, w, h) => {
  ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * w / 7, 0, w / 7 + 1, h * 0.7); });
  ['#0000c0', '#111', '#c000c0', '#111', '#00c0c0', '#111', '#c0c0c0'].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * w / 7, h * 0.7, w / 7 + 1, h * 0.08); });
  ctx.fillStyle = '#0a1a44'; ctx.fillRect(0, h * 0.78, w * 0.3, h); ctx.fillStyle = '#fff'; ctx.fillRect(w * 0.3, h * 0.78, w * 0.2, h);
  ctx.fillStyle = '#111'; ctx.fillRect(w * 0.5, h * 0.78, w, h);
  for (let y = 0; y < h; y += 2) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, y, w, 1); }
  const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.7);
  g.addColorStop(0, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
});
const keyboardTex = texURL(512, 200, (ctx, w, h) => {
  ctx.fillStyle = '#15161a'; ctx.fillRect(0, 0, w, h);
  [14, 14, 13, 12, 9].forEach((n, r) => {
    const kw = (w - 16) / 14.5;
    for (let i = 0; i < n; i++) {
      let x = 8 + i * kw + r * kw * 0.25, ww = kw - 4;
      if (r === 4 && i === 4) ww = kw * 5;
      if (r === 4 && i > 4) x += kw * 4;
      ctx.fillStyle = '#2d2f35'; ctx.fillRect(x, 8 + r * 38, ww, 32);
      ctx.fillStyle = '#3a3c43'; ctx.fillRect(x + 2, 10 + r * 38, ww - 4, 26);
    }
  });
});

const MAT = {
  paintWhite: M(0xf1f0ea, { snd: 'metal' }),
  white: M(0xf4f4f0),
  cream: M(0xd6ccb6),
  black: M(0x1d1e22),
  dark: M(0x3a3c41),
  gray: M(0x9ea2a8),
  lightGray: M(0xd2d5d9),
  steel: M(0xc5cad0, { snd: 'metal', sheen: true }),
  chrome: M(0xe2e4e7, { snd: 'metal', sheen: true }),
  alu: M(0xb9bdc3, { snd: 'metal', sheen: true }),
  red: M(0xc4262e, { snd: 'metal', sheen: true }),
  redPlastic: M(0xd02a2a),
  copper: M(0xb87333, { snd: 'metal', sheen: true }),
  glassDark: M(0x0b0e12, { a: 0.92, snd: 'glass' }),
  glassClear: M(0xbfe0ee, { a: 0.35, snd: 'glass' }),
  lcd: M(0x38ff7a, { emissive: true, snd: 'glass' }),
  ledBlue: M(0x3aa0ff, { emissive: true, snd: 'glass' }),
  ledOrange: M(0xff8a20, { emissive: true, snd: 'glass' }),
  pcb: M(0x1d6a3c),
  toast: M(0xcf9450, { snd: 'soft' }),
  paper: M(0xfafafa, { snd: 'soft', dbl: true }),
  blade: M(0x8cc4ee, { a: 0.8, dbl: true }),
  ring: M(0xf2f2ee, { ring: 3, dbl: true }),
  coffee: M(0x3b2416, { snd: 'soft' }),
  cyan: M(0x00a8d8), magenta: M(0xd0007a), yellow: M(0xf2d000),
  screenLaptop: M(0xffffff, { tex: laptopTex, emissive: true, snd: 'glass' }),
  screenCRT: M(0xffffff, { tex: crtTex, emissive: true, snd: 'glass' }),
  keyboard: M(0xffffff, { tex: keyboardTex }),
};
const MUG_COLORS = [0xf4efe6, 0xe85d5d, 0x4f8ad9, 0xf2c94c, 0x5cc49a, 0x2b2b2b];

/* =========================================================
   Item builders
   ========================================================= */
function put(it, part, x, y, z, rx, ry, rz) {
  const en = { part, lp: new V(x || 0, y || 0, z || 0), lq: new Q().euler(rx || 0, ry || 0, rz || 0) };
  it.entries.push(en); return en;
}
function putQ(it, part, p, q) { const en = { part, lp: p.clone(), lq: q.clone() }; it.entries.push(en); return en; }
function P(it, x, y, z, rx, ry, rz) { const p = newPart(); put(it, p, x, y, z, rx, ry, rz); return p; }
function Sp(it, r, m, x, y, z) { const p = makeSprite(r, m); put(it, p, x, y, z); return p; }
const HALF = Math.PI / 2;

function buildMicrowave(it) {
  const Wd = 0.5, Ht = 0.3, D = 0.38, Fz = D / 2;
  let p = P(it, 0, 0, 0); addBox(p, Wd, Ht, D, MAT.paintWhite); p.core = true;
  p = P(it, -0.06, 0, Fz + 0.002); addPlate(p, 0.36, 0.25, MAT.black);
  p = P(it, -0.07, 0, Fz + 0.004); addPlate(p, 0.28, 0.17, MAT.glassDark);
  p = P(it, 0.095, 0, Fz + 0.017); addBox(p, 0.022, 0.2, 0.03, MAT.lightGray);
  p = P(it, 0.19, 0, Fz + 0.002); addPlate(p, 0.1, 0.25, MAT.dark);
  p = P(it, 0.19, 0.08, Fz + 0.004); addPlate(p, 0.07, 0.025, MAT.lcd);
  for (let i = 0; i < 6; i++) { p = P(it, 0.175 + (i % 2) * 0.03, 0.035 - Math.floor(i / 2) * 0.028, Fz + 0.004); addPlate(p, 0.025, 0.015, MAT.gray); }
  p = P(it, 0.19, -0.08, Fz + 0.01, HALF, 0, 0); addCyl(p, 0.022, 0.022, 0.016, 8, MAT.steel, null, 'top');
  p = P(it, -0.06, -0.12, 0, -HALF, 0, 0); addPlate(p, 0.26, 0.26, MAT.glassClear, null, { round: true });
  p = P(it, 0.17, 0.05, -0.06); addBox(p, 0.08, 0.06, 0.1, MAT.steel);
  p = P(it, 0.19, -0.1, 0, -HALF, 0, 0); addPlate(p, 0.09, 0.18, MAT.pcb);
}
function buildKettle(it) {
  let p = P(it, 0, 0, 0); addCyl(p, 0.075, 0.09, 0.2, 12, MAT.steel); p.core = true;
  p = P(it, 0, 0.1125, 0); addCyl(p, 0.07, 0.077, 0.025, 12, MAT.black);
  Sp(it, 0.018, MAT.black, 0, 0.135, 0);
  p = P(it, -0.085, 0.01, 0); addArc(p, 0.065, 0.022, 5, HALF, Math.PI * 1.5, MAT.black);
  p = P(it, 0.1, 0.05, 0, 0, 0, -0.9); addCyl(p, 0.012, 0.024, 0.1, 6, MAT.steel, null, 'top');
  p = P(it, 0, -0.118, 0); addCyl(p, 0.1, 0.105, 0.03, 12, MAT.black);
  Sp(it, 0.008, MAT.ledBlue, -0.1, -0.06, 0.03);
  p = P(it, 0, 0, 0.084); addPlate(p, 0.025, 0.11, MAT.glassClear);
}
function buildRiceCooker(it) {
  let p = P(it, 0, -0.035, 0); addCyl(p, 0.15, 0.14, 0.17, 14, MAT.white, null, 'bottom'); p.core = true;
  p = P(it, 0, 0.05, 0); addLathe(p, [[0.15, 0], [0.138, 0.03], [0.1, 0.055], [0, 0.066]], 12, MAT.white, null, false, false);
  p = P(it, 0, 0.05, 0); addCyl(p, 0.153, 0.153, 0.02, 14, MAT.alu, null, 'none');
  p = P(it, 0, -0.03, 0.146); addPlate(p, 0.13, 0.07, MAT.dark);
  p = P(it, 0, -0.012, 0.148); addPlate(p, 0.06, 0.022, MAT.lcd);
  for (let i = 0; i < 3; i++) { p = P(it, -0.04 + i * 0.04, -0.048, 0.148); addPlate(p, 0.018, 0.018, i === 1 ? MAT.ledOrange : MAT.gray, null, { round: true }); }
  p = P(it, 0, 0.065, -0.02); addArc(p, 0.09, 0.018, 5, 0, Math.PI, MAT.gray);
  p = P(it, 0, 0.07, 0.125); addBox(p, 0.045, 0.016, 0.03, MAT.gray);
  p = P(it, 0, -0.03, 0); addCyl(p, 0.13, 0.12, 0.15, 10, MAT.steel, null, 'none', { dbl: true });
}
function buildLaptop(it) {
  let p = P(it, 0, 0, 0); addBox(p, 0.34, 0.018, 0.24, MAT.alu); p.core = true;
  p = P(it, 0, 0.0095, -0.03, -HALF, 0, 0); addPlate(p, 0.29, 0.11, MAT.keyboard);
  p = P(it, 0, 0.0095, 0.075, -HALF, 0, 0); addPlate(p, 0.1, 0.06, MAT.lightGray);
  p = P(it, 0, 0, -0.03, -HALF, 0, 0); addPlate(p, 0.24, 0.13, MAT.pcb);
  const pq = new Q().euler(-1.85, 0, 0), piv = new V(0, 0.009, -0.12);
  p = newPart(); addBox(p, 0.34, 0.008, 0.24, MAT.alu);
  putQ(it, p, new V(0, 0.004, 0.12).applyQ(pq).add(piv), pq);
  p = newPart(); addPlate(p, 0.31, 0.2, MAT.screenLaptop);
  putQ(it, p, new V(0, -0.0015, 0.12).applyQ(pq).add(piv), new Q().mulQ(pq, new Q().euler(HALF, 0, 0)));
}
function buildCRT(it) {
  let p = P(it, 0, 0, 0.08); addBox(p, 0.52, 0.42, 0.14, MAT.cream); p.core = true;
  p = P(it, 0, 0, -0.14, -HALF, Math.PI / 4, 0); addCyl(p, 0.17, 0.31, 0.3, 4, MAT.cream, null, 'top');
  p = P(it, -0.04, 0.02, 0.151); addPlate(p, 0.4, 0.32, MAT.dark);
  p = P(it, -0.04, 0.02, 0.153); addPlate(p, 0.37, 0.29, MAT.screenCRT);
  for (const y of [0.1, 0.03]) { p = P(it, 0.205, y, 0.157, HALF, 0, 0); addCyl(p, 0.022, 0.022, 0.014, 6, MAT.dark, null, 'top'); }
  p = P(it, 0.205, -0.1, 0.151); addPlate(p, 0.07, 0.1, MAT.black);
  p = P(it, 0.205, -0.17, 0.152); addPlate(p, 0.03, 0.015, MAT.redPlastic);
  p = P(it, 0, 0.222, -0.02); addBox(p, 0.09, 0.025, 0.06, MAT.dark);
  p = P(it, -0.104, 0.384, -0.02, 0, 0, 0.5); addBox(p, 0.008, 0.35, 0.008, MAT.chrome);
  p = P(it, 0.104, 0.384, -0.02, 0, 0, -0.5); addBox(p, 0.008, 0.35, 0.008, MAT.chrome);
  Sp(it, 0.012, MAT.chrome, -0.188, 0.538, -0.02);
  Sp(it, 0.012, MAT.chrome, 0.188, 0.538, -0.02);
  p = P(it, 0, -0.18, -0.03, -HALF, 0, 0); addPlate(p, 0.38, 0.22, MAT.pcb);
}
function buildToaster(it) {
  let p = P(it, 0, 0, 0); addBox(p, 0.28, 0.18, 0.16, MAT.red); p.core = true;
  p = P(it, 0, 0.0905, 0, -HALF, 0, 0); addPlate(p, 0.27, 0.15, MAT.chrome);
  for (const z of [-0.035, 0.035]) {
    p = P(it, 0, 0.0915, z, -HALF, 0, 0); addPlate(p, 0.2, 0.028, MAT.black);
    p = P(it, 0, 0.075, z); addBox(p, 0.11, 0.12, 0.014, MAT.toast);
  }
  p = P(it, 0.155, 0.04, 0); addBox(p, 0.03, 0.015, 0.045, MAT.black);
  p = P(it, 0.146, -0.03, 0, 0, 0, -HALF); addCyl(p, 0.016, 0.016, 0.014, 8, MAT.chrome, null, 'top');
  p = P(it, 0, -0.05, 0, -HALF, 0, 0); addPlate(p, 0.22, 0.12, MAT.copper);
}
function buildPrinter(it) {
  let p = P(it, 0, 0, 0); addBox(p, 0.42, 0.17, 0.32, MAT.lightGray); p.core = true;
  p = P(it, 0, 0.0975, 0.01); addBox(p, 0.42, 0.025, 0.3, MAT.gray);
  p = P(it, 0, -0.04, 0.2, -HALF, 0, 0); addPlate(p, 0.3, 0.12, MAT.dark);
  p = P(it, 0, -0.036, 0.19, -HALF, 0, 0); addPlate(p, 0.21, 0.1, MAT.paper);
  p = P(it, 0, 0.14, -0.18, -0.97, 0, 0); addPlate(p, 0.3, 0.14, MAT.dark);
  p = P(it, 0, 0.1435, -0.1775, -0.97, 0, 0); addPlate(p, 0.21, 0.13, MAT.paper);
  p = P(it, 0.13, 0.1105, 0.12, -HALF, 0, 0); addPlate(p, 0.12, 0.05, MAT.dark);
  p = P(it, 0.12, 0.112, 0.12, -HALF, 0, 0); addPlate(p, 0.05, 0.03, MAT.lcd);
  [MAT.cyan, MAT.magenta, MAT.yellow, MAT.black].forEach((m, i) => { p = P(it, -0.1 + i * 0.045, 0.02, 0); addBox(p, 0.035, 0.05, 0.06, m); });
  p = P(it, 0, -0.07, -0.08, -HALF, 0, 0); addPlate(p, 0.3, 0.1, MAT.pcb);
}
function buildFan(it) {
  let p = P(it, 0, 0, 0); addCyl(p, 0.15, 0.16, 0.04, 12, MAT.white); p.core = true;
  [MAT.redPlastic, MAT.gray, MAT.gray, MAT.gray].forEach((m, i) => { p = P(it, -0.045 + i * 0.03, 0.0205, 0.1, -HALF, 0, 0); addPlate(p, 0.025, 0.02, m); });
  p = P(it, 0, 0.25, -0.03); addCyl(p, 0.016, 0.018, 0.46, 6, MAT.white, null, 'none');
  const hq = new Q().euler(-0.1, 0, 0), hp = new V(0, 0.52, -0.03);
  const at = (z) => new V(0, 0, z).applyQ(hq).add(hp);
  p = newPart(); addCyl(p, 0.055, 0.065, 0.12, 10, MAT.white); putQ(it, p, at(-0.06), new Q().mulQ(hq, new Q().euler(HALF, 0, 0)));
  p = newPart(); addPlate(p, 0.36, 0.36, MAT.ring, null, { round: true });
  for (let k = 0; k < 4; k++) addPlate(p, 0.36, 0.006, MAT.white, fr(0, 0, 0, 0, 0, k * Math.PI / 4));
  addPlate(p, 0.07, 0.07, MAT.white, fr(0, 0, 0.003), { round: true });
  putQ(it, p, at(0.065), hq);
  p = newPart(); addPlate(p, 0.36, 0.36, MAT.ring, null, { round: true }); putQ(it, p, at(-0.01), hq);
  p = newPart(); addPlate(p, 0.06, 0.06, MAT.blade, null, { round: true });
  for (let k = 0; k < 5; k++) {
    const a = k * Math.PI * 2 / 5;
    addPlate(p, 0.15, 0.085, MAT.blade, { o: new V(0.09 * Math.cos(a), 0.09 * Math.sin(a), 0), q: new Q().mulQ(new Q().euler(0, 0, a), new Q().euler(0.35, 0, 0)) }, { round: true });
  }
  const en = putQ(it, p, at(0.025), hq); en.spin = true; en.lq0 = hq.clone();
}
function buildMug(it) {
  const m = M(pick(MUG_COLORS), { snd: 'ceramic', dbl: true });
  let p = P(it, 0, 0, 0); addLathe(p, [[0.042, -0.05], [0.045, 0.05]], 12, m, null, true, false); p.core = true;
  p = P(it, 0, 0.035, 0, -HALF, 0, 0); addPlate(p, 0.078, 0.078, MAT.coffee, null, { round: true });
  p = P(it, 0.044, 0, 0); addArc(p, 0.03, 0.014, 4, -HALF, HALF, m);
}

const ITEMS = [
  { id: 'microwave', name: '電子レンジ', price: 25000, hp: 60, mass: 12, snd: 'metal', electric: true, chip: 0.03, build: buildMicrowave },
  { id: 'kettle', name: '電気ケトル', price: 4000, hp: 30, mass: 1.2, snd: 'metal', electric: true, special: 'water', chip: 0.012, build: buildKettle },
  { id: 'rice', name: '炊飯器', price: 30000, hp: 45, mass: 4, snd: 'plastic', electric: true, special: 'rice', chip: 0.022, build: buildRiceCooker },
  { id: 'laptop', name: 'ノートPC', price: 150000, hp: 22, mass: 1.6, snd: 'metal', electric: true, chip: 0.015, build: buildLaptop },
  { id: 'crt', name: 'ブラウン管TV', price: 30000, hp: 55, mass: 15, snd: 'plastic', electric: true, special: 'crt', chip: 0.035, build: buildCRT },
  { id: 'toaster', name: 'トースター', price: 5000, hp: 35, mass: 2, snd: 'metal', electric: true, chip: 0.02, build: buildToaster },
  { id: 'printer', name: 'プリンター', price: 20000, hp: 40, mass: 6, snd: 'plastic', electric: true, special: 'ink', chip: 0.03, build: buildPrinter },
  { id: 'fan', name: '扇風機', price: 6000, hp: 18, mass: 3, snd: 'plastic', electric: true, chip: 0.02, build: buildFan },
  { id: 'mug', name: 'マグカップ', price: 1200, hp: 3, mass: 0.35, snd: 'ceramic', special: 'coffee', chip: 0.012, build: buildMug },
];

function buildItem(def) {
  const it = { def, entries: [], hp: def.hp, maxHp: def.hp, min: new V(1e9, 1e9, 1e9), max: new V(-1e9, -1e9, -1e9) };
  def.build(it);
  for (const en of it.entries) {
    const pm = en.part.min, px = en.part.max;
    for (let i = 0; i < 8; i++) {
      _va.set(i & 1 ? px.x : pm.x, i & 2 ? px.y : pm.y, i & 4 ? px.z : pm.z).applyQ(en.lq).add(en.lp);
      it.min.min(_va); it.max.max(_va);
    }
  }
  const c = it.min.clone().add(it.max).mul(0.5);
  for (const en of it.entries) en.lp.sub(c);
  it.min.sub(c); it.max.sub(c);
  return it;
}

/* =========================================================
   Physics bodies
   ========================================================= */
const _r = new V(), _vcp = new V(), _imp = new V(), _cp = new V(), _t1 = new V(), _t2 = new V(), _t3 = new V(), _axis = new V(), _q = new Q();
const _dists = new Float32Array(8);
const REST = { metal: 0.3, plastic: 0.35, glass: 0.15, ceramic: 0.2, soft: 0.08 };

class Body {
  constructor(entries, mn, mx, o) {
    o = o || {};
    this.entries = entries;
    this.pos = new V(); this.q = new Q(); this.vel = new V(); this.ang = new V();
    const th = 0.003;
    const x0 = Math.min(mn.x, -th), y0 = Math.min(mn.y, -th), z0 = Math.min(mn.z, -th);
    const x1 = Math.max(mx.x, th), y1 = Math.max(mx.y, th), z1 = Math.max(mx.z, th);
    this.corners = []; this.wc = [];
    for (let i = 0; i < 8; i++) { this.corners.push(new V(i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0)); this.wc.push(new V()); }
    const sx = x1 - x0, sy = y1 - y0, sz = z1 - z0;
    this.size = Math.max(sx, sy, sz);
    this.mass = o.mass || 1; this.invMass = 1 / this.mass;
    this.invI = 1 / (this.mass * (sx * sx + sy * sy + sz * sz) / 18 + 1e-6);
    this.snd = o.snd || 'plastic';
    this.e = REST[this.snd] !== undefined ? REST[this.snd] : 0.3;
    this.mu = 0.5;
    this.paper = !!o.paper; this.ph = Math.random() * 10;
    this.sleep = false; this.sleepT = 0; this.sleepAge = 0; this.age = 0; this.contact = false; this.dirty = true;
    this.impact = null; this.main = false; this.chip = false; this.sparkT = 0; this.blob = null;
  }
  updateCorners() { for (let i = 0; i < 8; i++) this.wc[i].copy(this.corners[i]).applyQ(this.q).add(this.pos); }
  step(dt) {
    if (this.sleep) return;
    const v = this.vel, w = this.ang;
    v.y -= G * dt;
    if (this.paper) {
      const t = this.age;
      v.x += Math.sin(t * 7 + this.ph) * 5 * dt; v.z += Math.cos(t * 5 + this.ph) * 4 * dt;
      if (v.y < -0.9) v.y += (-0.9 - v.y) * Math.min(1, 8 * dt);
      const k = Math.max(0, 1 - 1.5 * dt); v.x *= k; v.z *= k; w.mul(Math.max(0, 1 - 1.2 * dt));
    }
    this.pos.addS(v, dt);
    const wl = w.len();
    if (wl > 1e-6) { _axis.copy(w).mul(1 / wl); _q.axisAngle(_axis, wl * dt); this.q.premul(_q).norm(); }
    this.updateCorners();
    for (let i = 0; i < PLANES.length; i++) this.collide(PLANES[i]);
  }
  collide(P) {
    const n = P.n, wc = this.wc;
    let minD = Infinity;
    for (let i = 0; i < 8; i++) { const d = n.dot(wc[i]) - P.d; _dists[i] = d; if (d < minD) minD = d; }
    if (minD >= 0) return;
    const pos = this.pos;
    pos.addS(n, -minD);
    for (let i = 0; i < 8; i++) wc[i].addS(n, -minD);
    _cp.set(0, 0, 0); let cnt = 0;
    for (let i = 0; i < 8; i++) if (_dists[i] < minD + 0.012) { _cp.add(wc[i]); cnt++; }
    _cp.mul(1 / cnt);
    if (P.floor) this.contact = true;
    _r.copy(_cp).sub(pos);
    _vcp.crossV(this.ang, _r).add(this.vel);
    const vn = _vcp.dot(n);
    if (vn >= 0) return;
    const speed = -vn;
    if (speed > 1.5 && (!this.impact || speed > this.impact.speed)) this.impact = { speed, point: _cp.clone(), normal: n, plane: P };
    const e = speed > 1.2 ? this.e : 0;
    _t1.crossV(_r, n);
    const j = (1 + e) * speed / (this.invMass + this.invI * _t1.lenSq());
    _imp.copy(n).mul(j);
    _t2.copy(_vcp).addS(n, -vn);
    const vtl = _t2.len();
    if (vtl > 1e-5) {
      _t2.mul(1 / vtl);
      _t3.crossV(_r, _t2);
      const jt = Math.min(vtl / (this.invMass + this.invI * _t3.lenSq()), this.mu * j);
      _imp.addS(_t2, -jt);
    }
    this.vel.addS(_imp, this.invMass);
    _t1.crossV(_r, _imp).mul(this.invI);
    this.ang.add(_t1);
  }
}

const bodies = [];
const MAX_BODIES = 170;
const _wq = new Q(), _wp = new V(), _sq = new Q(), FLAT = new Q().euler(-HALF, 0, 0);
const BLOB_BASE = faceMatrix(1, 1, new V(), new V(1, 0, 0), new V(0, 1, 0), new V(0, 0, 1), 100);

function renderBody(b) {
  for (const en of b.entries) {
    _wq.mulQ(b.q, en.lq);
    _wp.copy(en.lp).applyQ(b.q).add(b.pos);
    placePart(en.part, _wp, _wq, 1, camQ0, _wq);
  }
  if (b.blob) {
    const h = Math.max(0, b.pos.y);
    const s = b.size * (1.1 + h * 0.4);
    _m.compose(_va.set(b.pos.x, 0.004, b.pos.z), FLAT, s);
    b.blob.style.transform = _m.css() + ' ' + BLOB_BASE;
    b.blob.style.opacity = clamp(1 - h / 2.5, 0, 1).toFixed(2);
  }
}
function addBlob(b) {
  if (b.size < 0.12) return;
  const el = document.createElement('div'); el.className = 'blob';
  worldEl.insertBefore(el, worldEl.firstChild.nextSibling);
  b.blob = el;
}
function removeBodyAt(k) {
  const b = bodies.splice(k, 1)[0];
  for (const en of b.entries) en.part.el.remove();
  if (b.blob) b.blob.remove();
}
function enforceLimit() {
  while (bodies.length > MAX_BODIES) {
    let k = bodies.findIndex(b => b.chip);
    if (k < 0) k = bodies.findIndex(b => !b.main);
    if (k < 0) break;
    removeBodyAt(k);
  }
}
/* turn one entry (world transform known) into an independent body */
function entryToDebris(part, wp, wq) {
  const b = new Body([{ part, lp: new V(), lq: new Q() }], part.min, part.max, { snd: part.snd });
  b.pos.copy(wp); b.q.copy(wq);
  if (part.el.parentNode !== worldEl) worldEl.appendChild(part.el);
  bodies.push(b); addBlob(b);
  return b;
}
function randomClip() {
  if (Math.random() < 0.5) return `polygon(${rand(0, 100).toFixed(0)}% 0, 100% ${rand(30, 100).toFixed(0)}%, ${rand(0, 40).toFixed(0)}% 100%)`;
  return `polygon(${rand(0, 30).toFixed(0)}% 0, 100% ${rand(0, 30).toFixed(0)}%, ${rand(70, 100).toFixed(0)}% 100%, 0 ${rand(60, 100).toFixed(0)}%)`;
}
function spawnChips(point, baseV, m, count, size, speed) {
  for (let i = 0; i < count; i++) {
    const part = newPart();
    face(part, size * rand(0.5, 1.5), size * rand(0.5, 1.5), new V(), new V(1, 0, 0), new V(0, 0, 1), m, { dbl: true, clip: randomClip() });
    worldEl.appendChild(part.el);
    const b = new Body([{ part, lp: new V(), lq: new Q() }], part.min, part.max, { snd: m.snd });
    b.chip = true;
    b.pos.copy(point).add(_va.randDir().mul(rand(0, 0.06)));
    b.q.random();
    b.vel.copy(baseV).add(_va.randDir().mul(speed * rand(0.3, 1))); b.vel.y += speed * rand(0.1, 0.6);
    b.ang.randDir().mul(rand(8, 30));
    bodies.push(b);
  }
}
function spawnPapers(pos, n) {
  for (let i = 0; i < n; i++) {
    const part = newPart();
    addPlate(part, 0.21, 0.297, MAT.paper);
    worldEl.appendChild(part.el);
    const b = new Body([{ part, lp: new V(), lq: new Q() }], part.min, part.max, { snd: 'soft', paper: true });
    b.pos.copy(pos).add(_va.randDir().mul(0.1));
    b.q.random();
    b.vel.randDir().mul(rand(1, 4)); b.vel.y = rand(1.5, 5);
    b.ang.randDir().mul(rand(2, 8));
    bodies.push(b);
  }
}

/* dents: dark decal on the face that touched + slight face buckling */
function dentPart(part, pq, ppos, pointW, normalW, amount, crumple) {
  if (part.sprite || !part.faces.length) return;
  const qi = _qb.copy(pq).conj();
  const ln = _va.copy(normalW).applyQ(qi);
  const lp = _vb.copy(pointW).sub(ppos).applyQ(qi);
  let best = null, bd = -Infinity;
  for (const f of part.faces) { const d = -f.n.dot(ln); if (d > bd) { bd = d; best = f; } }
  const f = best;
  if (f.decals < 7 && !f.m.ring) {
    const rel = _vc.copy(lp).sub(f.c);
    const px = clamp((rel.dot(f.u) + f.w / 2) * FS, 0, f.w * FS), py = clamp((f.h / 2 - rel.dot(f.v)) * FS, 0, f.h * FS);
    const sz = Math.min(0.2, 0.04 + amount * 0.004) * FS;
    const d = document.createElement('div'); d.className = 'decal';
    d.style.cssText = `left:${(px - sz / 2).toFixed(1)}px;top:${(py - sz / 2).toFixed(1)}px;width:${sz.toFixed(1)}px;height:${sz.toFixed(1)}px`;
    f.el.appendChild(d); f.decals++;
  }
  if (crumple) {
    for (const ff of part.faces) {
      if (ff !== f && Math.random() > 0.5) continue;
      ff.tx = clamp(ff.tx + rand(-1, 1) * crumple, -25, 25); ff.ty = clamp(ff.ty + rand(-1, 1) * crumple, -25, 25);
      const hw = (ff.w * FS / 2).toFixed(1), hh = (ff.h * FS / 2).toFixed(1);
      ff.el.style.transform = `${ff.base} translate(${hw}px,${hh}px) rotateX(${ff.tx.toFixed(1)}deg) rotateY(${ff.ty.toFixed(1)}deg) translate(-${hw}px,-${hh}px)`;
    }
  }
}
function entryWorld(b, en, outP, outQ) {
  outQ.mulQ(b.q, en.lq);
  outP.copy(en.lp).applyQ(b.q).add(b.pos);
}

/* =========================================================
   Game state, HUD
   ========================================================= */
const fxLayer = $('fx');
let totalYen = 0, brokenCount = 0, stress = 100, reliefShown = false;
let combo = 0, lastBreak = 0;
let shake = 0, slowT = 0, timeScale = 1;
let lastDebrisSnd = 0;
let started = false;
let held = null, selected = 0, randomMode = false;
let charging = false, chargeT = 0, power = 0;

function updateHUD() {
  $('yen').textContent = yenFmt(totalYen);
  $('count').textContent = brokenCount;
  $('stressFill').style.width = stress + '%';
  $('stressFill').style.backgroundColor = `hsl(${(1 - stress / 100) * 130},80%,52%)`;
  $('stressVal').textContent = Math.ceil(stress) + '%';
}
function bumpYen() {
  const el = $('yen'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  setTimeout(() => el.classList.remove('bump'), 120);
}
function addYen(n, pos) {
  n = Math.round(n);
  if (n <= 0) return;
  totalYen += n; updateHUD(); bumpYen();
  popText('-' + yenFmt(n), pos, 'yen', 0, -30);
}
function relieve(x) {
  stress = Math.max(0, stress - x);
  updateHUD();
  if (stress <= 0 && !reliefShown) {
    reliefShown = true;
    setTimeout(() => {
      $('rYen').textContent = yenFmt(totalYen);
      $('rCount').textContent = brokenCount + '台';
      $('relief').classList.remove('hidden');
      charging = false;
      Snd.chime();
    }, 1400);
  }
}
const _proj = { x: 0, y: 0, k: 0 };
function popText(text, worldPos, cls, dx, dy) {
  if (!project(worldPos, _proj)) return;
  const x = clamp(_proj.x, 60, W - 60), y = clamp(_proj.y, 60, H - 140);
  const el = document.createElement('div');
  el.className = 'pop ' + cls;
  el.textContent = text;
  el.style.left = (x + (dx || 0)) + 'px';
  el.style.top = (y + (dy || 0)) + 'px';
  fxLayer.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}
function screenFlash(a) {
  const f = $('flashFx'); f.style.transition = 'none'; f.style.opacity = a;
  requestAnimationFrame(() => { f.style.transition = 'opacity .35s ease-out'; f.style.opacity = 0; });
}
const BREAK_WORDS = ['ガシャーン!!', 'バキィッ!!', 'ドゴォン!!', '木っ端微塵!!', '粉砕!!', 'グシャァ!!', 'ドカーン!!'];
const GLASS_WORDS = ['パリーン!!', 'ガッシャーン!!', 'パリパリィ!!'];
const HIT_WORDS = ['ゴンッ', 'ガンッ', 'ボコッ', 'ドカッ', 'メキッ', 'ベコッ'];

/* =========================================================
   Impacts / breaking
   ========================================================= */
const coreEntry = (b) => b.entries.find(en => en.part.core);

function mainImpact(b, imp) {
  const it = b.item, def = it.def, s = imp.speed;
  const pan = clamp(imp.point.x / 4, -1, 1);
  Snd.hit(def.snd, s, pan, 0, b.size);
  const dmg = Math.pow(Math.max(0, s - 4), 1.4);

  if (imp.plane.surf && s > 6) {
    const mm = imp.plane.map(imp.point);
    imp.plane.surf.crack(mm[0], mm[1], (s - 6) / 16 * Math.sqrt(def.mass / 4));
  }
  if (s > 4) dustBurst(imp.point, imp.plane, Math.round(4 + s * 0.8));
  if (def.snd === 'metal' && s > 8) sparkBurst(imp.point, Math.round(6 + s), false);
  shake += Math.min(0.6, s * 0.012 * Math.sqrt(def.mass / 3));

  if (imp.plane.back && s > 6) {
    const dx = imp.point.x, dy = imp.point.y - 1.5;
    if (dx * dx + dy * dy < 0.36) { popText('ど真ん中!!', new V(imp.point.x, imp.point.y + 0.45, imp.point.z), 'bull'); relieve(4); }
  }
  if (dmg <= 0) return;

  const dealt = Math.min(it.hp, dmg);
  it.hp -= dmg;
  addYen(def.price * dealt / it.maxHp, imp.point);
  relieve(dealt / it.maxHp * 9);

  if (it.hp <= 0) { shatter(b, imp); return; }

  const ce = coreEntry(b);
  if (ce) {
    entryWorld(b, ce, _wp, _wq);
    dentPart(ce.part, _wq, _wp, imp.point, imp.normal, dmg, dmg > 12 ? 3 : 0);
    if (s > 7) spawnChips(imp.point, b.vel, ce.part.faces[0].m, Math.round(2 + s * 0.2), def.chip + 0.01, 1.5 + s * 0.15);
  }
  if (Math.random() < Math.min(0.85, dmg / 25)) detachPart(b, imp);
  if (dmg > 8 && Math.random() < 0.5) detachPart(b, imp);
  if (s > 7) popText(pick(HIT_WORDS), imp.point, 'hit');
  if (def.electric && dmg > 10 && Math.random() < 0.6) { sparkBurst(b.pos, 20, true); Snd.zap(pan, 0.6); }
  b.dirty = true;
}

function detachPart(b, imp) {
  const ce = coreEntry(b);
  const cr = ce ? ce.part.max.clone().sub(ce.part.min).len() : 1;
  const cands = b.entries.filter(en => !en.part.core && en.part.max.clone().sub(en.part.min).len() < cr * 0.6);
  if (!cands.length) return;
  const en = pick(cands);
  b.entries.splice(b.entries.indexOf(en), 1);
  entryWorld(b, en, _wp, _wq);
  const db = entryToDebris(en.part, _wp, _wq);
  db.vel.copy(b.vel).add(_va.randDir().mul(rand(1, 3))).addS(imp.normal, rand(1, 3));
  db.ang.randDir().mul(rand(5, 15));
}

function shatter(b, imp) {
  const it = b.item, def = it.def, s = imp.speed;
  const pan = clamp(imp.point.x / 4, -1, 1);
  const k = bodies.indexOf(b); if (k >= 0) bodies.splice(k, 1);
  if (b.blob) b.blob.remove();
  const center = b.pos.clone();
  const baseV = b.vel.clone().mul(0.5);
  const blast = 1 + s * 0.16;
  let coreMat = null;
  const glassSpots = [];
  for (const en of b.entries) {
    const wp = new V(), wq = new Q();
    entryWorld(b, en, wp, wq);
    if (en.part.core) {
      coreMat = en.part.faces[0] && en.part.faces[0].m;
      dentPart(en.part, wq, wp, imp.point, imp.normal, 40, 14);
      for (let i = 0; i < 3; i++) {
        const pt = center.clone().add(_vc.randDir().mul(b.size * 0.5));
        dentPart(en.part, wq, wp, pt, center.clone().sub(pt).norm(), 25, 8);
      }
    }
    if (en.part.snd === 'glass' && en.part.max.clone().sub(en.part.min).len() > 0.08) glassSpots.push([wp.clone(), en.part.faces[0].m]);
    const dir = wp.clone().sub(imp.point);
    if (dir.lenSq() < 1e-6) dir.randDir();
    dir.norm().add(_vc.randDir().mul(0.7)).addS(imp.normal, 0.6).norm();
    const db = entryToDebris(en.part, wp, wq);
    db.vel.copy(baseV).addS(dir, blast * rand(0.5, 1.3) * (en.part.core ? 0.35 : 1));
    db.ang.randDir().mul(rand(4, 10) + s * 0.6);
    if (def.electric && en.part.core) db.sparkT = rand(1.5, 3.5);
  }
  if (coreMat) spawnChips(imp.point, baseV, coreMat, Math.round((def.snd === 'ceramic' ? 16 : 6) + s * 0.4), 0.02 + def.chip, 2 + s * 0.25);
  for (const g of glassSpots) spawnChips(g[0], baseV, g[1].tex ? MAT.glassDark : g[1], Math.round(4 + s * 0.3), 0.035, 2 + s * 0.2);

  dustBurst(imp.point, imp.plane, Math.round(12 + s * 1.5));
  if (def.snd === 'metal' || def.electric) sparkBurst(imp.point, Math.round(15 + s * 2), false);
  if (def.electric) {
    sparkBurst(center, 60, true);
    sparks.emit(center.x, center.y + 0.1, center.z, 0, 0, 0, 0.18, 0.55, 0.8, 1, 0.9, 1.6, 4);
    sparks.emit(center.x, center.y + 0.1, center.z, 0, 0, 0, 0.12, 1, 1, 1, 0.9, 0.6, 2);
    Snd.zap(pan, 1);
  }
  switch (def.special) {
    case 'water': grainBurst(center, 160, [0.55, 0.75, 1], 0.7, 0.022, 3.5); break;
    case 'rice': grainBurst(center, 280, [0.97, 0.96, 0.92], 1, 0.013, 3); dustBurst(center, null, 20, [0.95, 0.95, 0.95]); break;
    case 'coffee': grainBurst(center, 90, [0.28, 0.15, 0.08], 0.95, 0.02, 3); break;
    case 'ink':
      grainBurst(center, 150, [[0, 0.66, 0.85], [0.82, 0, 0.48], [0.95, 0.82, 0], [0.1, 0.1, 0.1]], 1, 0.02, 3.5);
      spawnPapers(center, 12);
      break;
    case 'crt':
      spawnChips(center, baseV, MAT.glassClear, 22, 0.05, 5);
      dustBurst(center, null, 30, [0.8, 0.8, 0.85]);
      break;
  }
  Snd.crash(def.snd === 'ceramic' ? 'ceramic' : (def.special === 'crt' ? 'glass' : def.snd), s, pan, def.special === 'crt');

  shake += 0.25 + Math.min(0.6, s * 0.015 * Math.sqrt(def.mass / 3));
  if (s > 15) { slowT = 0.45; screenFlash(0.35); }

  const glassy = def.snd === 'ceramic' || def.special === 'crt' || def.id === 'laptop';
  popText(pick(glassy ? GLASS_WORDS : BREAK_WORDS), new V(imp.point.x, imp.point.y + 0.3, imp.point.z), 'break' + (glassy ? ' glass' : ''));

  brokenCount++;
  const now = performance.now();
  combo = (now - lastBreak < 2500) ? combo + 1 : 1;
  lastBreak = now;
  if (combo >= 2) {
    const c = $('combo'); c.textContent = `${combo} COMBO!!`;
    c.classList.remove('show'); void c.offsetWidth; c.classList.add('show');
    relieve(combo);
  }
  relieve(3);
  updateHUD();
  enforceLimit();
}

function debrisImpact(b, imp) {
  b.dirty = true;
  if (imp.speed < 2.5) return;
  const now = performance.now();
  if (now - lastDebrisSnd < 30) return;
  lastDebrisSnd = now;
  const s = imp.speed * Math.min(1, b.size * 4 + 0.15);
  Snd.hit(b.snd, s, clamp(imp.point.x / 4, -1, 1), 0, b.size);
  if (b.snd === 'glass' && !b.chip && imp.speed > 7 && b.size > 0.08) {
    const m = b.entries[0].part.faces[0].m;
    spawnChips(imp.point, b.vel, m.tex ? MAT.glassDark : m, 3, 0.03, 2);
  }
  if (!b.chip && imp.speed > 6 && b.size > 0.1) dustBurst(imp.point, imp.plane, 4);
}

/* =========================================================
   Held item & throwing
   ========================================================= */
const HOLD = new V(0.32, -0.24, -0.9);
const aimPoint = new V(0, 1.5, -5);
const pointer = { x: 0, y: 0 };
const heldQ = new Q();

function attachParts(it, parent) { for (const en of it.entries) parent.appendChild(en.part.el); }
function spawnHeld() {
  if (held) { for (const en of held.entries) en.part.el.remove(); held = null; }
  const def = randomMode ? pick(ITEMS) : ITEMS[selected];
  const it = buildItem(def);
  const sz = it.max.clone().sub(it.min);
  it.disp = Math.min(1.3, 0.22 / Math.max(sz.x, sz.y, sz.z));
  it.pop = 0;
  attachParts(it, handEl);
  held = it;
}
function renderHeld(dt, now) {
  if (!held) return;
  held.pop = Math.min(1, held.pop + dt * 5);
  const t = now / 1000, pb = charging ? power : 0;
  const s = held.disp * Math.max(0.001, easeOutBack(held.pop));
  held.hp_ = held.hp_ || new V();
  const hp = held.hp_.set(
    HOLD.x + Math.sin(t * 1.5) * 0.005 + (Math.random() - 0.5) * pb * pb * 0.012,
    HOLD.y + Math.sin(t * 2.1) * 0.008 - pb * 0.04 + (Math.random() - 0.5) * pb * pb * 0.012,
    HOLD.z + pb * 0.16);
  heldQ.euler(0.25 + pb * 0.3, -0.5 + Math.sin(t * 0.8) * 0.12, pb * 0.2);
  for (const en of held.entries) {
    if (en.spin) en.lq.mulQ(en.lq0, _qa.euler(0, 0, t * 25));
    _wq.mulQ(heldQ, en.lq);
    _wp.copy(en.lp).mul(s).applyQ(heldQ).add(hp);
    _sq.mulQ(camQ0, _wq);
    placePart(en.part, _wp, _wq, s, QI, _sq);
  }
}
function launch(origin, target, p) {
  const speed = 8 + p * 20;
  const d = target.clone().sub(origin);
  const t = Math.max(0.12, d.len() / speed);
  return { v: d.mul(1 / t).add(new V(0, 0.5 * G * t, 0)), t };
}
function heldWorldPos(out) {
  const hp = held.hp_ || HOLD;
  return out.copy(hp).applyQ(camQ0).add(CAM);
}
function doThrow() {
  const p = power;
  charging = false; power = 0;
  if (!held || held.pop < 0.6) return;
  const origin = heldWorldPos(new V());
  const it = held; held = null;
  const q = new Q().mulQ(camQ0, heldQ);
  attachParts(it, worldEl);
  const L = launch(origin, aimPoint, p);
  const b = new Body(it.entries, it.min, it.max, { mass: it.def.mass, snd: it.def.snd });
  b.main = true; b.item = it;
  b.pos.copy(origin); b.q.copy(q);
  b.vel.copy(L.v);
  const right = new V(1, 0, 0).applyQ(camQ0);
  b.ang.copy(right).mul(-rand(2, 7) * (0.4 + p)).add(_va.randDir().mul(rand(0.5, 3)));
  bodies.push(b); addBlob(b);
  enforceLimit();
  Snd.whoosh(p);
  shake += 0.04 + p * 0.06;
  setTimeout(() => { if (!held) spawnHeld(); }, 230);
}
function updateAim() {
  const dir = new V((pointer.x - W / 2) / F, -(pointer.y - H / 2) / F, -1).norm().applyQ(camQ0);
  let best = 30;
  for (const P of PLANES) {
    const dn = P.n.dot(dir);
    if (dn >= -1e-6) continue;
    const t = (P.d - P.n.dot(CAM)) / dn;
    if (t > 0 && t < best) best = t;
  }
  aimPoint.copy(CAM).addS(dir, Math.min(best, 12));
}

/* =========================================================
   Thumbnails (tiny CSS 3D scenes)
   ========================================================= */
function makeThumb(def, size) {
  const box = document.createElement('div'); box.className = 'thumb';
  box.style.perspective = ((size / 2) / Math.tan(15 * Math.PI / 180)) + 'px';
  const tw = document.createElement('div'); tw.className = 'tw'; box.appendChild(tw);
  const it = buildItem(def);
  const r = it.max.clone().sub(it.min).len() / 2;
  const cp = new V(0.9, 0.6, 1.4).norm().mul(r / Math.sin(15 * Math.PI / 180) * 1.02);
  const fw = cp.clone().mul(-1).norm();
  const cq = new Q().mulQ(new Q().euler(0, Math.atan2(-fw.x, -fw.z), 0), new Q().euler(Math.asin(fw.y), 0, 0));
  const ci = cq.clone().conj();
  const vm = new M4().compose(cp.clone().applyQ(ci).mul(-1), ci, 1);
  const f = (size / 2) / Math.tan(15 * Math.PI / 180);
  tw.style.transform = `translateZ(${f}px) scale3d(${S},${-S},${S}) ` + vm.css();
  for (const en of it.entries) {
    tw.appendChild(en.part.el);
    placePart(en.part, en.lp, en.lq, 1, cq, en.lq);
  }
  return box;
}

/* =========================================================
   UI
   ========================================================= */
function buildItemBar() {
  const bar = $('items');
  const tsize = window.innerHeight <= 500 ? 50 : window.innerWidth <= 640 ? 56 : 72;
  ITEMS.forEach((d, i) => {
    const b = document.createElement('button');
    b.className = 'item'; b.dataset.idx = i;
    b.appendChild(makeThumb(d, tsize));
    b.insertAdjacentHTML('beforeend', `<span class="nm">${d.name}</span><span class="pr">${yenFmt(d.price)}</span><kbd>${i + 1}</kbd>`);
    b.addEventListener('click', () => select(i));
    bar.appendChild(b);
  });
  const r = document.createElement('button');
  r.className = 'item'; r.dataset.idx = -1;
  r.innerHTML = `<div class="dice">🎲</div><span class="nm">ランダム</span><span class="pr">おまかせ</span><kbd>0</kbd>`;
  r.addEventListener('click', () => select(-1));
  bar.appendChild(r);
  refreshBar();
}
function refreshBar() {
  document.querySelectorAll('#items .item').forEach(el => {
    const i = +el.dataset.idx;
    el.classList.toggle('active', randomMode ? i === -1 : i === selected);
  });
}
function select(i) {
  randomMode = i < 0;
  if (!randomMode) selected = i;
  refreshBar();
  charging = false;
  spawnHeld();
}
function clearAll() {
  while (bodies.length) removeBodyAt(0);
  SURFACES.forEach(s => s.reset());
  PSYS.forEach(p => p.clear());
  fxLayer.innerHTML = '';
}

const reticle = $('reticle');
function setPointer(e) {
  pointer.x = e.clientX; pointer.y = e.clientY;
  reticle.style.left = e.clientX + 'px';
  reticle.style.top = e.clientY + 'px';
}
viewport.addEventListener('pointerdown', (e) => {
  if (!started || !$('relief').classList.contains('hidden')) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  document.body.classList.toggle('touch', e.pointerType !== 'mouse');
  e.preventDefault();
  setPointer(e);
  Snd.init();
  charging = true; chargeT = 0; power = 0;
  try { viewport.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
});
window.addEventListener('pointermove', setPointer);
window.addEventListener('pointerup', (e) => {
  if (!charging) return;
  setPointer(e); updateAim(); doThrow();
});
window.addEventListener('pointercancel', () => { charging = false; });
// スマホ: 長押しでのコンテキストメニュー / ピンチズーム / ダブルタップズームを抑止
viewport.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
let spaceDown = false;
window.addEventListener('keydown', (e) => {
  if (!started) return;
  if (e.key >= '1' && e.key <= '9') { const i = +e.key - 1; if (i < ITEMS.length) select(i); }
  else if (e.key === '0') select(-1);
  else if (e.key === 'c' || e.key === 'C') clearAll();
  else if (e.key === 'm' || e.key === 'M') toggleSound();
  else if (e.code === 'Space' && !spaceDown && $('relief').classList.contains('hidden')) {
    spaceDown = true; charging = true; chargeT = 0; power = 0; e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && spaceDown) { spaceDown = false; if (charging) { updateAim(); doThrow(); } }
});
function toggleSound() { Snd.on = !Snd.on; $('btnSound').textContent = Snd.on ? '🔊' : '🔇'; }
$('btnSound').addEventListener('click', toggleSound);
$('btnClear').addEventListener('click', clearAll);
$('btnMore').addEventListener('click', () => {
  $('relief').classList.add('hidden');
  stress = 100; reliefShown = false; updateHUD();
});
$('btnStart').addEventListener('click', () => {
  Snd.init();
  started = true;
  $('start').classList.add('hidden');
});
window.addEventListener('resize', resize);

/* =========================================================
   Main loop
   ========================================================= */
function drawTrajectory(ctx) {
  if (!charging || !held) return;
  const o = heldWorldPos(new V());
  const L = launch(o, aimPoint, power);
  const pt = new V(), pr = { x: 0, y: 0, k: 0 };
  const hue = 50 - power * 50;
  ctx.fillStyle = `hsla(${hue},100%,60%,0.85)`;
  for (let i = 1; i < 32; i++) {
    const t = L.t * i / 31;
    pt.set(o.x + L.v.x * t, o.y + L.v.y * t - 0.5 * G * t * t, o.z + L.v.z * t);
    if (!project(pt, pr)) continue;
    const rr = Math.max(1.5, 0.022 * pr.k);
    ctx.beginPath(); ctx.arc(pr.x, pr.y, rr, 0, 6.2832); ctx.fill();
  }
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;

  if (slowT > 0) { slowT -= dt; timeScale = 0.25; document.body.classList.add('slowmo'); }
  else { timeScale = Math.min(1, timeScale + dt * 3); document.body.classList.remove('slowmo'); }
  const sdt = dt * timeScale;

  const SUB = 3, h = sdt / SUB;
  for (let s = 0; s < SUB; s++) for (let i = 0; i < bodies.length; i++) bodies[i].step(h);

  const list = bodies.slice();
  for (const b of list) {
    const imp = b.impact; b.impact = null;
    if (imp && imp.speed > 2) { if (b.main) mainImpact(b, imp); else debrisImpact(b, imp); }
  }
  for (let i = bodies.length - 1; i >= 0; i--) {
    const b = bodies[i];
    if (b.sleep) {
      b.sleepAge += sdt;
      if (b.chip && b.sleepAge > 5) { removeBodyAt(i); continue; }
    } else {
      b.age += sdt;
      if (b.contact) {
        if (b.vel.lenSq() < 0.25) { b.vel.mul(0.92); b.ang.mul(0.88); }
        if (b.vel.lenSq() < 0.02 && b.ang.lenSq() < 0.2) {
          b.sleepT += sdt;
          if (b.sleepT > 0.4) { b.sleep = true; b.vel.set(0, 0, 0); b.ang.set(0, 0, 0); b.main = false; b.dirty = true; }
        } else b.sleepT = 0;
      } else b.sleepT = 0;
      b.contact = false;
    }
    for (const en of b.entries) if (en.spin && !b.sleep) en.lq.mulQ(en.lq0, _qa.euler(0, 0, now / 1000 * 25));
    if (!b.sleep || b.dirty) { renderBody(b); b.dirty = false; }
    if (b.sparkT > 0) {
      b.sparkT -= sdt;
      const p = b.pos;
      if (Math.random() < sdt * 9) sparkBurst(p, 8, true);
      if (Math.random() < sdt * 14) dusts.emit(p.x + rand(-0.05, 0.05), p.y + 0.05, p.z + rand(-0.05, 0.05), rand(-0.1, 0.1), rand(0.4, 0.8), rand(-0.1, 0.1), rand(1.2, 2), 0.12, 0.12, 0.13, 0.45, rand(0.08, 0.15), 0.35);
      if (Math.random() < sdt * 2) Snd.zap(clamp(p.x / 4, -1, 1), 0.35);
    }
  }

  if (charging) { chargeT += dt; power = Math.min(1, chargeT / 0.9); }
  reticle.style.setProperty('--p', charging ? power.toFixed(3) : '0');
  reticle.classList.toggle('full', charging && power >= 1);

  shake = Math.min(shake, 1.2);
  updateCamera(shake);
  shake *= Math.exp(-dt * 7);

  renderHeld(dt, now);
  updateAim();

  PSYS.forEach(p => p.update(sdt));
  fx2.clearRect(0, 0, W, H);
  dusts.draw(fx2); grains.draw(fx2); sparks.draw(fx2);
  drawTrajectory(fx2);
}

/* ---------- boot ---------- */
buildItemBar();
spawnHeld();
updateHUD();
updateCamera(0);
const sb = $('btnStart'); sb.disabled = false; sb.textContent = 'ぶっ壊す！';
requestAnimationFrame(frame);
}

/* wait for the display font (used in wall graffiti), then start */
const fontWait = (document.fonts && document.fonts.load)
  ? Promise.race([document.fonts.load('40px "Dela Gothic One"'), new Promise(r => setTimeout(r, 2000))])
  : Promise.resolve();
fontWait.catch(() => {}).then(() => {
  try { main(); }
  catch (err) {
    console.error(err);
    const b = document.getElementById('btnStart');
    b.textContent = '起動に失敗しました: ' + err.message;
  }
});

})();
