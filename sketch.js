'use strict';

// ─────────────────────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────────────────────
const W = 640, H = 480;
const cv = document.getElementById('c');
const g = cv.getContext('2d');
const vid = document.getElementById('vid');

const PICKS = ['rock', 'paper', 'scissors'];
const EM = { rock: '✊', paper: '🖐', scissors: '✌️', thumbs_up: '👍' };
const LB = { rock: '石頭', paper: '布', scissors: '剪刀', thumbs_up: '讚' };
const BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
const PAL = ['#FF6B6B', '#FFE66D', '#4ECDC4', '#C3A6FF', '#FF9F43', '#56CCF2', '#FD79A8', '#A3F7BF'];
const SKEL = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];

// ─────────────────────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────────────────────
let st = 'loading', stAt = Date.now();
const enter = s => { st = s; stAt = Date.now(); };

let pG = null, cG = null;         // player / cpu gesture
let lm = null, stable = null, handedness = null; // landmarks, gesture, side
let gBuf = [], holdT = null;      // gesture buffer, hold-start time
let menuHoldT = null;             // 選單專用計時器
const BUF = 10, HOLD = 400, CD = 3; // 縮短判定時間 (0.4s)，提升啟動靈敏度

let score = { w: 0, l: 0, d: 0 };
let parts = [], fwI = null, maskP = 0;
let wBuf = [], lastSw = 0; const WN = 18; // 縮短緩衝區長度，提升反應速度

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
            handedness = r.multiHandedness[0].label; // "Left" or "Right"
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
    const tips = [8, 12, 16, 20], pips = [6, 10, 14, 18];
    const ext = tips.map((t, i) => l[t].y < l[pips[i]].y);
    const n = ext.filter(Boolean).length;

    // 偵測比讚 (Thumbs Up): 拇指尖端明顯高於手掌中心與其餘關節
    const thumbUp = l[4].y < l[3].y && l[4].y < l[2].y && l[4].y < l[5].y;
    if (thumbUp && n === 0) return 'thumbs_up';

    if (n === 0) return 'rock';
    if (n >= 3) return 'paper';
    if (ext[0] && ext[1] && !ext[2] && !ext[3]) return 'scissors';
    return 'unknown';
}
function vote(buf) {
    if (buf.length < 6) return null;
    const c = {}; buf.forEach(v => { c[v] = (c[v] || 0) + 1; });
    let b = null, bn = 0;
    for (const v in c) if (v !== 'unknown' && c[v] > bn) { bn = c[v]; b = v; }
    return bn / buf.length >= .55 ? b : null;
}

// ─────────────────────────────────────────────────────────────
//  SWIPE DETECTION  (mirrored coords: right swipe = +dx)
// ─────────────────────────────────────────────────────────────
function checkSwipe() {
    if (wBuf.length < WN || Date.now() - lastSw < 1000) return null;
    const span = wBuf.at(-1).t - wBuf[0].t;
    if (span > 800) return null; // 揮動太慢不列入計算
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
    g.strokeStyle = 'rgba(0,255,130,.8)'; g.lineWidth = 2;
    SKEL.forEach(([a, b]) => {
        const [ax, ay] = lxy(lm[a]), [bx, by] = lxy(lm[b]);
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    });
    lm.forEach((p, i) => {
        const [x, y] = lxy(p);
        g.fillStyle = i ? '#00FF88' : '#FF4466';
        g.beginPath(); g.arc(x, y, i ? 3.5 : 6, 0, Math.PI * 2); g.fill();
    });
    g.restore();
}

function boldT(t, x, y, fs, col, stroke, shadow) {
    g.save(); g.font = `bold ${fs}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (shadow) { g.shadowColor = shadow; g.shadowBlur = 28; }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 4; g.strokeText(t, x, y); }
    g.fillStyle = col || '#FFF'; g.fillText(t, x, y); g.restore();
}
function smT(t, x, y, fs, col) {
    g.save(); g.font = `${fs}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = col || 'rgba(255,255,255,.6)'; g.fillText(t, x, y); g.restore();
}

function scoreHUD() {
    g.save();
    const sw = 192, sh = 34, sx = W - sw - 8, sy = 8;
    g.fillStyle = 'rgba(0,0,0,.58)'; rr(sx, sy, sw, sh, 8); g.fill();
    g.font = 'bold 13px Arial'; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillStyle = '#00FF88'; g.fillText(`✅ ${score.w}勝`, sx + 10, sy + sh / 2);
    g.fillStyle = '#FF6B6B'; g.fillText(`❌ ${score.l}敗`, sx + 72, sy + sh / 2);
    g.fillStyle = '#FFD93D'; g.fillText(`🤝 ${score.d}平`, sx + 138, sy + sh / 2);
    g.restore();
}

function card(gest, x, y, w, h, acc, a = 1) {
    g.save(); g.globalAlpha = a;
    g.fillStyle = acc + '22'; g.strokeStyle = acc; g.lineWidth = 2;
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
    g.font = `bold ${Math.floor(h * .38)}px Arial`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = hov ? bg : '#FFF'; g.fillText(lbl, x + w / 2, y + h / 2);
    g.restore();
}

// ─────────────────────────────────────────────────────────────
//  FAILURE MASK  (theatrical demonic face)
// ─────────────────────────────────────────────────────────────
function drawMask(cx, cy, p) {
    if (p <= 0) return;
    const r = 78 * p;
    g.save(); g.globalAlpha = p;

    // face ellipse
    g.fillStyle = '#4A0000'; g.strokeStyle = '#BB1100'; g.lineWidth = 3;
    g.beginPath(); g.ellipse(cx, cy, r, r * 1.15, 0, 0, Math.PI * 2); g.fill(); g.stroke();

    if (p > .35) {
        const q = (p - .35) / .65;

        // eyes (hollow, despairing)
        [cx - 24, cx + 24].forEach(ex => {
            g.fillStyle = '#1A0000';
            g.beginPath(); g.ellipse(ex, cy - 16, 13 * q, 8 * q, 0, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#DDD';
            g.beginPath(); g.arc(ex + 3, cy - 20, 4 * q, 0, Math.PI * 2); g.fill();
        });

        // sad mouth (downward arc)
        g.strokeStyle = '#1A0000'; g.lineWidth = 4; g.lineCap = 'round';
        g.beginPath();
        g.moveTo(cx - 28 * q, cy + 26);
        g.quadraticCurveTo(cx, cy + 52 * q, cx + 28 * q, cy + 26);
        g.stroke();

        // tears
        if (q > .5) {
            const tp = (q - .5) / .5;
            g.fillStyle = 'rgba(90,140,255,.85)';
            [cx - 27, cx + 27].forEach(tx => {
                g.beginPath(); g.ellipse(tx, cy - 2 + 28 * tp, 4, 13 * tp, 0, 0, Math.PI * 2); g.fill();
            });
        }

        // horns
        [[-1, cx - r + 15], [1, cx + r - 15]].forEach(([d, hx]) => {
            g.fillStyle = '#7A0000'; g.strokeStyle = '#FF3300'; g.lineWidth = 2;
            g.beginPath();
            g.moveTo(hx - 10 * d, cy - r * .78);
            g.lineTo(hx, cy - r * 1.22 * q);
            g.lineTo(hx + 10 * d, cy - r * .78);
            g.closePath(); g.fill(); g.stroke();
        });

        // X cheeks (shame marks)
        g.strokeStyle = '#CC0000'; g.lineWidth = 3; g.lineCap = 'round';
        [[cx - 50, cy], [cx + 50, cy]].forEach(([ex, ey]) => {
            const s = 7 * q;
            g.beginPath(); g.moveTo(ex - s, ey - s); g.lineTo(ex + s, ey + s); g.stroke();
            g.beginPath(); g.moveTo(ex + s, ey - s); g.lineTo(ex - s, ey + s); g.stroke();
        });

        // decorative rim circles
        g.strokeStyle = 'rgba(180,0,0,.5)'; g.lineWidth = 1.5;
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
//  STATE RENDERERS
// ─────────────────────────────────────────────────────────────
function dLoading() {
    g.fillStyle = '#0d1117'; g.fillRect(0, 0, W, H);
    const t = Date.now() / 1000;
    boldT('載入 AI 手勢辨識中…', W / 2, H / 2 - 24, 26, '#FFF', null, '#4ECDC4');
    g.save(); g.strokeStyle = '#4ECDC4'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.arc(W / 2, H / 2 + 44, 24, t * 2.8, t * 2.8 + Math.PI * 1.4); g.stroke(); g.restore();
    smT('請允許攝影機存取', W / 2, H / 2 + 94, 14, 'rgba(255,255,255,.35)');
    smT('✊ 石頭   🖐 布   ✌️ 剪刀', W / 2, H / 2 + 130, 16, 'rgba(255,255,255,.5)');
}

function dIdle() {
    skel(); scoreHUD();
    if (stable) {
        g.save();
        const isValid = PICKS.includes(stable);
        const bgCol = isValid ? 'rgba(0,180,100,0.6)' : 'rgba(0,0,0,0.55)';
        g.fillStyle = bgCol; rr(W - 145, 8, 130, 48, 10); g.fill();
        g.font = '22px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = '#FFF'; g.fillText(EM[stable], W - 115, 32);
        g.font = 'bold 14px Arial'; g.fillStyle = isValid ? '#FFF' : '#00FF88';
        g.fillText(LB[stable], W - 75, 32); g.restore();
    }
    const gr = g.createLinearGradient(0, H - 148, 0, H);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.9)');
    g.fillStyle = gr; g.fillRect(0, H - 148, W, 148);

    if (!lm) {
        boldT('請將手伸入畫面', W / 2, H - 90, 22, '#FFF');
        smT('比出  ✊ 石頭  ·  🖐 布  ·  ✌️ 剪刀', W / 2, H - 56, 15);
    } else if (stable) {
        const isValid = PICKS.includes(stable);
        boldT(isValid ? `鎖定中：${EM[stable]} ${LB[stable]}` : `請換個手勢：${EM[stable]}`, W / 2, H - 102, 20, isValid ? '#00FF88' : '#FFD93D', null, isValid ? '#00FF88' : null);
        const pct = holdT ? Math.min(1, (Date.now() - holdT) / HOLD) : 0;
        g.fillStyle = 'rgba(255,255,255,.18)'; rr(W / 2 - 104, H - 70, 208, 13, 6); g.fill();
        g.fillStyle = pct < .5 ? '#FFD93D' : pct < .9 ? '#4ECDC4' : '#00FF88';
        rr(W / 2 - 104, H - 70, 208 * pct, 13, 6); g.fill();
        smT(!isValid ? '⚠️ 這是功能鍵，請比出拳手勢' : pct < 1 ? '保持手勢，即將開始...' : 'GO!', W / 2, H - 44, 13, 'rgba(255,255,255,.7)');
    } else {
        boldT('請比出石頭 / 布 / 剪刀', W / 2, H - 82, 18, '#FFD93D');
        smT('確保手部清晰，保持手勢 0.5 秒', W / 2, H - 52, 14, 'rgba(255,255,255,.4)');
    }
}

function dCountdown() {
    const el = Date.now() - stAt;
    skel(); scoreHUD();
    const rem = CD * 1000 - el, sc = Math.ceil(rem / 1000);
    const col = sc === 1 ? '#FF4444' : sc === 2 ? '#FFB700' : '#00FF88';
    const pulse = 1 + .22 * Math.abs(Math.sin(el / 280));
    g.save(); g.translate(W / 2, H / 2); g.scale(pulse, pulse);
    g.font = 'bold 118px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = col; g.shadowBlur = 45; g.fillStyle = col; g.fillText(sc, 0, 0); g.restore();
    g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(0, 0, W, 68);
    boldT(`你出：${EM[pG] || '？'} ${LB[pG] || '？'}`, W / 2, 34, 22, '#FFF');
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, H - 50, W, 50);
    const dots = '.'.repeat(Math.floor(el / 380) % 4);
    smT(`電腦正在思考${dots}`, W / 2, H - 25, 15);
}

function dReveal() {
    const el = Date.now() - stAt;
    const cpuA = Math.min(1, Math.max(0, (el - 400) / 500));
    g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(20,70,200,.3)'; g.fillRect(0, 0, W / 2 - 2, H);
    g.fillStyle = 'rgba(200,20,20,.3)'; g.fillRect(W / 2 + 2, 0, W / 2 - 2, H);
    boldT('你', W / 4, 36, 20, '#AAD4FF');
    boldT('電腦', W * 3 / 4, 36, 20, '#FFAAAA');
    boldT('VS', W / 2, H / 2, 38, '#FFF', null, '#FFF');
    card(pG, 42, H / 2 - 72, W / 2 - 82, 144, '#4488FF');
    card(cG, W / 2 + 40, H / 2 - 72, W / 2 - 82, 144, '#FF4444', cpuA);
    if (cpuA < .95) {
        g.save(); g.font = '60px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.globalAlpha = 1 - cpuA; g.fillStyle = 'rgba(255,255,255,.7)'; g.fillText('❓', W * 3 / 4, H / 2); g.restore();
    }
    scoreHUD();
}

function dWin() {
    drawP(); scoreHUD();
    const el = Date.now() - stAt, pulse = 1 + .07 * Math.sin(el / 170);
    g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(0, 0, W, 88);
    boldT('🎉 恭喜你贏了！🎉', W / 2, 44, Math.floor(44 * pulse), '#FFD700', '#FF6600', '#FFD700');
    g.fillStyle = 'rgba(0,0,0,.62)'; g.fillRect(0, H - 76, W, 76);
    smT(`你的 ${EM[pG]}${LB[pG]}  打敗了  電腦的 ${EM[cG]}${LB[cG]}`, W / 2, H - 38, 21, '#FFF');
}

function dLose() {
    const el = Date.now() - stAt;
    maskP = Math.min(1, el / 700);
    g.fillStyle = `rgba(140,0,0,${maskP * .35})`; g.fillRect(0, 0, W, H);
    drawMask(W * .72, H * .42, maskP);
    scoreHUD();
    g.fillStyle = 'rgba(0,0,0,.72)'; g.fillRect(0, 0, W, 88);
    const sh = el < 800 ? Math.sin(el / 38) * 4 : 0;
    boldT('😢 你輸了！', W / 2 + sh, 44, 44, '#FF2222', '#000', '#FF2222');
    g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(0, H - 76, W, 76);
    smT(`你的 ${EM[pG]}${LB[pG]}  輸給了  電腦的 ${EM[cG]}${LB[cG]}`, W / 2, H - 38, 21, '#FFF');
}

function dDraw() {
    const el = Date.now() - stAt, pulse = 1 + .06 * Math.sin(el / 160);
    scoreHUD();
    g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(0, 0, W, 88);
    boldT('🤝 平局！再來一次！', W / 2, 44, Math.floor(42 * pulse), '#FFD93D', '#000', '#FFD93D');
    g.fillStyle = 'rgba(0,0,0,.62)'; g.fillRect(0, H - 76, W, 76);
    smT(`你們都出了 ${EM[pG]}${LB[pG]}，旗鼓相當！`, W / 2, H - 38, 21, '#FFF');
}

function dMenu() {
    g.fillStyle = 'rgba(0,0,0,.78)'; g.fillRect(0, 0, W, H);
    scoreHUD();
    boldT('再玩一局？', W / 2, H / 2 - 78, 34, '#FFF');
    g.save();
    g.fillStyle = 'rgba(255,255,255,.07)'; rr(W / 2 - 140, H / 2 - 50, 280, 35, 8); g.fill();
    g.font = '14px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,255,255,.5)';
    g.fillText(`✅ ${score.w}勝  ❌ ${score.l}敗  🤝 ${score.d}平`, W / 2, H / 2 - 33); g.restore();
    smT('點擊按鈕，或比出 👍 選擇', W / 2, H / 2 + 6, 14);
    const bw = 132, bh = 52, by = H / 2 + 24;
    btn('🏠 結束', W / 2 - bw - 8, by, bw, bh, '#CC2200'); 
    btn('🎮 繼續', W / 2 + 8, by, bw, bh, '#00AA44');      
    g.save();
    g.fillStyle = 'rgba(255,255,255,.06)'; rr(20, H / 2 + 90, W - 40, 32, 8); g.fill();
    g.font = '13px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,255,255,.45)';
    g.fillText('💡 右手比 👍 🎮 繼續  ·  左手比 👍 🏠 結束', W / 2, H / 2 + 106); g.restore();

    // 繪製選單手勢進度條
    if (st === 'menu' && stable === 'thumbs_up') {
        const pct = menuHoldT ? Math.min(1, (Date.now() - menuHoldT) / HOLD) : 0;
        const isRight = handedness === 'Right';
        const col = isRight ? '#00FF88' : '#FF4444';
        g.fillStyle = 'rgba(255,255,255,0.1)'; rr(W / 2 - 100, H / 2 + 132, 200, 8, 4); g.fill();
        g.fillStyle = col; rr(W / 2 - 100, H / 2 + 132, 200 * pct, 8, 4); g.fill();
        const txt = isRight ? '🎮 準備繼續...' : '🏠 準備結束...';
        boldT(txt, W / 2, H / 2 + 158, 20, col, '#000');
    }
}

function dEnded() {
    g.fillStyle = '#0d1117'; g.fillRect(0, 0, W, H);
    boldT('感謝遊戲！', W / 2, H / 2 - 60, 48, '#FFF', null, '#4ECDC4');
    g.save(); g.font = 'bold 20px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,255,255,.65)';
    g.fillText(`✅ ${score.w} 勝  ❌ ${score.l} 敗  🤝 ${score.d} 平`, W / 2, H / 2 + 10); g.restore();
    smT('重新整理頁面可再次遊戲', W / 2, H / 2 + 60, 15, 'rgba(255,255,255,.32)');
}

function update() {
    const now = Date.now(), el = now - stAt;
    tickP();

    // 選單狀態的邏輯處理
    if (st === 'menu') {
        if (stable === 'thumbs_up' && handedness) {
            if (!menuHoldT) menuHoldT = now;
            if (now - menuHoldT >= HOLD) {
                if (handedness === 'Right') startGame();
                else enter('ended');
                menuHoldT = null;
            }
        } else {
            menuHoldT = null;
        }
    }

    if (st === 'idle') {
        if (stable && PICKS.includes(stable)) {
            // 如果是新的手勢，才重新計時
            if (pG !== stable) {
                holdT = now;
                pG = stable;
            }
            if (now - holdT >= HOLD) {
                enter('countdown');
            }
        } else if (stable === 'thumbs_up' || !lm) {
            // 只有在手消失或是變成「比讚」時才重置，避免閃爍中斷計時
            holdT = null;
            pG = null;
        }
    }
    if (st === 'countdown') {
        // 修正：倒數時也只能更新為有效的猜拳手勢
        if (stable && PICKS.includes(stable)) pG = stable;
        if (el >= CD * 1000) {
            if (!pG) pG = PICKS[Math.random() * 3 | 0];
            cG = PICKS[Math.random() * 3 | 0];
            enter('reveal');
        }
    }
    if (st === 'reveal' && el > 1500) {
        const res = pG === cG ? 'draw' : BEATS[pG] === cG ? 'win' : 'lose';
        if (res === 'win') score.w++;
        else if (res === 'lose') score.l++;
        else score.d++;
        enter(res); maskP = 0;
        if (res === 'win') startFW();
    }
    if (st === 'win' && el > 4800) { stopFW(); enter('menu'); }
    if (st === 'lose' && el > 3800) enter('menu');
    if (st === 'draw' && el > 2800) enter('menu');
}

function onClk(e) {
    if (st !== 'menu') return;
    const r = cv.getBoundingClientRect();
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    const bw = 132, bh = 52, by = H / 2 + 24;
    if (cx >= W / 2 + 8 && cx <= W / 2 + 8 + bw && cy >= by && cy <= by + bh) startGame(); // 右鍵：繼續
    if (cx >= W / 2 - bw - 8 && cx <= W / 2 - 8 && cy >= by && cy <= by + bh) enter('ended'); // 左鍵：結束
}
function startGame() {
    parts = []; maskP = 0; gBuf = []; stable = null;
    holdT = null; pG = null; cG = null;
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