/**
 * online-core.js — 在线对战对局状态机（与 UI、网络层解耦，可独立测试）
 *
 * 房主与加入方各持一个 session，通过 send() / onRemoteMsg() 互发消息：
 *   {type:'move', i}         落子（i: 0-8）
 *   {type:'rematch', round}  再来一局（携带当前局号，防止双方同时点击导致双重轮换）
 *
 * 双方按同一规则独立推进状态，无需“权威端”：
 *   - round 偶数 → 房主执 X；奇数 → 房主执 O（每局轮换先手）
 *   - X 恒先手；轮到谁由已落子数决定
 *   - 收到对方消息时做合法性校验（乱序/占用/越界/已结束一律丢弃）
 */
(function (global) {
  'use strict';

  var WIN_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];

  // 房间码字母表：去掉易混淆的 I L O 0 1
  var CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  function getWinner(b) {
    for (var k = 0; k < WIN_LINES.length; k++) {
      var l = WIN_LINES[k];
      if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) {
        return { winner: b[l[0]], line: l.slice() };
      }
    }
    for (var i = 0, n = 0; i < 9; i++) if (b[i]) n++;
    return n === 9 ? { winner: null, line: null } : null;
  }

  function randomRoomCode(len) {
    len = len || 4;
    var s = '';
    for (var i = 0; i < len; i++) {
      s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    return s;
  }

  function createSession(opts) {
    opts = opts || {};
    var isHost = !!opts.isHost;
    var send = opts.send || function () {};
    var onEvent = opts.onEvent || function () {};

    var board = Array(9).fill('');
    var round = 0;                 // 第几局（从 0 计）
    var over = false, winner = null, winLine = null;

    function myMark() { return ((round % 2 === 0) === isHost) ? 'X' : 'O'; }
    function oppMark() { return myMark() === 'X' ? 'O' : 'X'; }
    function turnMark() {
      var n = 0;
      for (var i = 0; i < 9; i++) if (board[i]) n++;
      return n % 2 === 0 ? 'X' : 'O';
    }
    function myTurn() { return !over && turnMark() === myMark(); }

    function snapshot() {
      return {
        board: board.slice(), round: round, over: over,
        winner: winner, line: winLine ? winLine.slice() : null,
        myMark: myMark(), myTurn: myTurn(),
      };
    }
    function emitState() { onEvent({ type: 'state', state: snapshot() }); }

    function finishCheck() {
      var r = getWinner(board);
      if (!r) return;
      over = true;
      winner = r.winner;
      winLine = r.line;
      onEvent({
        type: 'result', winner: r.winner, line: r.line,
        iWon: r.winner === myMark(), draw: r.winner === null,
      });
    }

    function applyMove(i, mark) {
      board[i] = mark;
      emitState();
      finishCheck();
    }

    // 本方点击落子；未轮到 / 已占用 / 已结束时返回 false 不发送
    function onLocalMove(i) {
      if (!myTurn() || board[i]) return false;
      send({ type: 'move', i: i });
      applyMove(i, myMark());
      return true;
    }

    // 收到对方消息：所有非法输入静默丢弃，双方状态永不错乱
    function onRemoteMsg(msg) {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'move') {
        if (over) return;
        if (typeof msg.i !== 'number' || msg.i < 0 || msg.i > 8) return;
        if (board[msg.i]) return;
        if (turnMark() !== oppMark()) return;   // 现在应是本方行动 → 乱序消息，丢弃
        applyMove(msg.i, oppMark());
      } else if (msg.type === 'rematch') {
        // 只接受“针对刚结束这局”的重开请求（局号匹配），重复消息自然失效
        if (over && msg.round === round) doRematch(false);
      }
    }

    function doRematch(alsoSend) {
      if (!over) return;
      if (alsoSend) send({ type: 'rematch', round: round });
      round++;
      board = Array(9).fill('');
      over = false; winner = null; winLine = null;
      emitState();
    }

    emitState(); // 初始状态

    return {
      onLocalMove: onLocalMove,
      onRemoteMsg: onRemoteMsg,
      rematch: function () { doRematch(true); },
      getState: snapshot,
    };
  }

  global.TTTOnline = {
    createSession: createSession,
    randomRoomCode: randomRoomCode,
    getWinner: getWinner,
    WIN_LINES: WIN_LINES,
    CODE_CHARS: CODE_CHARS,
  };
})(typeof window !== 'undefined' ? window : this);
