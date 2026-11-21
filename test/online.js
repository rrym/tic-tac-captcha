#!/usr/bin/env node
/**
 * online-core 状态机测试：两个 session 交叉连线（A.send → B.onRemoteMsg），
 * 模拟真实双端：正常对局、作弊输入、乱序消息、再来一局、平局。
 * 运行：node test/online.js
 */
'use strict';

const { TTTOnline } = require('../examples/online-core.js');

let failed = 0;
const check = (cond, msg) => { console.log((cond ? 'PASS' : 'FAIL') + ' - ' + msg); if (!cond) failed++; };

// 交叉连线：A 的消息直达 B，B 的直达 A
function pair() {
  let A, B;
  A = TTTOnline.createSession({ isHost: true, send: m => B.onRemoteMsg(m) });
  B = TTTOnline.createSession({ isHost: false, send: m => A.onRemoteMsg(m) });
  return [A, B];
}

/* ---------- 房间码 ---------- */
{
  const set = new Set();
  let ok = true;
  for (let i = 0; i < 100; i++) {
    const c = TTTOnline.randomRoomCode(4);
    if (!/^[A-Z2-9]{4}$/.test(c) || /[ILO01]/.test(c)) ok = false;
    set.add(c);
  }
  check(ok, '房间码：4 位、字符集排除 I L O 0 1');
  check(set.size > 90, '房间码：随机性充足（100 次生成 ' + set.size + ' 个不同值）');
}

/* ---------- 正常对局：房主 X 三连获胜 ---------- */
{
  const [A, B] = pair();
  check(A.getState().myMark === 'X' && A.getState().myTurn, '初始：房主执 X 且先手');
  check(B.getState().myMark === 'O' && !B.getState().myTurn, '初始：客方执 O 等待');

  const seq = [[A, 0], [B, 3], [A, 1], [B, 4], [A, 2]];
  let allAccepted = true;
  seq.forEach(([s, i]) => { if (!s.onLocalMove(i)) allAccepted = false; });
  check(allAccepted, '合法落子全部被接受');

  const a = A.getState(), b = B.getState();
  check(a.over && a.winner === 'X' && a.line.join('') === '012', '房主端判胜：X 三连 0-1-2');
  check(b.over && b.winner === 'X', '客方端同步判胜（无权威端，双方一致）');
  check(JSON.stringify(a.board) === JSON.stringify(b.board), '双端棋盘完全一致');
}

/* ---------- 非法输入防御 ---------- */
{
  const [A, B] = pair();

  check(B.onLocalMove(4) === false, '未轮到时本方落子被拒绝（客方抢先点）');
  A.onRemoteMsg({ type: 'move', i: 4 });           // 冒充：现在是 A 的回合
  check(A.getState().board[4] === undefined || A.getState().board[4] === '', '对方乱序消息（本应轮到我）被丢弃');

  A.onLocalMove(0);
  B.onRemoteMsg({ type: 'move', i: 0 });           // 占用格
  A.onRemoteMsg({ type: 'move', i: 9 });           // 越界
  A.onRemoteMsg({ type: 'move', i: 'x' });         // 类型错误
  A.onRemoteMsg(null);                              // 空消息
  const marks = A.getState().board.filter(v => v).length;
  check(marks === 1, '占用格/越界/非法类型/空消息全部被丢弃');

  // 伪造一整局结束后仍能对齐：A 直接发 8 个 move 也不会让状态错乱
  for (let i = 1; i < 9; i++) A.onRemoteMsg({ type: 'move', i });
  check(!A.getState().over, '乱序轰炸后游戏未进入假终局');
}

/* ---------- 再来一局：换先手 + 重复消息幂等 ---------- */
{
  const [A, B] = pair();
  [[A, 0], [B, 3], [A, 1], [B, 4], [A, 2]].forEach(([s, i]) => s.onLocalMove(i));
  check(A.getState().over, '第一局结束（房主 X 胜）');

  A.rematch();
  let a = A.getState(), b = B.getState();
  check(a.round === 1 && b.round === 1 && !a.over, '双方均进入第 2 局');
  check(a.myMark === 'O' && b.myMark === 'X', '换先手：房主转执 O，客方执 X');
  check(!a.myTurn && b.myTurn, '第 2 局由客方（X）先手');

  // 双方几乎同时点「再来一局」：第二条重复消息不得再次轮换
  A.onRemoteMsg({ type: 'rematch', round: 0 });    // 迟到的重复重开请求
  check(A.getState().round === 1, '重复的 rematch 消息被忽略（局号不匹配）');

  // 第二局客方获胜
  [[B, 0], [A, 3], [B, 1], [A, 4], [B, 2]].forEach(([s, i]) => s.onLocalMove(i));
  check(B.getState().over && B.getState().winner === 'X', '第二局客方 X 获胜');
  B.rematch();
  check(A.getState().round === 2 && A.getState().myMark === 'X', '第三局换回房主执 X');
}

/* ---------- 平局 ---------- */
{
  const [A, B] = pair();
  // 房主 X={4,2,3,7,8}，客方 O={0,1,5,6}，顺序无中途成线
  [[A, 4], [B, 0], [A, 2], [B, 1], [A, 3], [B, 5], [A, 7], [B, 6], [A, 8]]
    .forEach(([s, i]) => s.onLocalMove(i));
  const a = A.getState();
  check(a.over && a.winner === null, '下满 9 格判平局');
  check(a.board.every(v => v), '平局时棋盘全满');
  check(JSON.stringify(a.board) === JSON.stringify(B.getState().board), '平局双端棋盘一致');
}

console.log(failed === 0 ? '\n全部通过 ✅' : `\n${failed} 项失败 ❌`);
process.exit(failed === 0 ? 0 : 1);
