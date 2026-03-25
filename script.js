/* ── Canvas Setup ───────────────────────────────────────── */
const canvas    = document.getElementById('gameCanvas');
const ctx       = canvas.getContext('2d');
const pCanvas   = document.getElementById('particleCanvas');
const pCtx      = pCanvas.getContext('2d');

const BASE_W = 400;
const BASE_H = 600;
let scale = 1;

function resizeCanvas() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const ratio = BASE_W / BASE_H;
  let w, h;
  if (vw / vh < ratio) {
    w = vw;
    h = vw / ratio;
  } else {
    h = vh;
    w = vh * ratio;
  }
  scale = w / BASE_W;
  canvas.width  = BASE_W;
  canvas.height = BASE_H;
  canvas.style.width  = w + 'px';
  canvas.style.height = h + 'px';
  pCanvas.width  = BASE_W;
  pCanvas.height = BASE_H;
  pCanvas.style.width  = w + 'px';
  pCanvas.style.height = h + 'px';

  const rect = canvas.getBoundingClientRect();
  document.querySelectorAll('.screen').forEach(s => {
    s.style.left = (rect.left + rect.width  / 2) + 'px';
    s.style.top  = (rect.top  + rect.height / 2) + 'px';
  });
  const po = document.getElementById('pauseOverlay');
  po.style.left   = rect.left + 'px';
  po.style.top    = rect.top  + 'px';
  po.style.width  = rect.width  + 'px';
  po.style.height = rect.height + 'px';
  const pb = document.getElementById('pauseBtn');
  pb.style.right = (window.innerWidth - rect.right + 12) + 'px';
  pb.style.top   = (rect.top + 12) + 'px';
  const fl = document.getElementById('flashOverlay');
  fl.style.left   = rect.left + 'px';
  fl.style.top    = rect.top  + 'px';
  fl.style.width  = rect.width  + 'px';
  fl.style.height = rect.height + 'px';
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

/* ── Audio (Web Audio API) ──────────────────────────────── */
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new AudioCtx();
  return audioCtx;
}

function playFlap() {
  try {
    const ac = getAudioCtx();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(880, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(440, ac.currentTime + 0.08);
    g.gain.setValueAtTime(0.18, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.1);
    o.start(); o.stop(ac.currentTime + 0.1);
  } catch(e) {}
}

function playScore() {
  try {
    const ac = getAudioCtx();
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.connect(g); g.connect(ac.destination);
      o.type = 'triangle';
      o.frequency.value = freq;
      const t = ac.currentTime + i * 0.07;
      g.gain.setValueAtTime(0.15, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      o.start(t); o.stop(t + 0.12);
    });
  } catch(e) {}
}

function playHit() {
  try {
    const ac = getAudioCtx();
    const bufSize = ac.sampleRate * 0.25;
    const buf = ac.createBuffer(1, bufSize, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i/bufSize);
    const src = ac.createBufferSource();
    const g   = ac.createGain();
    const bpf = ac.createBiquadFilter();
    bpf.type = 'bandpass'; bpf.frequency.value = 300; bpf.Q.value = 0.5;
    src.buffer = buf;
    src.connect(bpf); bpf.connect(g); g.connect(ac.destination);
    g.gain.setValueAtTime(0.4, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.25);
    src.start(); src.stop(ac.currentTime + 0.25);
  } catch(e) {}
}

/* ── Game State ─────────────────────────────────────────── */
const STATE = { IDLE: 0, PLAYING: 1, DEAD: 2, PAUSED: 3 };
let state = STATE.IDLE;
let score = 0;
let highScore = parseInt(localStorage.getItem('flappy_hs') || '0');
let frameCount = 0;
let lastTime = 0;

/* ── Physics Constants ──────────────────────────────────── */
const GRAVITY     = 0.38;
const JUMP_FORCE  = -7.2;
const BASE_SPEED  = 2.4;
let   pipeSpeed   = BASE_SPEED;

/* ── Difficulty Scaling ─────────────────────────────────── */
function getDifficulty() {
  if (score < 5)  return { label: 'Easy',   cls: 'diff-easy',   gap: 155, color: '#39ff14' };
  if (score < 12) return { label: 'Medium', cls: 'diff-medium', gap: 138, color: '#f9e94e' };
  if (score < 20) return { label: 'Hard',   cls: 'diff-hard',   gap: 122, color: '#ff2d78' };
  return            { label: 'Insane', cls: 'diff-hard',   gap: 108, color: '#ff2d78' };
}
function getMedal() {
  if (score >= 30) return { emoji: '🥇', text: 'Gold' };
  if (score >= 20) return { emoji: '🥈', text: 'Silver' };
  if (score >= 10) return { emoji: '🥉', text: 'Bronze' };
  return null;
}

/* ── Bird ───────────────────────────────────────────────── */
const bird = {
  x: 80, y: BASE_H / 2,
  vy: 0,
  w: 36, h: 28,
  rotation: 0,
  wingFrame: 0,
  wingDir: 1,
  dead: false,
  trail: [],

  reset() {
    this.x = 80; this.y = BASE_H / 2;
    this.vy = 0; this.rotation = 0;
    this.dead = false; this.trail = [];
    this.wingFrame = 0;
  },

  jump() {
    if (this.dead) return;
    this.vy = JUMP_FORCE;
    playFlap();
    spawnFlap();
  },

  update(dt) {
    if (this.dead) {
      this.vy += GRAVITY * 1.6 * dt;
      this.y  += this.vy * dt;
      this.rotation = Math.min(Math.PI / 2, this.rotation + 0.12 * dt);
      return;
    }
    this.vy += GRAVITY * dt;
    this.y  += this.vy * dt;

    const targetRot = Math.max(-0.45, Math.min(Math.PI / 2.2, this.vy * 0.06));
    this.rotation += (targetRot - this.rotation) * 0.25 * dt;
    this.wingFrame += 0.3 * dt;

    this.trail.unshift({ x: this.x, y: this.y, t: 1 });
    if (this.trail.length > 8) this.trail.pop();
    this.trail.forEach(p => p.t -= 0.12);

    if (this.y + this.h / 2 >= GROUND_Y) {
      this.y = GROUND_Y - this.h / 2;
      this.vy = 0;
      this.dead = true;
    }
    if (this.y - this.h / 2 <= 0) {
      this.y = this.h / 2;
      this.vy = 0;
    }
  },

  draw() {
    ctx.save();
    this.trail.forEach((p, i) => {
      const a = p.t * 0.35 * (1 - i / this.trail.length);
      if (a <= 0) return;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#f9e94e';
      const r = (this.w * 0.35) * (1 - i / this.trail.length);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(3, this.h * 0.55, this.w * 0.42, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    const bodyGrad = ctx.createRadialGradient(-4, -5, 2, 0, 0, this.w * 0.55);
    bodyGrad.addColorStop(0, '#ffe566');
    bodyGrad.addColorStop(0.5, '#f9c520');
    bodyGrad.addColorStop(1, '#d4900a');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, this.w * 0.5, this.h * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();

    const wingY = Math.sin(this.wingFrame) * 6;
    ctx.fillStyle = '#f0b420';
    ctx.beginPath();
    ctx.ellipse(-4, wingY - 2, this.w * 0.32, this.h * 0.22, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c8880a';
    ctx.beginPath();
    ctx.ellipse(-4, wingY - 2, this.w * 0.2, this.h * 0.14, -0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(10, -5, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1a0a00';
    ctx.beginPath();
    ctx.arc(12, -4, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(14, -6, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ff8c00';
    ctx.beginPath();
    ctx.moveTo(15, -1); ctx.lineTo(23, 1); ctx.lineTo(15, 5);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#c85a00'; ctx.lineWidth = 0.8; ctx.stroke();

    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#ff6b6b';
    ctx.beginPath();
    ctx.ellipse(8, 4, 6, 3.5, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.restore();
  },

  getBounds() {
    return {
      x: this.x - this.w * 0.38,
      y: this.y - this.h * 0.38,
      w: this.w * 0.76,
      h: this.h * 0.76
    };
  }
};

/* ── Ground ─────────────────────────────────────────────── */
const GROUND_Y = BASE_H - 80;
const GROUND_H = BASE_H - GROUND_Y;
let groundX = 0;

function drawGround() {
  groundX -= pipeSpeed * 1.1;
  if (groundX <= -BASE_W) groundX = 0;

  ctx.fillStyle = '#4caf50';
  ctx.fillRect(0, GROUND_Y - 8, BASE_W, 8);

  const g = ctx.createLinearGradient(0, GROUND_Y, 0, BASE_H);
  g.addColorStop(0, '#c8a96e');
  g.addColorStop(0.3, '#a07850');
  g.addColorStop(1, '#7a5c38');
  ctx.fillStyle = g;
  ctx.fillRect(0, GROUND_Y, BASE_W, GROUND_H);

  ctx.globalAlpha = 0.15;
  ctx.fillStyle = '#000';
  for (let i = 0; i < 12; i++) {
    const x = ((groundX + i * 40) % (BASE_W + 40)) - 40;
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y + 12);
    ctx.lineTo(x + 20, GROUND_Y + 12);
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#66bb6a';
  for (let i = 0; i < 20; i++) {
    const gx = ((groundX * 0.9 + i * 22) % (BASE_W + 22)) - 22;
    ctx.beginPath();
    ctx.arc(gx + 8, GROUND_Y - 4, 6, Math.PI, Math.PI * 2);
    ctx.fill();
  }
}

/* ── Background ─────────────────────────────────────────── */
const stars = Array.from({ length: 60 }, () => ({
  x: Math.random() * BASE_W,
  y: Math.random() * GROUND_Y * 0.8,
  r: Math.random() * 1.5 + 0.3,
  a: Math.random(),
  blink: Math.random() * Math.PI * 2
}));
let bgTime = 0;

const clouds = Array.from({ length: 5 }, (_, i) => ({
  x: i * (BASE_W / 4),
  y: 40 + Math.random() * 100,
  w: 60 + Math.random() * 60,
  speed: 0.25 + Math.random() * 0.2,
  alpha: 0.12 + Math.random() * 0.12
}));

function drawBackground(dt) {
  bgTime += dt * 0.015;
  const t = (Math.sin(bgTime * 0.1) + 1) / 2;
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, `hsl(${230 + t * 20}, 55%, ${8 + t * 4}%)`);
  sky.addColorStop(0.5, `hsl(${250 + t * 15}, 45%, ${12 + t * 5}%)`);
  sky.addColorStop(1, `hsl(${210 + t * 20}, 35%, ${18 + t * 4}%)`);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, BASE_W, GROUND_Y);

  stars.forEach(s => {
    s.blink += dt * 0.04;
    const a = s.a * (0.5 + 0.5 * Math.sin(s.blink));
    ctx.globalAlpha = a;
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  clouds.forEach(c => {
    if (state === STATE.PLAYING) {
      c.x -= c.speed * dt;
      if (c.x + c.w < 0) c.x = BASE_W + c.w;
    }
    ctx.globalAlpha = c.alpha;
    ctx.fillStyle = 'white';
    const cx = c.x, cy = c.y, cw = c.w;
    ctx.beginPath();
    ctx.arc(cx, cy, cw * 0.25, 0, Math.PI * 2);
    ctx.arc(cx + cw*0.2, cy - 8, cw * 0.32, 0, Math.PI * 2);
    ctx.arc(cx + cw*0.5, cy - 5, cw * 0.28, 0, Math.PI * 2);
    ctx.arc(cx + cw*0.7, cy, cw * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  });

  ctx.globalAlpha = 0.07;
  ctx.fillStyle = '#7090ff';
  [
    [20, GROUND_Y-40, 30, 40], [55, GROUND_Y-70, 25, 70], [90, GROUND_Y-50, 35, 50],
    [135, GROUND_Y-90, 20, 90],[165, GROUND_Y-55, 40, 55],[215, GROUND_Y-75, 28, 75],
    [250, GROUND_Y-45, 35, 45],[295, GROUND_Y-80, 22, 80],[325, GROUND_Y-60, 38, 60],
    [370, GROUND_Y-50, 30, 50]
  ].forEach(([x,y,w,h]) => ctx.fillRect(x, y, w, h));
  ctx.globalAlpha = 1;
}

/* ── Pipes ──────────────────────────────────────────────── */
const PIPE_W   = 54;
const PIPE_CAP = 18;
let pipes = [];
let pipeTimer = 0;
const PIPE_INTERVAL = 88;

function spawnPipe() {
  const diff = getDifficulty();
  const gapH = diff.gap;
  const minY = 60;
  const maxY = GROUND_Y - gapH - 60;
  const gapY = minY + Math.random() * (maxY - minY);
  pipes.push({ x: BASE_W + 10, gapY, gapH, scored: false });
}

function drawPipe(x, top, bot) {
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#000';
  ctx.fillRect(x + 6, top, PIPE_W, bot - top);
  ctx.globalAlpha = 1;

  const drawSeg = (py, ph) => {
    if (ph <= 0) return;
    const grd = ctx.createLinearGradient(x, 0, x + PIPE_W, 0);
    grd.addColorStop(0, '#2dce89');
    grd.addColorStop(0.25, '#4ee8a0');
    grd.addColorStop(0.6,  '#1aab6d');
    grd.addColorStop(1,    '#0d7a48');
    ctx.fillStyle = grd;
    ctx.fillRect(x, py, PIPE_W, ph);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + 5, py, 7, ph);
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#000';
    ctx.fillRect(x + PIPE_W - 6, py, 6, ph);
    ctx.globalAlpha = 1;
  };

  const drawCap = (py, isTop) => {
    const capX = x - 4;
    const capW = PIPE_W + 8;
    const grd = ctx.createLinearGradient(capX, 0, capX + capW, 0);
    grd.addColorStop(0,   '#39de98');
    grd.addColorStop(0.3, '#5cf0b0');
    grd.addColorStop(0.7, '#22bc7a');
    grd.addColorStop(1,   '#0e7a4a');
    ctx.fillStyle = grd;

    if (isTop) {
      ctx.fillRect(capX, py - PIPE_CAP, capW, PIPE_CAP);
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#fff';
      ctx.fillRect(capX + 5, py - PIPE_CAP + 3, 10, PIPE_CAP - 6);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#000';
      ctx.fillRect(capX, py - 3, capW, 3);
    } else {
      ctx.fillRect(capX, py, capW, PIPE_CAP);
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#fff';
      ctx.fillRect(capX + 5, py + 3, 10, PIPE_CAP - 6);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#000';
      ctx.fillRect(capX, py + PIPE_CAP - 3, capW, 3);
    }
    ctx.globalAlpha = 1;
  };

  drawSeg(top, bot - PIPE_CAP);
  drawCap(bot, true);
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#000';
  for (let ry = top + 10; ry < bot - PIPE_CAP - 5; ry += 20) {
    ctx.fillRect(x, ry, PIPE_W, 4);
  }
  ctx.globalAlpha = 1;
}

function updatePipes(dt) {
  pipeTimer += dt;
  if (pipeTimer >= PIPE_INTERVAL) {
    spawnPipe();
    pipeTimer = 0;
  }
  pipeSpeed = BASE_SPEED + Math.min(score * 0.08, 2.0);
  pipes.forEach(p => { p.x -= pipeSpeed * dt; });
  pipes = pipes.filter(p => p.x + PIPE_W > -20);

  pipes.forEach(p => {
    if (!p.scored && p.x + PIPE_W < bird.x) {
      p.scored = true;
      score++;
      if (score > highScore) {
        highScore = score;
        localStorage.setItem('flappy_hs', highScore);
      }
      playScore();
      spawnScoreParticles(bird.x, bird.y);
    }
  });
}

function renderPipes() {
  pipes.forEach(p => {
    const topH = p.gapY;
    const botY = p.gapY + p.gapH;
    const botH = GROUND_Y - botY;
    drawPipe(p.x, 0, topH);
    drawPipe(p.x, botY, botY + botH);
  });
}

/* ── Collision Detection ────────────────────────────────── */
function checkCollision() {
  const b = bird.getBounds();
  for (const p of pipes) {
    const topBot = p.gapY;
    const botTop = p.gapY + p.gapH;
    const px = p.x - 4;
    const pw = PIPE_W + 8;
    if (rectsOverlap(b.x, b.y, b.w, b.h, px, 0, pw, topBot)) return true;
    if (rectsOverlap(b.x, b.y, b.w, b.h, px, botTop, pw, GROUND_Y - botTop)) return true;
  }
  if (bird.y + bird.h * 0.4 >= GROUND_Y) return true;
  return false;
}

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/* ── Particles ──────────────────────────────────────────── */
const particles = [];
const flapParticles = [];

function spawnScoreParticles(x, y) {
  const colors = ['#f9e94e','#39ff14','#00d4ff','#ff2d78'];
  for (let i = 0; i < 16; i++) {
    const angle = (Math.PI * 2 / 16) * i;
    const speed = 2.5 + Math.random() * 3;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: 0.025 + Math.random() * 0.015,
      r: 3 + Math.random() * 3,
      color: colors[Math.floor(Math.random() * colors.length)]
    });
  }
}

function spawnFlap() {
  for (let i = 0; i < 5; i++) {
    flapParticles.push({
      x: bird.x - bird.w * 0.3,
      y: bird.y + bird.h * 0.1,
      vx: -1 - Math.random() * 2,
      vy: 0.5 + Math.random() * 1.5,
      life: 1,
      decay: 0.06 + Math.random() * 0.04,
      r: 1.5 + Math.random() * 2
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy += 0.1 * dt;
    p.life -= p.decay * dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
  for (let i = flapParticles.length - 1; i >= 0; i--) {
    const p = flapParticles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy += 0.08 * dt;
    p.life -= p.decay * dt;
    if (p.life <= 0) flapParticles.splice(i, 1);
  }
}

function drawParticles() {
  pCtx.clearRect(0, 0, BASE_W, BASE_H);
  particles.forEach(p => {
    pCtx.globalAlpha = Math.max(0, p.life);
    pCtx.fillStyle = p.color;
    pCtx.shadowBlur = 8;
    pCtx.shadowColor = p.color;
    pCtx.beginPath();
    pCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    pCtx.fill();
  });
  flapParticles.forEach(p => {
    pCtx.globalAlpha = Math.max(0, p.life) * 0.7;
    pCtx.fillStyle = '#ffffff';
    pCtx.shadowBlur = 4;
    pCtx.shadowColor = 'white';
    pCtx.beginPath();
    pCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    pCtx.fill();
  });
  pCtx.globalAlpha = 1;
  pCtx.shadowBlur = 0;
}

/* ── HUD ────────────────────────────────────────────────── */
function drawHUD() {
  ctx.save();
  ctx.font = 'bold 42px "Fredoka One", cursive';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillText(score, BASE_W / 2 + 2, 64);
  ctx.fillStyle = 'white';
  ctx.shadowBlur = 12;
  ctx.shadowColor = 'rgba(255,255,255,0.5)';
  ctx.fillText(score, BASE_W / 2, 62);
  ctx.shadowBlur = 0;

  ctx.font = '600 11px "Nunito", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.roundRect(BASE_W - 12, 10, 80, 22, 11);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText(`BEST  ${highScore}`, BASE_W - 20, 25);

  const diff = getDifficulty();
  ctx.font = '700 9px "Nunito", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.roundRect(12, 10, 56, 22, 11);
  ctx.fill();
  ctx.fillStyle = diff.color;
  ctx.shadowBlur = 6; ctx.shadowColor = diff.color;
  ctx.fillText(diff.label.toUpperCase(), 20, 25);
  ctx.restore();
}

/* ── Flash Effect ───────────────────────────────────────── */
function triggerFlash() {
  const fl = document.getElementById('flashOverlay');
  fl.style.opacity = '0.75';
  fl.style.transition = 'none';
  setTimeout(() => {
    fl.style.transition = 'opacity 0.4s ease';
    fl.style.opacity = '0';
  }, 30);
}

/* ── Idle animation ─────────────────────────────────────── */
let idleT = 0;
function idleHover(dt) {
  idleT += dt * 0.04;
  bird.y = BASE_H / 2 + Math.sin(idleT) * 12;
  bird.rotation = Math.sin(idleT) * 0.12;
}

/* ── Main Game Loop ─────────────────────────────────────── */
function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 16.67, 3);
  lastTime = timestamp;
  frameCount++;
  ctx.clearRect(0, 0, BASE_W, BASE_H);
  drawBackground(dt);

  if (state === STATE.IDLE) {
    idleHover(dt);
    bird.draw();
    drawGround();
    ctx.save();
    ctx.font = '700 13px "Nunito", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText('← Click or press SPACE to fly →', BASE_W / 2, GROUND_Y - 15);
    ctx.restore();
  }

  if (state === STATE.PLAYING || state === STATE.DEAD) {
    updatePipes(dt);
    bird.update(dt);
    updateParticles(dt);
    if (state === STATE.PLAYING && checkCollision()) {
      state = STATE.DEAD;
      bird.dead = true;
      bird.vy = JUMP_FORCE * 0.6;
      playHit();
      triggerFlash();
      document.getElementById('pauseBtn').classList.remove('visible');
      setTimeout(showGameOver, 900);
    }
    renderPipes();
    drawGround();
    bird.draw();
    drawParticles();
    if (state === STATE.PLAYING) drawHUD();
  }

  if (state === STATE.PAUSED) {
    renderPipes();
    drawGround();
    bird.draw();
    drawHUD();
  }
  requestAnimationFrame(gameLoop);
}

/* ── State Transitions ──────────────────────────────────── */
function startGame() {
  score = 0;
  pipes = [];
  pipeTimer = 0;
  pipeSpeed = BASE_SPEED;
  particles.length = 0;
  flapParticles.length = 0;
  bird.reset();
  bird.vy = JUMP_FORCE;
  state = STATE.PLAYING;
  hide('startScreen');
  hide('gameOverScreen');
  document.getElementById('pauseBtn').classList.add('visible');
}

function showGameOver() {
  state = STATE.DEAD;
  document.getElementById('finalScore').textContent = score;
  document.getElementById('bestScore').textContent  = highScore;
  const diff = getDifficulty();
  const badge = document.getElementById('difficultyReached');
  badge.className = 'diff-badge ' + diff.cls;
  badge.textContent = diff.label;
  const medal = getMedal();
  const medalEl = document.getElementById('medalDisplay');
  medalEl.innerHTML = medal ? `<span class="medal">${medal.emoji}</span><p style="font-size:0.75rem; color:rgba(255,255,255,0.5)">${medal.text} Medal</p>` : '';
  show('gameOverScreen');
}

function togglePause() {
  if (state === STATE.PLAYING) {
    state = STATE.PAUSED;
    document.getElementById('pauseOverlay').classList.add('visible');
    document.getElementById('pauseBtn').textContent = '▶';
  } else if (state === STATE.PAUSED) {
    state = STATE.PLAYING;
    document.getElementById('pauseOverlay').classList.remove('visible');
    document.getElementById('pauseBtn').textContent = '⏸';
  }
}

function backToMenu() {
  hide('gameOverScreen');
  show('startScreen');
  state = STATE.IDLE;
  bird.reset();
  bird.y = BASE_H / 2;
  pipes = [];
  particles.length = 0;
  document.getElementById('pauseBtn').classList.remove('visible');
  document.getElementById('pauseOverlay').classList.remove('visible');
}

function show(id) { document.getElementById(id).classList.add('visible'); }
function hide(id) { document.getElementById(id).classList.remove('visible'); }

/* ── Input Handling ─────────────────────────────────────── */
function handleInput() {
  if (state === STATE.IDLE) startGame();
  else if (state === STATE.PLAYING) bird.jump();
}

document.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); handleInput(); }
  if (e.code === 'KeyP' && (state === STATE.PLAYING || state === STATE.PAUSED)) togglePause();
  if (e.code === 'Escape' && state === STATE.PAUSED) togglePause();
});

canvas.addEventListener('pointerdown', e => { e.preventDefault(); handleInput(); }, { passive: false });
document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('restartBtn').addEventListener('click', () => { hide('gameOverScreen'); startGame(); });
document.getElementById('menuBtn').addEventListener('click', backToMenu);
document.getElementById('pauseBtn').addEventListener('click', togglePause);
window.addEventListener('contextmenu', e => e.preventDefault());

lastTime = performance.now();
requestAnimationFrame(gameLoop);