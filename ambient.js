// ambient.js — atmospheric layers that sell the world without touching gameplay.
// All locals are pure canvas, so nothing in here depends on the DOM, and every
// layer is keyed on level so sewer, street, rooftop and skate each feel different.
export function createAmbient() {
  const s = { t: 0, rain: [], motes: [], trails: [], sparks: [], fog: [] };
  for (let i = 0; i < 42; i++) s.rain.push({ x: Math.random() * 1000, y: Math.random() * 510, v: 300 + Math.random() * 260, tilt: 0.6 + Math.random() * 0.5, a: 0.12 + Math.random() * 0.22 });
  for (let i = 0; i < 28; i++) s.motes.push({ x: Math.random(), y: Math.random(), r: 0.8 + Math.random() * 1.8, p: Math.random() * 6.28, k: 0.12 + Math.random() * 0.20 });
  for (let i = 0; i < 12; i++) s.trails.push({ x: Math.random() * 1000, y: 220 + Math.random() * 180, v: (i % 2 ? 0.6 : -0.6) * (0.4 + Math.random()), r: 2 + Math.random() * 3 });
  for (let i = 0; i < 16; i++) s.sparks.push({ x: Math.random() * 1000, y: Math.random() * 510, vx: -80 - Math.random() * 160, vy: 15 + Math.random() * 60, r: 1 + Math.random() * 2.2, a: 0.4 + Math.random() * 0.6 });

  function step(dt, state) {
    s.t += dt;
    if (s.t > 3600) s.t = 0;
    for (const r of s.rain) { r.y += r.v * r.tilt * dt; r.x += r.v * 0.22 * dt; if (r.y > 560) { r.y = -30; r.x = Math.random() * 1000; } }
    for (const m of s.motes) m.p += (0.4 + m.k) * dt;
    for (const t of s.trails) {
      t.x += t.v * 40 * dt;
      if (t.x < -200 || t.x > 1200) t.v *= -1;
    }
    for (const p of s.sparks) { p.x += p.vx * dt; p.y += p.vy * dt; if (p.y > 540 || p.x < -20) { p.x = 760 + Math.random() * 120; p.y = 180 + Math.random() * 80; p.a = 0.5 + Math.random() * 0.5; } }
  }
  function fogBack(ctx, y, lo, hi, tint, alpha, width, height) {
    const g = ctx.createLinearGradient(0, y, 0, y + height);
    g.addColorStop(0, 'transparent');
    g.addColorStop(lo, tint + alpha + ')');
    g.addColorStop(hi, tint + (alpha + 0.04) + ')');
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, width, height);
  }
  function atmosphere(ctx, level, camX, W, H, dt) {
    step(dt);
    ctx.save();
    if (level === 0) {
      // Toxic water surface and suspended vapor. Back layer keeps the wet
      // foreground readable, while the seam between tiles stays invisible.
      fogBack(ctx, 350, 0.05, 0.58, 'rgba(110,255,150,', 0.035, W, H - 345);
      for (let i = 0; i < 9; i++) {
        const x = (i * 180 + s.t * 14 * (i % 2 ? 1 : -1)) % (W + 120) - 60;
        const y = 372 + Math.sin(s.t * 0.3 + i) * 12;
        ctx.globalAlpha = 0.045 + (i % 3) * 0.012;
        ctx.fillStyle = '#7aff8c';
        ctx.beginPath(); ctx.ellipse(x, y, 54 + i * 10, 10 + i * 2, (i * 0.3) % 1, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 0.26;
      for (let i = 0; i < 7; i++) {
        const x = (120 + i * 170 + s.t * 22) % (W + 240) - 120;
        const y = 400 + Math.sin(s.t * 0.15 + i * 1.7) * 4;
        ctx.fillStyle = `rgba(150,255,190,${0.07 + (i % 2) * 0.04})`;
        ctx.fillRect(x, y, 24 + i * 8, 2);
      }
      // Rising toxic bioluminescent bubbles along the canal edge
      for (let i = 0; i < 8; i++) {
        const phase = (s.t * (0.45 + (i % 3) * 0.15) + i * 1.37) % 1;
        const bx = ((i * 135 + 60 - camX * 0.35) % W + W) % W;
        const by = 392 - phase * 28;
        ctx.globalAlpha = (1 - phase) * 0.28;
        ctx.strokeStyle = '#9dffb0';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(bx, by, 2 + phase * 3.5, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (level === 1) {
      // Street keeps its own rain for the front layer (screen space), but the
      // back layer gets a puddle mist and neon street-level bounce reflections.
      fogBack(ctx, 465, 0.1, 0.7, 'rgba(120,160,255,', 0.018, W, H - 440);
      const glow = 0.12 + 0.06 * Math.sin(s.t * 0.7);
      ctx.globalAlpha = glow;
      ctx.fillStyle = '#ff73d9';
      ctx.fillRect(W * 0.18, 82, 34, 34);
      ctx.fillStyle = '#52d5ff';
      ctx.fillRect(W * 0.56, 54, 22, 22);
      // Neon puddle reflections on wet asphalt
      for (let i = 0; i < 5; i++) {
        const px = ((i * 230 + 90 - camX * 0.6) % (W + 160) + (W + 160)) % (W + 160) - 80;
        const py = 432 + (i % 3) * 20;
        ctx.globalAlpha = 0.055 + 0.02 * Math.sin(s.t * 1.8 + i);
        ctx.fillStyle = i % 2 ? '#52d5ff' : '#ff73d9';
        ctx.beginPath(); ctx.ellipse(px, py, 38 + (i % 2) * 14, 5, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (level === 2) {
      // Rooftop: high-altitude dust, edge fog and a halo on the claw tower.
      for (const m of s.motes) {
        ctx.globalAlpha = 0.03 + (m.p * 0.5 % 0.04);
        ctx.fillStyle = '#dce9ff';
        ctx.beginPath(); ctx.arc(m.x * W, m.y * 220 + 90, m.r, 0, Math.PI * 2); ctx.fill();
      }
      fogBack(ctx, H - 120, 0.2, 0.85, 'rgba(220,140,255,', 0.03, W, 120);
      ctx.globalAlpha = 0.07 + 0.04 * Math.sin(s.t * 0.6);
      ctx.fillStyle = '#b48cff';
      ctx.beginPath(); ctx.arc(W * 0.74, 168, 92, 0, Math.PI * 2); ctx.fill();
    } else if (level === 3) {
      // Skate tunnel: motion streaks and sparks from the board's hard turns.
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = 'rgba(100,245,255,0.45)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 14; i++) {
        const x = (i * 64 + s.t * 900 * (0.7 + (i % 4) * 0.12)) % (W + 260) - 130;
        ctx.beginPath(); ctx.moveTo(x, 130 + (i % 4) * 40); ctx.lineTo(x - 70, 210 + (i % 3) * 34); ctx.stroke();
      }
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#ffe86b';
      for (let i = 0; i < 4; i++) {
        const p = s.sparks[i + (i % 2) * 6];
        ctx.beginPath(); ctx.arc((p.x % (W + 60) + W) % W * 0.3 + 500, p.y % (H - 150) + 140, p.r, 0, Math.PI * 2); ctx.fill();
      }
    } else if (level === 4) {
      // Tower: cybernetic shaft uplight and rising data motes.
      fogBack(ctx, H - 135, 0.15, 0.8, 'rgba(90,220,255,', 0.028, W, 135);
      for (let i = 0; i < 10; i++) {
        const mx = (i * 103 + Math.sin(s.t * 0.7 + i) * 18) % W;
        const my = H - ((s.t * 36 + i * 52) % (H - 100));
        ctx.globalAlpha = 0.08 + (i % 3) * 0.03;
        ctx.fillStyle = i % 2 ? '#6af2ff' : '#ff7ad9';
        ctx.fillRect(mx, my, 2, 6);
      }
    } else if (level === 5) {
      // Subway: rushing tunnel light columns sweeping past the runaway train and warm rail glow.
      fogBack(ctx, H - 110, 0.15, 0.85, 'rgba(255,175,90,', 0.032, W, 110);
      for (let i = 0; i < 5; i++) {
        const lx = ((W + 180) - ((s.t * 520 + i * 240) % (W + 240))) - 60;
        ctx.globalAlpha = 0.045;
        ctx.fillStyle = '#ffd996';
        ctx.fillRect(lx, 70, 38, 250);
      }
    } else if (level === 6) {
      // Harbor: drifting midnight sea fog and golden sodium pier reflections on the water.
      fogBack(ctx, 355, 0.1, 0.75, 'rgba(130,185,235,', 0.035, W, H - 355);
      for (let i = 0; i < 6; i++) {
        const wx = ((i * 190 - camX * 0.4 + Math.sin(s.t * 0.9 + i) * 16) % (W + 140) + (W + 140)) % (W + 140) - 70;
        const wy = 374 + (i % 3) * 14;
        ctx.globalAlpha = 0.06 + 0.025 * Math.sin(s.t * 1.4 + i);
        ctx.fillStyle = i % 2 ? '#ffcc70' : '#7ec8ff';
        ctx.beginPath(); ctx.ellipse(wx, wy, 44 + (i % 3) * 12, 6, 0, 0, Math.PI * 2); ctx.fill();
      }
    } else if (level === 7) {
      // Arcade: neon synthwave carpet bounce pools (magenta / cyan / gold).
      fogBack(ctx, 380, 0.12, 0.82, 'rgba(235,80,255,', 0.03, W, H - 380);
      for (let i = 0; i < 6; i++) {
        const ax = ((i * 185 + 70 - camX * 0.75) % (W + 160) + (W + 160)) % (W + 160) - 80;
        const ay = 418 + (i % 2) * 28;
        ctx.globalAlpha = 0.055 + 0.025 * Math.sin(s.t * 2.4 + i * 1.3);
        ctx.fillStyle = ['#ff55e0', '#48f0ff', '#ffe055'][i % 3];
        ctx.beginPath(); ctx.ellipse(ax, ay, 42, 9, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  function foreground(ctx, level, camX, W, H, dt) {
    step(dt);
    ctx.save();
    if (level === 0) {
      // A slow, subtle water sheen that makes the walkway feel wet.
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = '#8cffb3';
      for (let i = 0; i < 6; i++) {
        const x = ((i * 320) + camX * 1.08) % (W + 140) - 70;
        ctx.fillRect(x, 385 + (i % 2) * 18, 80, 2);
      }
    } else if (level === 1) {
      // Rain in screen-space: it never stops, and splashes softly on the wet street.
      ctx.globalAlpha = 0.32;
      ctx.strokeStyle = 'rgba(170,225,255,0.55)';
      ctx.lineWidth = 1.3;
      for (const r of s.rain) {
        ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + 9, r.y + 24); ctx.stroke();
      }
      // Raindrop splash ripples on the asphalt
      ctx.strokeStyle = 'rgba(185,230,255,0.28)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 10; i++) {
        const p = (s.t * 2.2 + i * 0.37) % 1;
        const rx = ((i * 107 + Math.floor(s.t * 2.2 + i * 0.37) * 53) % W + W) % W;
        const ry = 412 + (i * 19) % 86;
        ctx.globalAlpha = (1 - p) * 0.26;
        ctx.beginPath(); ctx.ellipse(rx, ry, 2 + p * 9, 0.8 + p * 2.6, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = '#ff73d9';
      for (let i = 0; i < 3; i++) {
        const x = (i * 190 + 90 + s.t * 4) % W;
        ctx.fillRect(x, H - 4, 18, 4);
      }
    } else if (level === 2) {
      // Wind streaks and blowing dust: high altitude, not a wall of text.
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = 'rgba(220,225,255,0.55)';
      ctx.lineWidth = 1.1;
      for (let i = 0; i < 16; i++) {
        const x = (i * 63 + s.t * 280 * (1 + (i % 3) * 0.22)) % (W + 80) - 40;
        ctx.beginPath(); ctx.moveTo(x, 110 + i * 12); ctx.lineTo(x - 54, 110 + i * 12 - 8); ctx.stroke();
      }
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#d8e6ff';
      for (const m of s.motes.slice(0, 9)) {
        ctx.beginPath(); ctx.arc(m.x * W, m.y * 250 + 80, m.r * 0.7, 0, Math.PI * 2); ctx.fill();
      }
    } else if (level === 3) {
      for (const p of s.sparks.slice(0, 12)) {
        const x = (p.x % (W + 100) + W) % W;
        const y = (p.y % (H - 160)) + 135;
        ctx.globalAlpha = p.a;
        ctx.fillStyle = '#70f7ff';
        ctx.beginPath(); ctx.arc(x, y, p.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,232,107,0.7)';
        ctx.fillRect(x - 5, y, 10, 1);
      }
    } else if (level === 5) {
      // Subway: wheel-rail spark streaks along the lower track edge.
      for (let i = 0; i < 8; i++) {
        const p = s.sparks[i];
        const sx = ((p.x * 1.3 - s.t * 340) % W + W) % W;
        const sy = H - 18 - (i % 4) * 7;
        ctx.globalAlpha = 0.35 * p.a;
        ctx.strokeStyle = i % 2 ? '#ffd26b' : '#ff944d';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 14, sy - 3); ctx.stroke();
      }
    } else if (level === 6) {
      // Harbor: drifting foreground sea-mist ribbons and floating salt spray motes.
      ctx.fillStyle = '#c8e4ff';
      for (let i = 0; i < 7; i++) {
        const mx = ((i * 170 + s.t * 28 * (i % 2 ? 1 : -0.8)) % (W + 180) + (W + 180)) % (W + 180) - 90;
        const my = 435 + (i % 3) * 26;
        ctx.globalAlpha = 0.045;
        ctx.beginPath(); ctx.ellipse(mx, my, 68, 9, 0, 0, Math.PI * 2); ctx.fill();
      }
    } else if (level === 7) {
      // Arcade: floating neon pixel dust motes in the foreground light cones.
      for (let i = 0; i < 10; i++) {
        const m = s.motes[i];
        const mx = (m.x * W + Math.sin(m.p + i) * 14 + W) % W;
        const my = 150 + ((m.y * 310 + s.t * 12) % 310);
        ctx.globalAlpha = 0.16 + 0.08 * Math.sin(m.p * 2);
        ctx.fillStyle = i % 2 ? '#78f5ff' : '#ff7cf0';
        ctx.fillRect(mx, my, 2.2, 2.2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  return {
    step, update: step, atmosphere, drawBack: atmosphere, foreground, drawFront: foreground,
    draw: (ctx, level, camX, W, H, dt = 0) => { atmosphere(ctx, level, camX, W, H, dt); },
  };
}
