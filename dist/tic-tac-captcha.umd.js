/* tic-tac-captcha UMD — 由 scripts/build.js 生成，请勿手改 */
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self,
   factory(global.TicTacCaptcha = {}));
})(this, function (exports) {
'use strict';

/**
 * tic-tac-captcha — 井字棋行为验证码（核心，框架无关）
 *
 * 规则：玩家执 X 先手，对战“简单”电脑（能赢必赢、五成概率防守、其余随机）。
 *       玩家获胜或平局 → 验证通过；电脑获胜 → 验证失败。
 *
 * ESM 用法：
 *   import { createCaptcha } from 'tic-tac-captcha';
 *   createCaptcha(el, { popup: true, onVerified(passed) {...}, onReset() {...} });
 *
 * 浏览器（UMD 构建产物）用法：
 *   <script src="dist/tic-tac-captcha.umd.js"></script>
 *   TicTacCaptcha.create(el, { popup: true, onVerified(passed) {...} });
 *
 * 选项：
 *   popup      boolean  弹窗模式：容器内渲染“点击进行人机验证”触发按钮，点击后弹出棋盘（默认 false，内嵌）
 *   onVerified fn       每局结束时回调，参数 passed: boolean
 *   onReset    fn       点击 ↻ / 「再试一次」重置时回调
 *
 * 返回实例方法：
 *   reset()              重置一局（触发 onReset）
 *   getState()           'playing' | 'success' | 'fail'
 *   open() / close()     弹窗模式下打开/关闭验证窗口
 *   destroy()            清理定时器（框架组件卸载时调用）
 */
var WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

var STYLE_ID = 'ttc-style';
var CSS = [
  '.ttc-root{--ttc-border:#e3e8f0;--ttc-surface:#fff;--ttc-cell:#f4f6fa;--ttc-cell-hover:#e9eef6;',
  '--ttc-text:#1e2430;--ttc-dim:#8b95a8;--ttc-x:#2563eb;--ttc-o:#e11d48;--ttc-ok:#16a34a;--ttc-bad:#dc2626;',
  '--ttc-win:#fdf0c8}',
  '@media (prefers-color-scheme: dark){.ttc-root{--ttc-border:#2c3750;--ttc-surface:#1a2130;--ttc-cell:#222b3e;',
  '--ttc-cell-hover:#2a3550;--ttc-text:#e8ecf4;--ttc-x:#60a5fa;--ttc-o:#fb7185;--ttc-win:rgba(250,204,21,.15)}}',
  '.ttc-box{position:relative;width:100%;max-width:320px;box-sizing:border-box;margin:0 auto;',
  'padding:16px;font-family:inherit;background:var(--ttc-surface);border:1px solid var(--ttc-border);',
  'border-radius:14px;color:var(--ttc-text);transition:border-color .2s,box-shadow .2s}',
  '.ttc-box[data-state="success"]{border-color:var(--ttc-ok);box-shadow:0 0 0 3px rgba(22,163,74,.18)}',
  '.ttc-box[data-state="fail"]{border-color:var(--ttc-bad);box-shadow:0 0 0 3px rgba(220,38,38,.18)}',
  '.ttc-head{display:flex;align-items:center;justify-content:space-between}',
  '.ttc-title{font-size:14px;font-weight:700}',
  '.ttc-refresh{border:0;background:transparent;color:inherit;font-size:17px;line-height:1;',
  'padding:3px 7px;border-radius:8px;cursor:pointer;opacity:.55;transition:opacity .15s,background .15s}',
  '.ttc-refresh:hover{opacity:1;background:rgba(128,128,128,.18)}',
  '.ttc-tip{margin:5px 0 12px;font-size:12px;color:var(--ttc-dim)}',
  '.ttc-board{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;width:min(100%,228px);margin:0 auto}',
  '.ttc-cell{position:relative;aspect-ratio:1;padding:0;border:1px solid var(--ttc-border);border-radius:9px;',
  'background:var(--ttc-cell);cursor:pointer;transition:background .15s}',
  '.ttc-box:not(.ttc-idle) .ttc-cell:not([data-mark]):hover{background:var(--ttc-cell-hover)}',
  '.ttc-box.ttc-idle .ttc-cell{cursor:default}',
  '.ttc-mark{position:absolute;inset:0;width:100%;height:100%;opacity:0;pointer-events:none;transition:opacity .15s}',
  '.ttc-mark line{--len:63;stroke:var(--ttc-x);stroke-width:11;stroke-linecap:round;fill:none;',
  'stroke-dasharray:var(--len);stroke-dashoffset:0}',
  '.ttc-mark circle{--len:151;stroke:var(--ttc-o);stroke-width:11;fill:none;',
  'stroke-dasharray:var(--len);stroke-dashoffset:0}',
  '.ttc-cell[data-mark="X"] .ttc-mark-x,.ttc-cell[data-mark="O"] .ttc-mark-o{opacity:1}',
  '.ttc-cell[data-mark] .ttc-mark line,.ttc-cell[data-mark] .ttc-mark circle{stroke-dashoffset:var(--len)}',
  '.ttc-cell[data-mark="X"] .ttc-mark line{animation:ttc-draw .28s ease-out forwards}',
  '.ttc-cell[data-mark="X"] .ttc-mark line:last-child{animation-delay:.14s}',
  '.ttc-cell[data-mark="O"] .ttc-mark circle{animation:ttc-draw .38s ease-out forwards}',
  '@keyframes ttc-draw{from{stroke-dashoffset:var(--len)}to{stroke-dashoffset:0}}',
  '.ttc-cell.ttc-win{background:var(--ttc-win);border-color:rgba(233,196,106,.9)}',
  '.ttc-box.ttc-has-win .ttc-cell:not(.ttc-win) .ttc-mark{opacity:.3}',
  '.ttc-status{margin-top:11px;min-height:18px;text-align:center;font-size:13px;color:var(--ttc-dim)}',
  '.ttc-status.ttc-ok{color:var(--ttc-ok);font-weight:700}',
  '.ttc-status.ttc-bad{color:var(--ttc-bad);font-weight:700}',
  '.ttc-retry{display:none;margin:10px auto 0;padding:7px 16px;border:1px solid var(--ttc-border);',
  'border-radius:9px;background:transparent;color:inherit;font-size:13px;font-family:inherit;cursor:pointer}',
  '.ttc-retry:hover{background:var(--ttc-cell)}',
  '.ttc-box[data-state="fail"] .ttc-retry{display:block}',
  /* ---- 弹窗模式：触发按钮 + 模态框 ---- */
  '.ttc-trigger{display:flex;align-items:center;gap:10px;width:100%;padding:11px 14px;',
  'border:1px solid var(--ttc-border);border-radius:10px;background:var(--ttc-cell);color:var(--ttc-text);',
  'font-family:inherit;font-size:14px;cursor:pointer;transition:border-color .15s,background .15s}',
  '.ttc-trigger:hover{background:var(--ttc-cell-hover)}',
  '.ttc-trigger.ttc-verified{border-color:var(--ttc-ok);background:rgba(22,163,74,.08)}',
  '.ttc-trigger.ttc-verified .ttc-trigger-text{color:var(--ttc-ok);font-weight:600}',
  '.ttc-trigger-icon{font-size:16px;line-height:1}',
  '.ttc-modal{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;',
  'padding:16px;background:rgba(15,20,32,.55);backdrop-filter:blur(4px);opacity:0;pointer-events:none;',
  'transition:opacity .2s}',
  '.ttc-modal.ttc-open{opacity:1;pointer-events:auto}',
  '.ttc-dialog{position:relative;max-width:min(92vw,352px);transform:translateY(10px) scale(.97);',
  'transition:transform .25s cubic-bezier(.34,1.4,.64,1)}',
  '.ttc-modal.ttc-open .ttc-dialog{transform:none}',
  '.ttc-close{position:absolute;top:-13px;right:-13px;z-index:1;width:30px;height:30px;border:0;',
  'border-radius:50%;background:var(--ttc-surface);color:var(--ttc-text);font-size:13px;cursor:pointer;',
  'box-shadow:0 4px 14px rgba(0,0,0,.25)}',
].join('');

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  var style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  (document.head || document.documentElement).appendChild(style);
}

function createCaptcha(container, opts) {
  opts = opts || {};
  injectStyle();

  var AI = 'O';
  var timer = null;
  var popup = !!opts.popup;

  /* ---- 构建 DOM（全部持有引用，不依赖查询） ---- */
  var root = document.createElement('div');
  root.className = 'ttc-root';
  container.appendChild(root);

  var boxEl = document.createElement('div');
  boxEl.className = 'ttc-box';

  var headEl = document.createElement('div');
  headEl.className = 'ttc-head';
  var titleEl = document.createElement('span');
  titleEl.className = 'ttc-title';
  titleEl.textContent = '🤖 人机验证';
  var refreshBtn = document.createElement('button');
  refreshBtn.type = 'button';
  refreshBtn.className = 'ttc-refresh';
  refreshBtn.title = '换一局';
  refreshBtn.textContent = '↻';
  headEl.appendChild(titleEl);
  headEl.appendChild(refreshBtn);

  var tipEl = document.createElement('p');
  tipEl.className = 'ttc-tip';
  tipEl.textContent = '赢下电脑或达成平局，即验证通过';

  var boardEl = document.createElement('div');
  boardEl.className = 'ttc-board';

  var statusEl = document.createElement('div');
  statusEl.className = 'ttc-status';

  var retryBtn = document.createElement('button');
  retryBtn.type = 'button';
  retryBtn.className = 'ttc-retry';
  retryBtn.textContent = '再试一次';

  boxEl.appendChild(headEl);
  boxEl.appendChild(tipEl);
  boxEl.appendChild(boardEl);
  boxEl.appendChild(statusEl);
  boxEl.appendChild(retryBtn);

  /* ---- 棋局状态 ---- */
  var board, current, gameOver, state = 'playing';

  var cells = [];
  for (var i = 0; i < 9; i++) {
    (function (idx) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ttc-cell';
      btn.setAttribute('aria-label', '第 ' + (idx + 1) + ' 格');
      btn.innerHTML =
        '<svg class="ttc-mark ttc-mark-x" viewBox="0 0 100 100" aria-hidden="true">' +
        '<line x1="28" y1="28" x2="72" y2="72"/><line x1="72" y1="28" x2="28" y2="72"/></svg>' +
        '<svg class="ttc-mark ttc-mark-o" viewBox="0 0 100 100" aria-hidden="true">' +
        '<circle cx="50" cy="50" r="24"/></svg>';
      btn.addEventListener('click', function () {
        if (boxEl.classList.contains('ttc-idle')) return;
        place(idx);
      });
      boardEl.appendChild(btn);
      cells.push(btn);
    })(i);
  }

  /* ---- 规则 ---- */
  function getWinner(b) {
    for (var k = 0; k < WIN_LINES.length; k++) {
      var line = WIN_LINES[k];
      if (b[line[0]] && b[line[0]] === b[line[1]] && b[line[0]] === b[line[2]]) {
        return { winner: b[line[0]], line: line };
      }
    }
    if (b.every(function (v) { return v; })) return { winner: null, line: null };
    return null;
  }

  // 找出让 mark 立即连成三子的空格；没有则返回 -1
  function findLineMove(b, mark) {
    for (var k = 0; k < WIN_LINES.length; k++) {
      var line = WIN_LINES[k];
      var vals = [b[line[0]], b[line[1]], b[line[2]]];
      var emptyIdx = vals.indexOf('');
      if (vals.filter(function (v) { return v === mark; }).length === 2 && emptyIdx !== -1) {
        return line[emptyIdx];
      }
    }
    return -1;
  }

  function randomMove(b) {
    var empty = b.map(function (v, i) { return v ? -1 : i; }).filter(function (i) { return i >= 0; });
    return empty[Math.floor(Math.random() * empty.length)];
  }

  // 简单电脑：能赢就赢，一半概率堵住玩家威胁，其余随机
  function easyMove(b) {
    var win = findLineMove(b, AI);
    if (win !== -1) return win;
    if (Math.random() < 0.5) {
      var block = findLineMove(b, 'X');
      if (block !== -1) return block;
    }
    return randomMove(b);
  }

  /* ---- 弹窗模式：触发按钮 + 模态框 ---- */
  var trigger = null, triggerIcon = null, triggerText = null, overlay = null;

  function open() { if (overlay) overlay.classList.add('ttc-open'); }
  function close() { if (overlay) overlay.classList.remove('ttc-open'); }

  function syncTrigger() {
    if (!trigger) return;
    var ok = state === 'success';
    trigger.classList.toggle('ttc-verified', ok);
    triggerIcon.textContent = ok ? '✅' : '🤖';
    triggerText.textContent = ok ? '验证通过' : '点击进行人机验证';
  }

  if (popup) {
    trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'ttc-trigger';
    triggerIcon = document.createElement('span');
    triggerIcon.className = 'ttc-trigger-icon';
    triggerIcon.textContent = '🤖';
    triggerText = document.createElement('span');
    triggerText.className = 'ttc-trigger-text';
    triggerText.textContent = '点击进行人机验证';
    trigger.appendChild(triggerIcon);
    trigger.appendChild(triggerText);
    trigger.addEventListener('click', open);

    overlay = document.createElement('div');
    overlay.className = 'ttc-modal';
    var dialog = document.createElement('div');
    dialog.className = 'ttc-dialog';
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'ttc-close';
    closeBtn.setAttribute('aria-label', '关闭');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

    dialog.appendChild(closeBtn);
    dialog.appendChild(boxEl);
    overlay.appendChild(dialog);
    root.appendChild(trigger);
    root.appendChild(overlay);
  } else {
    root.appendChild(boxEl);
  }

  /* ---- 流程 ---- */
  function setStatus(text, cls) {
    statusEl.textContent = text;
    statusEl.className = 'ttc-status' + (cls ? ' ' + cls : '');
  }

  function reset() {
    clearTimeout(timer);
    board = Array(9).fill('');
    current = 'X';
    gameOver = false;
    state = 'playing';
    boxEl.dataset.state = 'playing';
    boxEl.classList.remove('ttc-idle', 'ttc-has-win');
    cells.forEach(function (c) {
      delete c.dataset.mark;
      c.classList.remove('ttc-win');
    });
    setStatus('轮到你落子（X）');
    syncTrigger();
    if (opts.onReset) opts.onReset();
  }

  function place(i) {
    if (gameOver || board[i]) return;
    board[i] = current;
    cells[i].dataset.mark = current;
    var r = getWinner(board);
    if (r) { finish(r); return; }
    current = AI;
    aiTurn();
  }

  function aiTurn() {
    boxEl.classList.add('ttc-idle');
    setStatus('电脑思考中…');
    timer = setTimeout(function () {
      var m = easyMove(board);
      board[m] = AI;
      cells[m].dataset.mark = AI;
      boxEl.classList.remove('ttc-idle');
      var r = getWinner(board);
      if (r) { finish(r); return; }
      current = 'X';
      setStatus('轮到你落子（X）');
    }, 420);
  }

  function finish(r) {
    gameOver = true;
    boxEl.classList.add('ttc-idle');
    if (r.winner) {
      r.line.forEach(function (i) { cells[i].classList.add('ttc-win'); });
      boxEl.classList.add('ttc-has-win');
    }
    if (r.winner === AI) {
      state = 'fail';
      boxEl.dataset.state = 'fail';
      setStatus('❌ 电脑获胜 — 验证失败');
    } else {
      state = 'success';
      boxEl.dataset.state = 'success';
      setStatus(r.winner ? '🎉 你赢了 — 验证通过' : '🤝 平局 — 验证通过', 'ttc-ok');
    }
    syncTrigger();
    // 弹窗模式下：通过后停留片刻自动关闭；失败则保留弹窗供重试
    if (popup && state === 'success') setTimeout(close, 700);
    if (opts.onVerified) opts.onVerified(state === 'success');
  }

  refreshBtn.addEventListener('click', reset);
  retryBtn.addEventListener('click', reset);

  reset();

  var api = {
    reset: reset,
    getState: function () { return state; },
    destroy: function () { clearTimeout(timer); },
  };
  if (popup) { api.open = open; api.close = close; }
  return api;
}



exports.createCaptcha = createCaptcha;
exports.create = createCaptcha;
Object.defineProperty(exports, '__esModule', { value: true });
});