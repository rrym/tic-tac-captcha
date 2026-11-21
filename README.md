# 🤖 tic-tac-captcha — 井字棋行为验证码

> 赢下这局井字棋（或战平），证明你是人类。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

不是滑块，不是点选汉字——是一局和电脑的井字棋对弈：

- 🏆 **你赢了 → 验证通过**
- 🤝 **平局 → 验证通过**
- 🤖 **电脑赢了 → 验证失败，再试一次**

内置“简单电脑”：能赢必赢、五成概率防守、其余随机——像个体力不支的新手，人类随手就能赢或平，但过程足够“行为化”。

## 特性

- **零依赖**：核心是纯 JS，CSS 由组件自动注入，无需引入样式文件
- **框架无关**：提供 ESM / UMD / 全局脚本三种核心产物
- **Vue 3 组件**：一个标签 `<TicTacCaptcha popup @verified="..." />` 接入（也适配 CDN 场景）
- **弹窗 / 内嵌两种模式**：弹窗模式只占一行触发按钮，点击后弹出验证窗口
- **自适应深色模式**、移动端可用
- 棋子落子有 SVG 描边动画、获胜连线高亮

## 在线示例

双击 `examples/` 下的 HTML 即可在浏览器体验（`vue3-cdn.html` 需联网加载 Vue）：

| 文件 | 内容 |
| --- | --- |
| `examples/vanilla.html` | 最简接入：内嵌 + 弹窗两种模式 |
| `examples/login.html` | 完整登录/注册表单 + 验证码拦截 |
| `examples/vue3-cdn.html` | Vue 3（CDN 方式）接入 |
| `examples/game.html` | 井字棋游戏本体（组件的出身之地） |

## 快速开始

### 方式一：`<script>` 标签（UMD，双击即用）

```html
<div id="captcha"></div>

<script src="dist/tic-tac-captcha.umd.js"></script>
<script>
  TicTacCaptcha.create(document.getElementById('captcha'), {
    popup: true,                       // 弹窗模式（false = 内嵌棋盘）
    onVerified(passed) {
      console.log(passed ? '✅ 通过' : '❌ 失败');
    },
  });
</script>
```

### 方式二：ESM import

```js
import { createCaptcha } from 'tic-tac-captcha';

const captcha = createCaptcha(el, {
  popup: true,
  onVerified(passed) { /* ... */ },
});
```

### 方式三：Vue 3（Vite 等打包工程，推荐）

```bash
npm install tic-tac-captcha
# 或直接装 GitHub 版本：
# npm install github:rrym/tic-tac-captcha
```

```vue
<script setup>
import { ref } from 'vue';
import TicTacCaptcha from 'tic-tac-captcha/vue3';

const captcha = ref(null);
const passed = ref(null);

function onVerified(ok) { passed.value = ok; }
function retry() { captcha.value.reset(); }
</script>

<template>
  <TicTacCaptcha :popup="true" @verified="onVerified" ref="captcha" />
  <p v-if="passed === false">验证失败 <button @click="retry">重试</button></p>
</template>
```

### 方式四：Vue 3（CDN / 传统页面）

```html
<script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
<script src="dist/vue3.global.js"></script>
<script>
  const app = Vue.createApp({
    components: { TicTacCaptcha: TicTacCaptchaVue },
    // ...
  });
</script>
```

## API

### 核心工厂 `createCaptcha(container, options)`

| 选项 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `popup` | boolean | `false` | 弹窗模式：容器内渲染触发按钮，点击弹出验证窗口 |
| `onVerified` | function | — | 每局结束时回调，参数 `passed: boolean`（胜/平 = true） |
| `onReset` | function | — | 点击 ↻ 或「再试一次」重置时回调 |

返回实例：

| 方法 | 说明 |
| --- | --- |
| `reset()` | 重置一局（触发 `onReset`） |
| `getState()` | `'playing' \| 'success' \| 'fail'` |
| `open()` / `close()` | 弹窗模式下打开/关闭验证窗口 |
| `destroy()` | 清理定时器（组件卸载时调用） |

### Vue 3 组件 `<TicTacCaptcha>`

| Props | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `popup` | Boolean | `false` | 弹窗模式 |

| 事件 | 参数 | 说明 |
| --- | --- | --- |
| `@verified` | `passed: boolean` | 每局结束（胜/平 = true，负 = false） |
| `@reset` | — | 局内重置 |

模板 ref 暴露的方法：`reset()` / `open()` / `close()` / `getState()`（见上方 Vite 示例）。

## ⚠️ 安全须知

本组件的判定逻辑运行在浏览器端，**适合作为轻量人机门槛（以及有趣的产品体验），不能替代服务端风控**。如需接入真实登录/注册：

1. 将整局走子序列随表单提交到服务端复核（校验每步合法、终局判定正确、用时合理）；
2. 对同一 IP / 会话做频控；
3. 验证通过的结果由服务端下发一次性票据，而不是信任前端回调。

## 项目结构

```
├── src/
│   ├── core.js        # 核心实现（框架无关，ESM）
│   └── vue3.js        # Vue 3 组件封装
├── dist/              # 预构建产物（由 scripts/build.js 生成）
├── scripts/build.js   # 零依赖构建脚本
├── test/run.js        # 模拟 DOM 的行为测试（31+ 断言）
└── examples/          # vanilla / login / vue3-cdn / game
```

## 开发

```bash
node scripts/build.js   # 重新构建 dist/
npm test                # 运行行为测试（模拟 DOM + 可控随机数）
```

测试不依赖任何第三方包：内置极简 DOM 模拟，用可控的 `Math.random` 序列精确导演每一局（玩家胜、平局、电脑反杀、弹窗时序、登录拦截……）。

## License

[MIT](./LICENSE) © bepo
