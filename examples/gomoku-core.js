/**
 * gomoku-core.js — 五子棋在线对战对局状态机（与 UI、网络层解耦，可独立测试）
 *
 * 与 online-core.js 同一套消息协议：
 *   {type:'move', i}         落子（i: 0-224，标准 15×15 棋盘，行优先 y*15+x）
 *   {type:'rematch', round}  再来一局（携带当前局号，防止双方同时点击导致双重轮换）
 *
 * 规则（无禁手自由行棋）：
 *   - 黑先白后；任意方向连成 ≥5 子即胜（连线整段返回，供高亮）
 *   - 双方按同一规则独立推进状态，无需「权威端」
 *   - round 偶数 → 房主执黑；奇数 → 房主执白（每局轮换先手）
 *   - 收到对方消息时做合法性校验（乱序/占用/越界/已结束一律丢弃）
 *   - opts.resume = {board, round, over}：断线重连时从快照恢复（胜负连线由棋盘重推）
 */
(function (global) {
  'use strict';

  var SIZE = 15;                 // 标准 15 路
  var WIN_LEN = 5;
  var CELL_COUNT = SIZE * SIZE;

  // 房间码字母表：全部大写字母 + 数字
  var CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  var DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];   // 横、竖、两条斜

  function idx(x, y) { return y * SIZE + x; }

  function getWinner(b) {
    for (var y = 0; y < SIZE; y++) {
      for (var x = 0; x < SIZE; x++) {
        var m = b[idx(x, y)];
        if (!m) continue;
        for (var d = 0; d < DIRS.length; d++) {
          var dx = DIRS[d][0], dy = DIRS[d][1];
          // 只从连线起点数起（前一格同色说明已在别处数过）
          var px = x - dx, py = y - dy;
          if (px >= 0 && px < SIZE && py >= 0 && py < SIZE && b[idx(px, py)] === m) continue;
          var line = [idx(x, y)];
          var cx = x + dx, cy = y + dy;
          while (cx >= 0 && cx < SIZE && cy >= 0 && cy < SIZE && b[idx(cx, cy)] === m) {
            line.push(idx(cx, cy));
            cx += dx; cy += dy;
          }
          if (line.length >= WIN_LEN) return { winner: m, line: line };
        }
      }
    }
    for (var i = 0, n = 0; i < CELL_COUNT; i++) if (b[i]) n++;
    return n === CELL_COUNT ? { winner: null, line: null } : null;
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

    var board = Array(CELL_COUNT).fill('');
    var round = 0;                 // 第几局（从 0 计）
    var over = false, winner = null, winLine = null;
    var moves = [];                // 落子顺序（悔棋需要；snapshot 会带出）

    // 断线重连：从快照恢复局面（含落子顺序，恢复后仍可悔棋）
    if (opts.resume && Array.isArray(opts.resume.board) && opts.resume.board.length === CELL_COUNT) {
      board = opts.resume.board.slice();
      round = opts.resume.round | 0;
      over = !!opts.resume.over;
      if (Array.isArray(opts.resume.moves)) {
        moves = opts.resume.moves.filter(function (v) {
          return typeof v === 'number' && v >= 0 && v < CELL_COUNT;
        });
      }
      var fin = getWinner(board);
      winner = over && fin ? fin.winner : null;
      winLine = fin ? fin.line : null;
    }

    function myMark() { return ((round % 2 === 0) === isHost) ? 'B' : 'W'; }
    function oppMark() { return myMark() === 'B' ? 'W' : 'B'; }
    function turnMark() {
      var n = 0;
      for (var i = 0; i < CELL_COUNT; i++) if (board[i]) n++;
      return n % 2 === 0 ? 'B' : 'W';
    }
    function myTurn() { return !over && turnMark() === myMark(); }

    function snapshot() {
      return {
        board: board.slice(), round: round, over: over,
        winner: winner, line: winLine ? winLine.slice() : null,
        myMark: myMark(), myTurn: myTurn(),
        moves: moves.slice(),
      };
    }
    function emitState() { onEvent({ type: 'state', state: snapshot() }); }

    function endGame(w, line, resigned) {
      over = true;
      winner = w;
      winLine = line || null;
      emitState();   // 先让 UI 拿到 over/line 的最终状态（高亮、按钮开关都依赖它）
      onEvent({
        type: 'result', winner: w, line: winLine,
        iWon: w === myMark(), draw: w === null, resigned: !!resigned,
      });
    }

    function finishCheck() {
      var r = getWinner(board);
      if (r) endGame(r.winner, r.line);
    }

    function applyMove(i, mark) {
      board[i] = mark;
      moves.push(i);
      emitState();
      finishCheck();
    }

    // 悔棋（需双方各自调用、局面一致所以结果一致）：撤回 mark 方的最后一步。
    // 末子是 mark → 撤 1 子；末子是对方（现在轮 mark）→ 连撤 2 子。
    // 两种情况都回到「mark 落子前、轮 mark 重新下」。返回撤掉的子数。
    function undo(mark) {
      if (over) return 0;
      var n = moves.length;
      if (!n) return 0;
      var k = 0;
      if (board[moves[n - 1]] === mark) k = 1;
      else if (n >= 2 && board[moves[n - 2]] === mark) k = 2;
      else return 0;
      var removed = k;
      while (k--) board[moves.pop()] = '';
      emitState();
      return removed;
    }

    // 本方点击落子；未轮到 / 已占用 / 已结束时返回 false 不发送
    function onLocalMove(i) {
      if (!myTurn() || board[i]) return false;
      send({ type: 'move', i: i });
      applyMove(i, myMark());
      return true;
    }

    // 认输：本方投子，对方直接获胜（无连线，不高亮）
    function resign() {
      if (over) return false;
      endGame(oppMark(), null, true);
      return true;
    }

    // 求和达成：双方同意后各自调用，本局记平局
    function agreeDraw() {
      if (over) return false;
      endGame(null, null, false);
      return true;
    }

    // 收到对方消息：所有非法输入静默丢弃，双方状态永不错乱
    function onRemoteMsg(msg) {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'move') {
        if (over) return;
        if (typeof msg.i !== 'number' || msg.i < 0 || msg.i >= CELL_COUNT) return;
        if (board[msg.i]) return;
        if (turnMark() !== oppMark()) return;   // 现在应是本方行动 → 乱序消息，丢弃
        applyMove(msg.i, oppMark());
      } else if (msg.type === 'rematch') {
        // 只接受「针对刚结束这局」的重开请求（局号匹配），重复消息自然失效
        if (over && msg.round === round) doRematch(false);
      } else if (msg.type === 'resign') {
        // 对方认输 → 我方获胜
        if (!over && msg.round === round) endGame(myMark(), null, true);
      } else if (msg.type === 'draw-agree') {
        // 对方（通常是应允方回执）同意求和 → 平局
        if (!over && msg.round === round) agreeDraw();
      }
    }

    function doRematch(alsoSend) {
      if (!over) return;
      if (alsoSend) send({ type: 'rematch', round: round });
      round++;
      board = Array(CELL_COUNT).fill('');
      moves = [];
      over = false; winner = null; winLine = null;
      emitState();
    }

    emitState(); // 初始状态

    return {
      onLocalMove: onLocalMove,
      onRemoteMsg: onRemoteMsg,
      rematch: function () { doRematch(true); },
      undo: undo,
      resign: resign,
      agreeDraw: agreeDraw,
      getState: snapshot,
    };
  }

  global.TTGO = {
    createSession: createSession,
    randomRoomCode: randomRoomCode,
    getWinner: getWinner,
    SIZE: SIZE,
    WIN_LEN: WIN_LEN,
    CODE_CHARS: CODE_CHARS,
  };
})(typeof window !== 'undefined' ? window : this);
