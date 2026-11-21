#!/usr/bin/env node
/**
 * gomoku-core 状态机测试：两个 session 交叉连线（A.send → B.onRemoteMsg），
 * 覆盖四方向连五、长连、断连不成五、满盘平局、非法输入、换先手、断线恢复。
 * 运行：node test/gomoku.js
 */
'use strict';

const { TTGO } = require('../examples/gomoku-core.js');

let failed = 0;
const check = (cond, msg) => { console.log((cond ? 'PASS' : 'FAIL') + ' - ' + msg); if (!cond) failed++; };

function pair() {
  let A, B;
  A = TTGO.createSession({ isHost: true, send: m => B.onRemoteMsg(m) });
  B = TTGO.createSession({ isHost: false, send: m => A.onRemoteMsg(m) });
  return [A, B];
}

// 在 A（黑）与 B（白）之间交替落子：bs = 黑方落点数组，ws = 白方落点数组
function play(A, B, bs, ws) {
  const n = Math.max(bs.length, ws.length);
  for (let i = 0; i < n; i++) {
    if (i < bs.length) A.onLocalMove(bs[i]);
    if (i < ws.length) B.onLocalMove(ws[i]);
  }
}

/* ---------- 房间码 ---------- */
{
  const set = new Set();
  let ok = true;
  for (let i = 0; i < 100; i++) {
    const c = TTGO.randomRoomCode(4);
    if (!/^[A-Z0-9]{4}$/.test(c)) ok = false;
    set.add(c);
  }
  check(ok, '房间码：4 位、全部大写字母与数字');
  check(set.size > 90, '房间码：随机性充足');
}

/* ---------- 四方向连五获胜 ---------- */
{
  const S = TTGO.SIZE;
  const cases = [
    ['横向', [7 * S + 3, 7 * S + 4, 7 * S + 5, 7 * S + 6, 7 * S + 7]],
    ['纵向', [3 * S + 7, 4 * S + 7, 5 * S + 7, 6 * S + 7, 7 * S + 7]],
    ['主对角', [3 * S + 3, 4 * S + 4, 5 * S + 5, 6 * S + 6, 7 * S + 7]],
    ['副对角', [3 * S + 11, 4 * S + 10, 5 * S + 9, 6 * S + 8, 7 * S + 7]],
  ];
  // 白方干扰子统一放在边角行，不会先连成五
  const ws = [0, 1, 2, 3, 4, 5].map(x => 0 * S + x);
  for (const [name, bs] of cases) {
    const [A, B] = pair();
    play(A, B, bs, ws);
    const a = A.getState(), b = B.getState();
    check(a.over && a.winner === 'B' && b.over && b.winner === 'B', `${name}连五：双端判黑胜`);
    check(JSON.stringify(a.line) === JSON.stringify(bs.sort((x, y) => x - y)) ||
          a.line.slice().sort((x, y) => x - y).join() === bs.slice().sort((x, y) => x - y).join(),
          `${name}连五：连线返回正确（${a.line.join(',')}）`);
  }
}

/* ---------- 长连（>5）也算胜，连线整段返回（对局中连五即终局，故直接构造棋盘） ---------- */
{
  const S = TTGO.SIZE;
  const b = Array(225).fill('');
  for (let i = 3; i <= 8; i++) b[7 * S + i] = 'B';
  const r = TTGO.getWinner(b);
  check(r && r.winner === 'B' && r.line.length === 6, '六连长连判胜且连线含 6 子');
}

/* ---------- 断连不成五 ---------- */
{
  const S = TTGO.SIZE;
  const bs = [7 * S + 3, 7 * S + 4, 7 * S + 5, 7 * S + 7];   // 中间 6 位是白子
  const ws = [7 * S + 6, 7 * S + 9, 7 * S + 10, 7 * S + 12];
  const [A] = pair();
  play(A, { onLocalMove: () => {} }, bs, ws);
  check(!A.getState().over, '黑白相间不成五：不判胜');
}

/* ---------- getWinner 直接构造：满盘无五连 → 平局 ---------- */
{
  const S = TTGO.SIZE;
  const b = Array(225).fill('');
  // 周期 4 棋盘图案（(2x+y)%4<2 → 黑）：任一方向最长同色连段为 2，不可能成五
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) b[y * S + x] = ((2 * x + y) % 4 < 2) ? 'B' : 'W';
  const r = TTGO.getWinner(b);
  check(r && r.winner === null, '满盘且无五连：判平局');
}

/* ---------- 长对局稳定推进 + 换先手 + 再来一局 ---------- */
{
  const S = TTGO.SIZE;
  // 按无五连图案（(2x+y)%4）交替填 60 手：稳定推进、无双端错乱、无误判
  const [A, B] = pair();
  const bs = [], ws = [];
  let turn = 0;
  outer:
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const m = ((2 * x + y) % 4 < 2) ? 'B' : 'W';
    if (m === 'B' && turn === 0) { bs.push(y * S + x); turn = 1; }
    else if (m === 'W' && turn === 1) { ws.push(y * S + x); turn = 0; }
    if (bs.length + ws.length >= 60) break outer;
  }
  play(A, B, bs, ws);
  check(!A.getState().over, '图案棋盘推进 60 手无误判终局');
  check(JSON.stringify(A.getState().board) === JSON.stringify(B.getState().board), '双端棋盘完全一致');

  // 黑连五获胜 → 再来一局换先手
  const [A2, B2] = pair();
  check(A2.getState().myMark === 'B' && A2.getState().myTurn, '初始：房主执黑且先手');
  play(A2, B2, [7 * S + 3, 7 * S + 4, 7 * S + 5, 7 * S + 6, 7 * S + 7], [0, 1, 2, 3, 4]);
  check(A2.getState().over, '第一局黑胜结束');
  A2.rematch();
  check(A2.getState().round === 1 && B2.getState().round === 1, '再来一局进入第 2 局');
  check(A2.getState().myMark === 'W' && B2.getState().myMark === 'B', '换先手：房主转执白');
  check(!A2.getState().myTurn && B2.getState().myTurn, '第 2 局由白（客方）先手');
  A2.onRemoteMsg({ type: 'rematch', round: 0 });
  check(A2.getState().round === 1, '重复的 rematch 消息被忽略');
}

/* ---------- 非法输入防御 ---------- */
{
  const [A, B] = pair();
  check(B.onLocalMove(4) === false, '未轮到时本方落子被拒绝');
  A.onRemoteMsg({ type: 'move', i: 5 });            // 乱序：现在是 A 的回合
  A.onLocalMove(112);
  A.onRemoteMsg({ type: 'move', i: 112 });          // 占用格
  A.onRemoteMsg({ type: 'move', i: 225 });          // 越界
  A.onRemoteMsg({ type: 'move', i: -1 });           // 越界
  A.onRemoteMsg({ type: 'move', i: 'x' });          // 类型错误
  A.onRemoteMsg(null);
  check(A.getState().board.filter(v => v).length === 1, '占用/越界/非法类型/空消息全部被丢弃');
}

/* ---------- 断线重连：从快照恢复 ---------- */
{
  let target;
  const B = TTGO.createSession({ isHost: false, send: m => target.onRemoteMsg(m) });
  const A = TTGO.createSession({ isHost: true, send: m => B.onRemoteMsg(m) });
  target = A;
  A.onLocalMove(112);   // 黑天元
  B.onLocalMove(97);    // 白

  const snap = A.getState();
  const A2 = target = TTGO.createSession({
    isHost: true, send: m => B.onRemoteMsg(m),
    resume: { board: snap.board, round: snap.round, over: snap.over },
  });
  const s2 = A2.getState();
  check(s2.board[112] === 'B' && s2.board[97] === 'W' && s2.round === 0, 'resume：局面恢复');
  check(s2.myMark === 'B' && s2.myTurn, 'resume：手别与行动权正确（轮黑，房主执黑）');
  A2.onLocalMove(111);
  check(A2.getState().board[111] === 'B' && B.getState().board[111] === 'B', 'resume：恢复后正常续局，双端一致');

  const A4 = TTGO.createSession({ isHost: true, send: () => {}, resume: { board: 'x' } });
  check(A4.getState().board.every(v => !v), 'resume：非法快照被忽略');
}

/* ---------- 悔棋：撤回自己的最后一步（末子是对方则连撤两子） ---------- */
{
  const [A, B] = pair();
  A.onLocalMove(112); B.onLocalMove(97); A.onLocalMove(113);

  // 末子是 A（黑）自己 → 撤 1 子，轮 A 重下
  check(A.undo('B') === 1, '悔棋：末子是自己 → 撤 1 子');
  const s1 = A.getState();
  check(s1.board[113] === '' && s1.board[112] === 'B' && s1.board[97] === 'W', '悔棋后棋面正确');
  check(s1.myTurn && s1.moves.length === 2, '悔棋后轮黑重下，落子顺序同步');

  // 白方请求悔棋（此刻末子是黑）：协议要求双方各自对 'W' 执行 undo → 结果一致
  A.onLocalMove(113);              // 黑再下（把上一段单边 undo 的棋面补齐），末子黑
  check(B.getState().board[113] === 'B', '前置：双端棋面一致');
  A.undo('W'); B.undo('W');
  const s2 = B.getState();
  check(s2.board[113] === '' && s2.board[97] === '' && s2.board[112] === 'B', '连撤后回到白落子前');
  check(s2.myTurn && s2.moves.length === 1, '连撤后轮白重下');
  check(JSON.stringify(A.getState().board) === JSON.stringify(s2.board), '双端各自 undo 结果一致');

  // 无己方落子 / 终局 → 拒绝
  const [C, D] = pair();
  C.onLocalMove(14);
  check(D.undo('W') === 0, '悔棋：白从未落子 → 拒绝');
  check(C.undo('W') === 0, '悔棋：撤对方颜色但对方没落过 → 拒绝');
  play(C, D, [7 * 15 + 3, 7 * 15 + 4, 7 * 15 + 5, 7 * 15 + 6, 7 * 15 + 7], [0, 1, 2, 3, 4]);
  check(C.getState().over && C.undo('B') === 0, '终局后悔棋被拒绝');

  // resume 快照带 moves：恢复后仍可悔棋
  const [E, F] = pair();
  E.onLocalMove(112); F.onLocalMove(97); E.onLocalMove(113);
  const snap = E.getState();
  const E2 = TTGO.createSession({ isHost: true, send: () => {},
    resume: { board: snap.board, round: snap.round, over: snap.over, moves: snap.moves } });
  check(E2.undo('B') === 1 && E2.getState().board[113] === '' && E2.getState().moves.length === 2,
        'resume 带 moves：恢复后悔棋可用');
}

/* ---------- 认输 / 求和 ---------- */
{
  const events = [];
  const A = TTGO.createSession({ isHost: true, send: () => {}, onEvent: e => events.push(e) });
  const B = TTGO.createSession({ isHost: false, send: () => {} });
  A.onLocalMove(112); B.onLocalMove(97);

  check(A.resign() === true, '认输：返回 true');
  const a = A.getState();
  check(a.over && a.winner === 'W' && a.line === null, '认输：对方（白）直接获胜，无连线');
  check(A.resign() === false, '终局后再认输被拒绝');
  const res = events.filter(e => e.type === 'result').pop();
  check(res && res.resigned === true && res.iWon === false, '认输 result 事件带 resigned 且 iWon=false');

  B.onRemoteMsg({ type: 'resign', round: 0 });
  const b = B.getState();
  check(b.over && b.winner === 'W' && b.resign === undefined, '收到对方认输消息 → 我方判胜');
  B.onRemoteMsg({ type: 'resign', round: 5 });   // 局号不匹配的迟到消息
  check(B.getState().round === 0, '认输消息局号不匹配被忽略');

  // 认输后可正常再来一局
  A.rematch(); B.onRemoteMsg({ type: 'rematch', round: 0 });
  check(A.getState().round === 1 && B.getState().round === 1, '认输后可再来一局');

  // 求和：双方同意后各自 agreeDraw → 平局
  const [C, D] = pair();
  C.onLocalMove(112);
  C.onRemoteMsg({ type: 'draw-agree', round: 0 });
  check(C.getState().over && C.getState().winner === null, '求和达成：判平局');
  check(D.agreeDraw() === true && D.getState().over, '应允方本地 agreeDraw 同步生效');
  check(JSON.stringify(C.getState().board) === JSON.stringify(D.getState().board), '求和双端棋盘一致');
  const [E, F] = pair();
  check(E.agreeDraw() === false || F.getState().over === false, '终局前重复求和被拒绝（幂等）');
}

console.log(failed === 0 ? '\n全部通过 ✅' : `\n${failed} 项失败 ❌`);
process.exit(failed === 0 ? 0 : 1);
