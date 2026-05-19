'use strict';

// ─────────────────────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────────────────────
const W = 640, H = 480;
const cv = document.getElementById('c');
const g = cv.getContext('2d');
const vid = document.getElementById('vid');

const PICKS = ['rock', 'paper', 'scissors'];
const EM = { rock: '✊', paper: '🖐', scissors: '✌️', thumbs_up: '👍', six: '🤙', seven: '☝️' };
const LB = { rock: '石頭', paper: '布', scissors: '剪刀', thumbs_up: '讚', six: '比六(結束)', seven: '比七(繼續)' };
const BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };

// ── 森林風調色盤：苔綠、草綠、橡木褐、晨曦金、秋蟬棕、落葉黃 ──
const PAL = ['#6B8E23', '#8FBC8F', '#CD853F', '#8B5A2B', '#E3A857', '#556B2F', '#40826D', '#D2B48C'];
const SKEL = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];

// ─────────────────────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────────────────────
let st = 'loading', stAt = Date.now();
const enter = s => { st = s; stAt = Date.now(); };

let pG = null, cG = null;
let lm = null, stable = null, handedness = null;
let gBuf = [], holdT = null;
let menuHoldT = null;
const BUF = 10, HOLD = 400, CD = 3;

let score = { w: 0, l: 0, d: 0 };
let parts = [], fwI = null, maskP = 0;
let wBuf = [], lastSw = 0; const WN = 18;

let mx = 0, my = 0;
cv.addEventListener('mousemove', e => { const r = cv.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top; });
cv.addEventListener('click', onClk);

// ─────────────────────────────────────────────────────────────
//  MEDIAPIPE INIT
// ─────────────────────────────────────────────────────────────
(function () {
    const hands = new Hands({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
    hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: .72, minTrackingConfidence: .5 });
    hands.onResults(r => {
        if (r.multiHandLandmarks && r.multiHandLandmarks[0]) {
            lm = r.multiHandLandmarks[0];
            handedness = r.multiHandedness[0].label;
            const gest = classify(lm);
            gBuf.push(gest); if (gBuf.length > BUF) gBuf.shift();
            stable = vote(gBuf);
            wBuf.push({ x: 1 - lm[0].x, t: Date.now() }); if (wBuf.length > WN) wBuf.shift();
        } else {
            lm = null; stable = null; handedness = null; gBuf = []; wBuf = [];
        }
    });
    new Camera(vid, { onFrame: async () => hands.send({ image: vid }), width: W, height: H })
        .start().then(() => { if (st === 'loading') enter('idle'); });
})();

// ─────────────────────────────────────────────────────────────
//  GESTURE CLASSIFICATION
// ─────────────────────────────────────────────────────────────
function classify(l) {
    const tips = [8, 12, 16, 20];
    const pips = [6, 10, 14, 18];
    const ext = tips.map((t, i) => l[t].y < l[pips[i]].y);
    const indexOpen  = ext[0];
    const middleOpen = ext[1];
    const ringOpen   = ext[2];
    const pinkyOpen  = ext[3];
    const n = ext.filter(Boolean).length;

    const thumbUp = l[4].y < l[3].y && l[4].y < l[2].y && l[4].y < l[5].y;
    const thumbSide = Math.abs(l[4].x - l[3].x) > 0.04;

    if ((thumbUp || thumbSide) && !indexOpen && !middleOpen && !ringOpen && pinkyOpen) return 'six';

    const sevenA = thumbUp && indexOpen && !middleOpen && !ringOpen && !pinkyOpen && n === 1;
    const sevenB = thumbSide && indexOpen && !middleOpen && !ringOpen && !pinkyOpen && n === 1;
    if (sevenA || sevenB) return 'seven';

    if (thumbUp && !indexOpen && !middleOpen && !ringOpen && !pinkyOpen) return 'thumbs_up';
    if (n === 0) return 'rock';
    if (n >= 3) return 'paper';
    if (indexOpen && middleOpen && !ringOpen && !pinkyOpen) return 'scissors';
    return 'unknown';
}

function vote(buf) {
    if (buf.length < 6) return null;
    const c = {};
    buf.forEach(v => { c[v] = (c[v] || 0) + 1; });
    let b = null, bn = 0;
    for (const v in c) {
        if (v !== 'unknown' && c[v] > bn) { bn = c[v]; b = v; }
    }
    return bn / buf.length >= .55 ? b : null;
}

// ─────────────────────────────────────────────────────────────
//  SWIPE DETECTION
// ─────────────────────────────────────────────────────────────
function checkSwipe() {
    if (wBuf.length < WN || Date.now() - lastSw < 1000) return null;
    const span = wBuf.at(-1).t - wBuf[0].t;
    if (span > 800) return null;
    const dx = wBuf.at(-1).x - wBuf[0].x;
    if (dx > 0.22) { lastSw = Date.now(); wBuf = []; return 'right'; }
    if (dx < -0.22) { lastSw = Date.now(); wBuf = []; return 'left'; }
    return null;
}

// ─────────────────────────────────────────────────────────────
//  PARTICLE SYSTEM
// ─────────────────────────────────────────────────────────────
function burst(x, y, n = 55, col) {
    col = col || PAL[Math.random() * PAL.length | 0];
    for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = Math.random() * 8 + 1;
        parts.push({
            x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2,
            life: 1, dec: Math.random() * .02 + .01, sz: Math.random() * 5 + 2, col
        });
    }
}
function tickP() {
    parts.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += .18; p.vx *= .97; p.life -= p.dec; });
    parts = parts.filter(p => p.life > 0);
}
function drawP() {
    parts.forEach(p => {
        g.save(); g.globalAlpha = p.life; g.fillStyle = p.col;
        g.beginPath(); g.arc(p.x, p.y, p.sz * p.life, 0, Math.PI * 2); g.fill(); g.restore();
    });
}
function startFW() {
    burst(Math.random() * W, Math.random() * H * .6 + 20, 70);
    for (let i = 1; i < 5; i++) setTimeout(() => burst(Math.random() * W, Math.random() * H * .65 + 20, 60), i * 200);
    fwI = setInterval(() => burst(Math.random() * W, Math.random() * H * .6 + 30, 50), 550);
}
function stopFW() { if (fwI) { clearInterval(fwI); fwI = null; } }

// ─────────────────────────────────────────────────────────────
//  DRAW UTILITIES
// ─────────────────────────────────────────────────────────────
function rr(x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function lxy(p) { return [(1 - p.x) * W, p.y * H]; }

function skel() {
    if (!lm) return;
    g.save();
    // 骨架線條改為溫和的藤蔓綠（Ivy Green）
    g.strokeStyle = 'rgba(143,188,143,.85)'; g.lineWidth = 2.5;
    SKEL.forEach(([a, b]) => {
        const [ax, ay] = lxy(lm[a]), [bx, by] = lxy(lm[b]);
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    });
    lm.forEach((p, i) => {
        const [x, y] = lxy(p);
        // 關節點改為嫩芽黃綠與秋實紅
        g.fillStyle = i ? '#A2D39B' : '#CD5C5C';
        g.beginPath(); g.arc(x, y, i ? 3.5 : 6, 0, Math.PI * 2); g.fill();
    });
    g.restore();
}

function boldT(t, x, y, fs, col, stroke, shadow) {
    g.save(); g.font = `bold ${fs}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (shadow) { g.shadowColor = shadow; g.shadowBlur = 24; }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 4; g.strokeText(t, x, y); }
    g.fillStyle = col || '#FFF'; g.fillText(t, x, y); g.restore();
}
function smT(t, x, y, fs, col) {
    g.save(); g.font = `${fs}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = col || 'rgba(230,245,235,.6)'; g.fillText(t, x, y); g.restore();
}

function scoreHUD() {
    g.save();
    const sw = 200, sh = 34, sx = W - sw - 12, sy = 12;
    // 計分板背景改為深木色調
    g.fillStyle = 'rgba(25,38,28,.82)'; rr(sx, sy, sw, sh, 8); g.fill();
    g.font = 'bold 13px Arial'; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillStyle = '#98FB98'; g.fillText(`✅ ${score.w}勝`, sx + 12, sy + sh / 2);
    g.fillStyle = '#FFA07A'; g.fillText(`❌ ${score.l}敗`, sx + 76, sy + sh / 2);
    g.fillStyle = '#E3A857'; g.fillText(`🤝 ${score.d}平`, sx + 142, sy + sh / 2);
    g.restore();
}

function card(gest, x, y, w, h, acc, a = 1) {
    g.save(); g.globalAlpha = a;
    g.fillStyle = acc + '18'; g.strokeStyle = acc; g.lineWidth = 2.5;
    rr(x, y, w, h, 14); g.fill(); g.stroke();
    g.font = `${Math.floor(h * .44)}px sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#FFF';
    g.fillText(EM[gest] || '❓', x + w / 2, y + h * .46);
    g.font = `bold ${Math.floor(h * .17)}px Arial`; g.fillStyle = acc;
    g.fillText(LB[gest] || '？', x + w / 2, y + h * .8);
    g.restore();
}

function btn(lbl, x, y, w, h, bg) {
    const hov = mx >= x && mx <= x + w && my >= y && my <= y + h;
    g.save();
    g.fillStyle = hov ? '#FFF' : bg; g.shadowColor = bg; g.shadowBlur = hov ? 24 : 10;
    rr(x, y, w, h, h / 2); g.fill(); g.shadowBlur = 0;
    g.font = `bold ${Math.floor(h * .36)}px Arial`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = hov ? bg : '#FFF'; g.fillText(lbl, x + w / 2, y + h / 2);
    g.restore();
}

// ─────────────────────────────────────────────────────────────
//  FAILURE MASK (樹精木質化面具)
// ─────────────────────────────────────────────────────────────
function drawMask(cx, cy, p) {
    if (p <= 0) return;
    const r = 78 * p;
    g.save(); g.globalAlpha = p;
    // 改為枯木與暗秋實的色調
    g.fillStyle = '#2E1A0C'; g.strokeStyle = '#8B5A2B'; g.lineWidth = 3;
    g.beginPath(); g.ellipse(cx, cy, r, r * 1.15, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    if (p > .35) {
        const q = (p - .35) / .65;
        [cx - 24, cx + 24].forEach(ex => {
            g.fillStyle = '#140B05';
            g.beginPath(); g.ellipse(ex, cy - 16, 13 * q, 8 * q, 0, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#E3A857';
            g.beginPath(); g.arc(ex + 3, cy - 20, 4 * q, 0, Math.PI * 2); g.fill();
        });
        g.strokeStyle = '#140B05'; g.lineWidth = 4; g.lineCap = 'round';
        g.beginPath();
        g.moveTo(cx - 28 * q, cy + 26);
        g.quadraticCurveTo(cx, cy + 52 * q, cx + 28 * q, cy + 26);
        g.stroke();
        if (q > .5) {
            const tp = (q - .5) / .5;
            g.fillStyle = 'rgba(70,130,180,.85)';
            [cx - 27, cx + 27].forEach(tx => {
                g.beginPath(); g.ellipse(tx, cy - 2 + 28 * tp, 4, 13 * tp, 0, 0, Math.PI * 2); g.fill();
            });
        }
        [[-1, cx - r + 15], [1, cx + r - 15]].forEach(([d, hx]) => {
            g.fillStyle = '#5C3A21'; g.strokeStyle = '#A0522D'; g.lineWidth = 2;
            g.beginPath();
            g.moveTo(hx - 10 * d, cy - r * .78);
            g.lineTo(hx, cy - r * 1.22 * q);
            g.lineTo(hx + 10 * d, cy - r * .78);
            g.closePath(); g.fill(); g.stroke();
        });
        g.strokeStyle = '#8B4513'; g.lineWidth = 3; g.lineCap = 'round';
        [[cx - 50, cy], [cx + 50, cy]].forEach(([ex, ey]) => {
            const s = 7 * q;
            g.beginPath(); g.moveTo(ex - s, ey - s); g.lineTo(ex + s, ey + s); g.stroke();
            g.beginPath(); g.moveTo(ex + s, ey - s); g.lineTo(ex - s, ey + s); g.stroke();
        });
        g.strokeStyle = 'rgba(139,90,43,.5)'; g.lineWidth = 1.5;
        g.beginPath(); g.ellipse(cx, cy, r * 1.12, r * 1.28, 0, 0, Math.PI * 2); g.stroke();
    }
    g.restore();
}

// ─────────────────────────────────────────────────────────────
//  DRAW VIDEO (mirrored)
// ─────────────────────────────────────────────────────────────
function drawVid() {
    if (!vid || vid.readyState < 2) return;
    g.save(); g.translate(W, 0); g.scale(-1, 1); g.drawImage(vid, 0, 0, W, H); g.restore();
}

// ─────────────────────────────────────────────────────────────
//  SHARED RESULT BACKGROUND
// ─────────────────────────────────────────────────────────────
function drawResultBg() {
    g.fillStyle = 'rgba(10,18,13,.85)'; g.fillRect(0, 0, W, H);
    // 玩家：苔綠色塊 / 電腦：秋葉褐色塊
    g.fillStyle = 'rgba(46,125,50,.18)'; g.fillRect(0, 0, W / 2 - 2, H);
    g.fillStyle = 'rgba(160,82,45,.15)'; g.fillRect(W / 2 + 2, 0, W / 2 - 2, H);
    
    // 微調文字垂直位置，避開上方遮擋
    boldT('你', W / 4, 130, 18, '#C3E6C5');
    boldT('電腦', W * 3 / 4, 130, 18, '#ECD1B4');
    
    // 牌卡邊框換色
    card(pG, 42, H / 2 - 60, W / 2 - 82, 144, '#6E8B3D');
    card(cG, W / 2 + 40, H / 2 - 60, W / 2 - 82, 144, '#CD853F');
}

// ─────────────────────────────────────────────────────────────
//  STATE RENDERERS
// ─────────────────────────────────────────────────────────────
function dLoading() {
    g.fillStyle = '#0a120d'; g.fillRect(0, 0, W, H);
    const t = Date.now() / 1000;
    boldT('森林魔法喚醒中… AI 辨識載入中', W / 2, H / 2 - 24, 24, '#FFF', null, '#8FBC8F');
    g.save(); g.strokeStyle = '#8FBC8F'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.arc(W / 2, H / 2 + 44, 24, t * 2.8, t * 2.8 + Math.PI * 1.4); g.stroke(); g.restore();
    smT('請允許攝影機存取以辨識手勢', W / 2, H / 2 + 94, 13, 'rgba(200,230,210,.4)');
    smT('✊ 石頭   🖐 布   ✌️ 剪刀', W / 2, H / 2 + 130, 16, 'rgba(255,255,255,.5)');
}

function dIdle() {
    skel(); scoreHUD();
    if (stable) {
        g.save();
        const isValid = PICKS.includes(stable);
        const bgCol = isValid ? 'rgba(46,115,60,0.7)' : 'rgba(40,30,20,0.65)';
        g.fillStyle = bgCol; rr(W - 145, 12, 130, 48, 10); g.fill();
        g.font = '22px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = '#FFF'; g.fillText(EM[stable] || '?', W - 115, 36);
        g.font = 'bold 14px Arial'; g.fillStyle = isValid ? '#FFF' : '#8FBC8F';
        g.fillText(LB[stable] || stable, W - 75, 36); g.restore();
    }
    
    // 漸層覆蓋改為森林暗綠色
    const gr = g.createLinearGradient(0, H - 148, 0, H);
    gr.addColorStop(0, 'rgba(10,20,13,0)'); gr.addColorStop(1, 'rgba(8,15,10,.95)');
    g.fillStyle = gr; g.fillRect(0, H - 148, W, 148);

    if (!lm) {
        boldT('請將手伸入畫面', W / 2, H - 90, 22, '#FFF');
        smT('比出  ✊ 石頭  ·  🖐 布  ·  ✌️ 剪刀', W / 2, H - 56, 15, 'rgba(220,240,225,.7)');
    } else if (stable) {
        const isValid = PICKS.includes(stable);
        boldT(isValid ? `已鎖定手勢：${EM[stable]} ${LB[stable]}` : `請更換拳式：${EM[stable] || stable}`, W / 2, H - 102, 20, isValid ? '#98FB98' : '#E3A857', null, isValid ? '#4F7942' : null);
        const pct = holdT ? Math.min(1, (Date.now() - holdT) / HOLD) : 0;
        g.fillStyle = 'rgba(255,255,255,.12)'; rr(W / 2 - 104, H - 70, 208, 12, 6); g.fill();
        g.fillStyle = pct < .5 ? '#E3A857' : pct < .9 ? '#8FBC8F' : '#6B8E23';
        rr(W / 2 - 104, H - 70, 208 * pct, 12, 6); g.fill();
        smT(!isValid ? '⚠️ 此為功能鍵，請換成猜拳手勢' : pct < 1 ? '保持著，自然之力凝聚中...' : 'GO!', W / 2, H - 44, 13, 'rgba(230,245,235,.7)');
    } else {
        boldT('請比出 石頭 / 布 / 剪刀', W / 2, H - 82, 18, '#E3A857');
        smT('確保手部清晰，保持姿態 0.5 秒', W / 2, H - 52, 14, 'rgba(220,240,225,.5)');
    }
}

function dCountdown() {
    const el = Date.now() - stAt;
    skel(); scoreHUD();
    const rem = CD * 1000 - el, sc = Math.ceil(rem / 1000);
    const col = sc === 1 ? '#CD5C5C' : sc === 2 ? '#E3A857' : '#8FBC8F';
    const pulse = 1 + .22 * Math.abs(Math.sin(el / 280));
    g.save(); g.translate(W / 2, H / 2 - 20); g.scale(pulse, pulse);
    g.font = 'bold 110px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = col; g.shadowBlur = 35; g.fillStyle = col; g.fillText(sc, 0, 0); g.restore();
    
    g.fillStyle = 'rgba(10,20,14,.75)'; g.fillRect(0, 0, W, 68);
    boldT(`你預備出拳：${EM[pG] || '？'} ${LB[pG] || '？'}`, W / 2, 34, 20, '#FFF');
    g.fillStyle = 'rgba(10,20,14,.65)'; g.fillRect(0, H - 50, W, 50);
    const dots = '.'.repeat(Math.floor(el / 380) % 4);
    smT(`萬物靜止，電腦正在思索${dots}`, W / 2, H - 25, 15);
}

function dReveal() {
    const el = Date.now() - stAt;
    const cpuA = Math.min(1, Math.max(0, (el - 400) / 500));
    g.fillStyle = 'rgba(12,20,15,.82)'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(46,125,50,.15)'; g.fillRect(0, 0, W / 2 - 2, H);
    g.fillStyle = 'rgba(160,82,45,.15)'; g.fillRect(W / 2 + 2, 0, W / 2 - 2, H);
    
    boldT('你', W / 4, 46, 18, '#C3E6C5');
    boldT('電腦', W * 3 / 4, 46, 18, '#ECD1B4');
    boldT('VS', W / 2, H / 2 - 60, 34, '#FFF', null, '#8FBC8F');
    
    card(pG, 42, H / 2 - 60, W / 2 - 82, 144, '#6E8B3D');
    card(cG, W / 2 + 40, H / 2 - 60, W / 2 - 82, 144, '#CD853F', cpuA);
    if (cpuA < .95) {
        g.save(); g.font = '60px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.globalAlpha = 1 - cpuA; g.fillStyle = 'rgba(255,255,255,.6)'; g.fillText('❓', W * 3 / 4, H / 2 - 60); g.restore();
    }
    scoreHUD();
}

function dWin() {
    drawResultBg();
    drawP(); scoreHUD();
    const el = Date.now() - stAt, pulse = 1 + .06 * Math.sin(el / 170);
    g.fillStyle = 'rgba(8,18,12,.85)'; g.fillRect(0, 0, W, 96);
    boldT('🍃 盎然大勝！🎉', W / 2, 48, Math.floor(38 * pulse), '#E3A857', '#3A5F26', '#E3A857');
    g.fillStyle = 'rgba(8,18,12,.82)'; g.fillRect(0, H - 62, W, 62);
    smT(`你的 ${EM[pG]}${LB[pG]} 破風突圍，擊敗電腦的 ${EM[cG]}${LB[cG]}`, W / 2, H - 31, 17, '#FFF');
}

function dLose() {
    const el = Date.now() - stAt;
    maskP = Math.min(1, el / 700);
    drawResultBg();
    // 失敗光暈改為暗落葉橘褐色調
    g.fillStyle = `rgba(100,50,20,${maskP * .22})`; g.fillRect(0, 0, W, H);
    drawMask(W * .72, H * .72, maskP * .85);
    scoreHUD();
    g.fillStyle = 'rgba(15,10,8,.85)'; g.fillRect(0, 0, W, 96);
    const sh = el < 800 ? Math.sin(el / 38) * 4 : 0;
    boldT('🍂 遺憾落葉！', W / 2 + sh, 48, 40, '#CD853F', '#1F120A', '#BC8F8F');
    g.fillStyle = 'rgba(15,10,8,.82)'; g.fillRect(0, H - 62, W, 62);
    smT(`你的 ${EM[pG]}${LB[pG]} 稍遜一籌，輸給電腦的 ${EM[cG]}${LB[cG]}`, W / 2, H - 31, 17, '#FFF');
}

function dDraw() {
    const el = Date.now() - stAt, pulse = 1 + .06 * Math.sin(el / 160);
    drawResultBg();
    scoreHUD();
    g.fillStyle = 'rgba(12,15,12,.85)'; g.fillRect(0, 0, W, 96);
    boldT('🤝 旗鼓相當，再生林息！', W / 2, 48, Math.floor(34 * pulse), '#E3A857', '#222', '#E3A857');
    g.fillStyle = 'rgba(12,15,12,.82)'; g.fillRect(0, H - 62, W, 62);
    smT(`雙方皆出 ${EM[pG]}${LB[pG]}，平分秋色！`, W / 2, H - 31, 17, '#FFF');
}

function dMenu() {
    g.fillStyle = 'rgba(10,18,12,.88)'; g.fillRect(0, 0, W, H);
    scoreHUD();
    boldT('是否再啟征程？', W / 2, H / 2 - 78, 32, '#FFF', null, '#556B2F');
    
    g.save();
    g.fillStyle = 'rgba(255,255,255,.05)'; rr(W / 2 - 140, H / 2 - 50, 280, 35, 8); g.fill();
    g.font = '14px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(200,230,210,.6)';
    g.fillText(`戰績：✅ ${score.w}勝  ❌ ${score.l}敗  🤝 ${score.d}平`, W / 2, H / 2 - 33); g.restore();
    
    smT('意念抉擇：點擊按鈕，或比出手勢', W / 2, H / 2 + 6, 14, 'rgba(200,220,205,.4)');
    const bw = 132, bh = 52, by = H / 2 + 24;
    
    // 按鈕顏色改為深秋橘與常青綠
    btn('🏠 歸隱結束', W / 2 - bw - 8, by, bw, bh, '#8B4513');
    btn('🎮 繼續探險', W / 2 + 8, by, bw, bh, '#3E6B48');
    
    g.save();
    g.fillStyle = 'rgba(255,255,255,.04)'; rr(20, H / 2 + 90, W - 40, 32, 8); g.fill();
    g.font = '13px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(180,210,190,.55)';
    g.fillText('💡 🤙 比六（姆指+小指）🏠 結束  ·  ☝️ 比七（姆指+食指）🎮 繼續', W / 2, H / 2 + 106); g.restore();

    if (st === 'menu' && (stable === 'six' || stable === 'seven')) {
        const pct = menuHoldT ? Math.min(1, (Date.now() - menuHoldT) / HOLD) : 0;
        const col = stable === 'seven' ? '#8FBC8F' : '#CD853F';
        g.fillStyle = 'rgba(255,255,255,0.08)'; rr(W / 2 - 100, H / 2 + 132, 200, 8, 4); g.fill();
        g.fillStyle = col; rr(W / 2 - 100, H / 2 + 132, 200 * pct, 8, 4); g.fill();
        const txt = stable === 'seven' ? '☝️ 比七 準備繼續...' : '🤙 比六 準備結束...';
        boldT(txt, W / 2, H / 2 + 158, 18, col, '#111');
    }
}

function dEnded() {
    g.fillStyle = '#070f0a'; g.fillRect(0, 0, W, H);
    boldT('感謝遊玩！', W / 2, H / 2 - 60, 44, '#FFF', null, '#556B2F');
    g.save(); g.font = 'bold 19px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(180,210,190,.75)';
    g.fillText(`最終生態：✅ ${score.w} 勝  ❌ ${score.l} 敗  🤝 ${score.d} 平`, W / 2, H / 2 + 10); g.restore();
    smT('重新整理頁面可再次進入森林大賽', W / 2, H / 2 + 60, 14, 'rgba(150,170,155,.4)');
}

// ─────────────────────────────────────────────────────────────
//  UPDATE
// ─────────────────────────────────────────────────────────────
function update() {
    const now = Date.now(), el = now - stAt;
    tickP();

    switch (st) {
        case 'menu':
            if (stable === 'six' || stable === 'seven') {
                if (!menuHoldT) menuHoldT = now;
                if (now - menuHoldT >= HOLD) {
                    if (stable === 'seven') startGame();
                    else enter('ended');
                    menuHoldT = null;
                }
            } else {
                menuHoldT = null;
            }
            break;

        case 'idle':
            if (stable && PICKS.includes(stable)) {
                if (pG !== stable) { holdT = now; pG = stable; }
                if (now - holdT >= HOLD) { enter('countdown'); }
            } else if (stable === 'thumbs_up' || stable === 'six' || stable === 'seven' || !lm) {
                holdT = null; pG = null;
            }
            break;

        case 'countdown':
            if (stable && PICKS.includes(stable)) pG = stable;
            if (el >= CD * 1000) {
                if (!pG) pG = PICKS[Math.random() * 3 | 0];
                cG = PICKS[Math.random() * 3 | 0];
                enter('reveal');
            }
            break;

        case 'reveal':
            if (el > 1600) {
                const res = pG === cG ? 'draw' : BEATS[pG] === cG ? 'win' : 'lose';
                if (res === 'win') score.w++;
                else if (res === 'lose') score.l++;
                else score.d++;
                enter(res); maskP = 0;
                if (res === 'win') startFW();
            }
            break;

        case 'win':
            if (el > 3800) { stopFW(); enter('menu'); }
            break;

        case 'lose':
            if (el > 3200) enter('menu');
            break;

        case 'draw':
            if (el > 2500) enter('menu');
            break;
    }
}

function onClk(e) {
    if (st !== 'menu') return;
    const r = cv.getBoundingClientRect();
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    const bw = 132, bh = 52, by = H / 2 + 24;
    if (cx >= W / 2 + 8 && cx <= W / 2 + 8 + bw && cy >= by && cy <= by + bh) startGame();
    if (cx >= W / 2 - bw - 8 && cx <= W / 2 - 8 && cy >= by && cy <= by + bh) enter('ended');
}

function startGame() {
    parts = []; maskP = 0; gBuf = []; stable = null;
    holdT = null; pG = null; cG = null;
    menuHoldT = null;
    stopFW(); enter('idle');
}

function loop() {
    update();
    g.clearRect(0, 0, W, H);
    if (st !== 'loading' && st !== 'ended') drawVid();
    const draw = {
        loading: dLoading, idle: dIdle, countdown: dCountdown, reveal: dReveal,
        win: dWin, lose: dLose, draw: dDraw, menu: dMenu, ended: dEnded
    };
    (draw[st] || dLoading)();
    requestAnimationFrame(loop);
}

loop();
