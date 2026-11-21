#!/usr/bin/env node
/**
 * 零依赖构建：src/ → dist/
 *   dist/tic-tac-captcha.esm.js   ESM（核心）
 *   dist/tic-tac-captcha.umd.js   UMD（CommonJS / AMD / 浏览器全局 TicTacCaptcha）
 *   dist/vue3.esm.js              Vue 3 组件（ESM，配合打包器使用）
 *   dist/vue3.global.js           Vue 3 组件（经典脚本，需先引入 vue.global.js）
 *
 * 运行：node scripts/build.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const write = (f, s) => {
  fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
  fs.writeFileSync(path.join(root, f), s);
  console.log('  ✓', f);
};

// 去掉 ESM 的 import / export 语句（UMD、global 构建需要）
const stripModules = src =>
  src.split('\n').filter(l => !/^\s*(import |export )/.test(l)).join('\n');

console.log('构建 tic-tac-captcha …');

const core = read('src/core.js');
const vue3 = read('src/vue3.js');

// 1) 核心 ESM：源码即产物
write('dist/tic-tac-captcha.esm.js', core);

// 2) 核心 UMD
write('dist/tic-tac-captcha.umd.js', [
  '/* tic-tac-captcha UMD — 由 scripts/build.js 生成，请勿手改 */',
  '(function (global, factory) {',
  "  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :",
  "  typeof define === 'function' && define.amd ? define(['exports'], factory) :",
  "  (global = typeof globalThis !== 'undefined' ? globalThis : global || self,",
  '   factory(global.TicTacCaptcha = {}));',
  '})(this, function (exports) {',
  "'use strict';",
  '',
  stripModules(core),
  '',
  'exports.createCaptcha = createCaptcha;',
  'exports.create = createCaptcha;',
  "Object.defineProperty(exports, '__esModule', { value: true });",
  '});',
].join('\n'));

// 3) Vue 3 组件 ESM：把对 ./core.js 的引用改指同目录构建产物
write('dist/vue3.esm.js',
  '/* tic-tac-captcha Vue3 ESM — 由 scripts/build.js 生成，请勿手改 */\n' +
  vue3.replace("'./core.js'", "'./tic-tac-captcha.esm.js'") + '\n');

// 4) Vue 3 组件经典脚本：内联核心，依赖全局 Vue（window.Vue）
write('dist/vue3.global.js', [
  '/* tic-tac-captcha Vue3 global — 由 scripts/build.js 生成，请勿手改。',
  '   需先引入 vue.global.js（全局 Vue） */',
  'var TicTacCaptchaVue = (function (Vue) {',
  "'use strict';",
  '  var defineComponent = Vue.defineComponent, h = Vue.h, ref = Vue.ref,',
  '      onMounted = Vue.onMounted, onBeforeUnmount = Vue.onBeforeUnmount;',
  '',
  stripModules(core),
  '',
  stripModules(vue3),
  '',
  '  return TicTacCaptcha;',
  '})(window.Vue);',
].join('\n'));

console.log('完成 ✅');
