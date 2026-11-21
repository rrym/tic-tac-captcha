#!/usr/bin/env node
/**
 * tic-tac-captcha 行为测试
 * 零依赖：内置极简 DOM 模拟 + 可控 Math.random，精确导演每一局。
 * 运行：npm test（或 node test/run.js）
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const umdSrc = fs.readFileSync(path.join(root, 'dist/tic-tac-captcha.umd.js'), 'utf8');
const loginSrc = fs.readFileSync(path.join(root, 'examples/login.html'), 'utf8')
  .match(/<script>([\s\S]*?)<\/script>/)[1];
const realRandom = Math.random;

// ---- 加载 UMD 构建产物（同 CJS 分支） ----
function loadUmd() {
  const module = { exports: {} };
  new Function('module', 'exports', umdSrc)(module, module.exports);
  return module.exports;
}
const lib = loadUmd();

// ---- 极简 DOM 模拟 ----
function makeEl(id) {
  const set = new Set();
  const el = {
    id, handlers: {}, dataset: {}, attrs: {}, value: '',
    className: '', textContent: '', _html: '',
    classList: {
      add: (...c) => c.forEach(x => set.add(x)),
      remove: (...c) => c.forEach(x => set.delete(x)),
      toggle: (c, f) => { const on = f === undefined ? !set.has(c) : f; on ? set.add(c) : set.delete(c); },
      contains: c => set.has(c),
    },
    appendChild(c) { return c; },
    addEventListener(t, fn) { (el.handlers[t] ||= []).push(fn); },
    setAttribute(k, v) { el.attrs[k] = v; },
    focus() {},
    click() { (el.handlers.click || []).forEach(fn => fn()); },
  };
  Object.defineProperty(el, 'innerHTML', { get: () => el._html, set: v => { el._html = v; } });
  return el;
}

function baseDoc(created, tabBtns, byId) {
  return {
    getElementById: id => (byId ? byId[id] : undefined),
    createElement: () => { const el = makeEl(); created.push(el); return el; },
    head: makeEl('head'),
    querySelectorAll: sel => (sel === '.tab' ? tabBtns : []),
    querySelector: () => tabBtns.find(b => b.classList.contains('active')),
    addEventListener() {},
  };
}

let failed = 0;
const check = (cond, msg) => { console.log((cond ? 'PASS' : 'FAIL') + ' - ' + msg); if (!cond) failed++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const steerRandom = q => { let qi = 0; Math.random = () => (qi < q.length ? q[qi++] : 0.999); };

global.window = global;

// ---- 组件单测世界（内嵌模式） ----
function widgetWorld() {
  const created = [];
  global.document = baseDoc(created, []);
  const container = makeEl('cap');
  let verified = null, resetCount = 0;
  const api = lib.createCaptcha(container, {
    onVerified: p => { verified = p; },
    onReset: () => { resetCount++; },
  });
  return {
    api, container, cells: created.filter(e => e.className === 'ttc-cell'),
    get verified() { return verified; }, get resetCount() { return resetCount; },
  };
}

// ---- 弹窗模式世界 ----
function popupWorld() {
  const created = [];
  global.document = baseDoc(created, []);
  const container = makeEl('cap');
  let verified = null;
  const api = lib.createCaptcha(container, {
    popup: true,
    onVerified: p => { verified = p; },
    onReset: () => {},
  });
  return {
    api, get verified() { return verified; },
    cells: created.filter(e => e.className === 'ttc-cell'),
    trigger: created.find(e => e.className === 'ttc-trigger'),
    overlay: created.find(e => e.className === 'ttc-modal'),
  };
}

// ---- 登录页世界 ----
function loginWorld() {
  const byId = {};
  ['msg', 'captcha', 'authForm', 'username', 'password', 'confirm', 'confirmRow', 'submitBtn']
    .forEach(id => byId[id] = makeEl(id));
  const tabBtns = ['login', 'register'].map(t => { const b = makeEl(); b.dataset.tab = t; return b; });
  tabBtns[0].classList.add('active');
  const created = [];
  global.document = baseDoc(created, tabBtns, byId);
  global.TicTacCaptcha = lib;   // UMD 全局名，login.html 以此接入
  const origCreate = lib.createCaptcha;
  let capOpts = null, capApi = null;
  global.TicTacCaptcha = {
    create: (el, o) => { capOpts = o; capApi = origCreate(el, o); return capApi; },
  };
  eval(loginSrc);
  const submit = () => (byId.authForm.handlers.submit || []).forEach(fn => fn({ preventDefault() {} }));
  return { byId, tabBtns, submit, created, get capOpts() { return capOpts; }, get capApi() { return capApi; } };
}

(async () => {
  // ============ 组件：电脑赢 → 验证失败 ============
  Math.random = realRandom;
  let w = widgetWorld();
  steerRandom([0.9, 0.3, 0.9, 0.9]);        // 电脑不防守、随机走 2 和 8 → 2-5-8 成三
  w.cells[4].click(); await wait(550);
  w.cells[1].click(); await wait(550);
  w.cells[6].click(); await wait(550);
  check(w.cells[5].dataset.mark === 'O', '[失败路径] 电脑完成 2-5-8 三连（下在 5）');
  check(w.api.getState() === 'fail', '[失败路径] 状态为 fail');
  check(w.verified === false, '[失败路径] onVerified(false) 已回调');

  const rc = w.resetCount;
  w.api.reset();
  check(w.api.getState() === 'playing' && w.resetCount === rc + 1, 'reset() 后回到 playing 且触发 onReset');
  check(w.cells.every(c => !c.dataset.mark), 'reset() 后棋盘清空');

  // ============ 组件：平局 → 验证通过 ============
  Math.random = realRandom;
  w = widgetWorld();
  steerRandom([0.9, 0.02, 0.9, 0.02, 0.9, 0.02, 0.9, 0.02]); // 电脑依次走 0,1,5,6（始终无制胜点）
  w.cells[4].click(); await wait(550);
  w.cells[2].click(); await wait(550);
  w.cells[3].click(); await wait(550);
  w.cells[7].click(); await wait(550);
  w.cells[8].click(); await wait(550);   // 下满 → 平局
  check(w.api.getState() === 'success', '[平局路径] 状态为 success');
  check(w.verified === true, '[平局路径] onVerified(true) 已回调');

  // ============ 组件：玩家赢 → 验证通过 ============
  Math.random = realRandom;
  w = widgetWorld();
  steerRandom([0.9, 0.05, 0.9, 0.15]);      // 电脑漏防，玩家 0-3-6 三连
  w.cells[0].click(); await wait(550);
  w.cells[3].click(); await wait(550);
  w.cells[6].click(); await wait(550);
  check(w.cells[6].dataset.mark === 'X' && w.api.getState() === 'success', '[获胜路径] 玩家 0-3-6 三连，状态 success');
  check(w.verified === true, '[获胜路径] onVerified(true) 已回调');
  check(w.cells[0].classList.contains('ttc-win'), '[获胜路径] 连线格高亮');

  // ============ 组件：destroy() 清理定时器 ============
  Math.random = realRandom;
  w = widgetWorld();
  w.cells[0].click();      // 玩家落子 → 电脑 420ms 后应答
  w.api.destroy();         // 卸载前清理
  await wait(600);
  check(w.cells.filter(c => c.dataset.mark).length === 1, 'destroy() 后电脑定时器不再落子');
  check(w.api.getState() === 'playing', 'destroy() 不改变当前状态');

  // ============ 弹窗模式 ============
  Math.random = realRandom;
  let P = popupWorld();
  check(!!P.trigger && !!P.overlay, '[弹窗] 表单内是触发按钮，验证棋盘藏在弹窗里');
  check(!P.overlay.classList.contains('ttc-open'), '[弹窗] 初始不弹出');

  P.trigger.click();
  check(P.overlay.classList.contains('ttc-open'), '[弹窗] 点击触发按钮后弹出');

  steerRandom([0.9, 0.05, 0.9, 0.15]);       // 电脑漏防，玩家 0-3-6 三连
  P.cells[0].click(); await wait(550);
  P.cells[3].click(); await wait(550);
  P.cells[6].click();
  check(P.api.getState() === 'success' && P.verified === true, '[弹窗] 弹窗内获胜 → 验证通过');
  check(P.trigger.classList.contains('ttc-verified'), '[弹窗] 触发按钮变为「验证通过」');
  await wait(900);
  check(!P.overlay.classList.contains('ttc-open'), '[弹窗] 通过后自动关闭弹窗');

  P.api.reset();                              // 换一局 → 重新验证
  check(!P.trigger.classList.contains('ttc-verified'), '[弹窗] 重置后按钮恢复未验证状态');
  P.trigger.click();
  steerRandom([0.9, 0.3, 0.9, 0.9]);          // 电脑 2-5-8 反杀
  P.cells[4].click(); await wait(550);
  P.cells[1].click(); await wait(550);
  P.cells[6].click(); await wait(900);
  check(P.api.getState() === 'fail' && P.verified === false, '[弹窗] 弹窗内输给电脑 → 验证失败');
  check(P.overlay.classList.contains('ttc-open'), '[弹窗] 失败时弹窗保留，供点「再试一次」');
  check(!P.trigger.classList.contains('ttc-verified'), '[弹窗] 失败后触发按钮仍为未验证');
  P.api.close();
  check(!P.overlay.classList.contains('ttc-open'), '[弹窗] close() 可手动关闭');

  // ============ 登录页流程 ============
  Math.random = realRandom;
  const L = loginWorld();

  L.submit();
  check(L.byId.msg.textContent === '请输入用户名和密码', '[登录] 空字段被拦截');

  L.byId.username.value = 'bepo';
  L.byId.password.value = '123456';
  L.submit();
  check(L.byId.msg.textContent.includes('人机验证'), '[登录] 未通过验证时被拦截');
  check(L.byId.captcha.classList.contains('shake'), '[登录] 验证码框触发抖动提醒');
  const loginOverlay = L.created.find(e => e.className === 'ttc-modal');
  check(loginOverlay.classList.contains('ttc-open'), '[登录] 被拦截时自动弹出验证码窗口');

  L.capOpts.onVerified(true);
  L.submit();
  check(L.byId.msg.textContent.includes('登录成功'), '[登录] 验证通过后登录成功');

  L.capOpts.onVerified(false);               // 输给电脑 → 重新需要验证
  L.tabBtns[1].click();                      // 切到注册
  check(!L.byId.confirmRow.classList.contains('hidden') && L.byId.submitBtn.textContent === '注 册', '[注册] 切换标签后显示确认密码');

  L.byId.confirm.value = '654321';
  L.submit();
  check(L.byId.msg.textContent === '两次输入的密码不一致', '[注册] 密码不一致被拦截');

  L.byId.confirm.value = '123456';
  L.submit();
  check(L.byId.msg.textContent.includes('人机验证'), '[注册] 验证失败后需重新通过验证');

  L.capOpts.onVerified(true);
  L.submit();
  check(L.byId.msg.textContent.includes('注册成功'), '[注册] 验证通过后注册成功');

  L.capApi.reset();                          // 点 ↻ 换一局 → 已通过的验证作废
  L.submit();
  check(L.byId.msg.textContent.includes('人机验证'), '[重置] 换一局后需重新验证');

  Math.random = realRandom;
  console.log(failed === 0 ? '\n全部通过 ✅' : `\n${failed} 项失败 ❌`);
  process.exit(failed === 0 ? 0 : 1);
})();
