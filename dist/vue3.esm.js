/* tic-tac-captcha Vue3 ESM — 由 scripts/build.js 生成，请勿手改 */
/**
 * tic-tac-captcha — Vue 3 组件封装
 *
 * 用法（Vite 等 ESM 工程）：
 *   import TicTacCaptcha from 'tic-tac-captcha/vue3';
 *
 *   <TicTacCaptcha :popup="true" @verified="onCaptcha" ref="captcha" />
 *
 *   const captcha = ref(null);
 *   function onCaptcha(passed) { ... }
 *   captcha.value.reset();          // 重置
 *   captcha.value.open();           // 弹窗模式下打开验证窗口
 *   captcha.value.close();          // 关闭
 *   captcha.value.getState();       // 'playing' | 'success' | 'fail'
 */
import { defineComponent, h, ref, onMounted, onBeforeUnmount } from 'vue';
import { createCaptcha } from './tic-tac-captcha.esm.js';

var TicTacCaptcha = defineComponent({
  name: 'TicTacCaptcha',

  props: {
    // 弹窗模式：渲染“点击进行人机验证”触发按钮，点击后弹出棋盘
    popup: { type: Boolean, default: false },
  },

  emits: ['verified', 'reset'],

  setup: function (props, ctx) {
    var el = ref(null);
    var api = null;

    onMounted(function () {
      api = createCaptcha(el.value, {
        popup: props.popup,
        onVerified: function (passed) { ctx.emit('verified', passed); },
        onReset: function () { ctx.emit('reset'); },
      });
    });

    onBeforeUnmount(function () {
      if (api) api.destroy();
    });

    ctx.expose({
      reset: function () { if (api) api.reset(); },
      open: function () { if (api && api.open) api.open(); },
      close: function () { if (api && api.close) api.close(); },
      getState: function () { return api ? api.getState() : 'playing'; },
    });

    return function () { return h('div', { ref: el }); };
  },
});

export { TicTacCaptcha, createCaptcha };
export default TicTacCaptcha;

