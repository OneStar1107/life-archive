/* v67 验证：抽取原型 HTML 中的真实 syncUndoBarOffset 与 CapsuleGuard.check 源码，
   在 Node DOM/layout 桩上执行几何断言。不依赖浏览器。 */
'use strict';
const fs = require('fs');
const path = process.argv[2] || '人生档案-产品概念原型.html';
const html = fs.readFileSync(path, 'utf8');

/* ---- 括号匹配抽取函数源码 ---- */
function extract(startMarker, fromIdx) {
  const i = html.indexOf(startMarker, fromIdx || 0);
  if (i < 0) throw new Error('marker not found: ' + startMarker);
  let depth = 0, started = false;
  for (let j = i; j < html.length; j++) {
    const c = html[j];
    if (c === '{') { depth++; started = true; }
    if (c === '}') { depth--; if (started && depth === 0) {
      /* 吞掉紧跟的 )(); 等收尾符号（IIFE 调用尾） */
      let end = j + 1;
      while (end < html.length && /[\s)\();]/.test(html[end])) { end++; if (html[end - 1] === ';') break; }
      return html.slice(i, end);
    } }
  }
  throw new Error('unbalanced braces for: ' + startMarker);
}
const syncSrc = extract('function syncUndoBarOffset(){');
const guardSrc = extract('var CapsuleGuard = (function(){');

/* ---- DOM/layout 桩 ---- */
function makeRect(top, bottom, left, right) {
  return { top, bottom, left, right, width: right - left, height: bottom - top };
}
function makeEl(name, rect, opts) {
  opts = opts || {};
  const classes = new Set(opts.classes || []);
  const children = [];
  const el = {
    name, _rect: rect || null,
    classList: {
      contains: c => classes.has(c),
      add: c => classes.add(c),
      remove: c => classes.delete(c),
      toggle: (c, v) => { v ? classes.add(c) : classes.delete(c); },
    },
    style: { _props: {}, setProperty(k, v) { this._props[k] = v; }, removeProperty(k) { delete this._props[k]; } },
    children: children,
    parentNode: null,
    appendChild: ch => { ch.parentNode = el; children.push(ch); return ch; },
    removeChild: ch => { const k = children.indexOf(ch); if (k >= 0) children.splice(k, 1); ch.parentNode = null; return ch; },
    addEventListener: () => {},
    querySelector: sel => (opts.qmap && opts.qmap[sel]) || null,
    querySelectorAll: sel => (opts.qall && opts.qall[sel]) || [],
    textContent: opts.text || '',
    innerHTML: '',
    title: '',
    getBoundingClientRect() { return el._rect || makeRect(0, 0, 0, 0); },
  };
  return el;
}

/* 场景几何（frame 520x852，y 向下）：
   输入框 top=684 bottom=734；nav top=754；正确胶囊 bottom=672（高出输入框顶12px）
   v66 错误胶囊 bottom=562（高出输入框顶122px，压消息）；气泡 msg 580~626 */
const G = {
  frame: makeEl('frame', makeRect(0, 852, 0, 520)),
  nav: makeEl('nav', makeRect(754, 840, 18, 502)),
  dock: makeEl('chat-input', makeRect(684, 734, 20, 500)),
  page0: null, page1: null,
  bar: makeEl('undo-bar', makeRect(630, 672, 130, 390), { classes: ['show'] }),
  msg: makeEl('msg', makeRect(580, 626, 20, 500), { text: '你已经很努力了。要陪你理一理' }),
};
G.page0 = makeEl('pg0', null, { qmap: { '.chat-input': G.dock }, qall: { '.msg': [G.msg] } });
G.page1 = makeEl('pg1', null, {});

let activePage = G.page0;
let barVisible = true;

const documentStub = {
  querySelector(sel) {
    if (sel === '.frame') return G.frame;
    if (sel === '.nav') return G.nav;
    if (sel === '.page.active') return activePage;
    if (sel === '.undo-bar') return G.bar;
    return null;
  },
  createElement: () => makeEl('created'),
};
const windowStub = { ResizeObserver: undefined };
const consoleRows = [];
const consoleStub = {
  log: (...a) => consoleRows.push(a.join(' ')),
  table: rows => consoleRows.push('TABLE:' + JSON.stringify(rows)),
};
let rafPending = [];
function rafStub(fn) { rafPending.push(fn); return rafPending.length; }

/* ---- 装载真实源码 ---- */
const sandbox = syncSrc + '\n' + guardSrc + '\nreturn { syncUndoBarOffset: syncUndoBarOffset, CapsuleGuard: CapsuleGuard };';
const factory = new Function('document', 'window', 'console', 'requestAnimationFrame', 'undoBar', sandbox);
const api = factory(documentStub, windowStub, consoleStub, rafStub, G.bar);

let failed = 0;
function assert(name, cond, detail) {
  if (cond) console.log('  ✅ ' + name + (detail ? '  [' + detail + ']' : ''));
  else { failed++; console.log('  ❌ ' + name + (detail ? '  [' + detail + ']' : '')); }
}

console.log('—— 测试 1：旅途页 syncUndoBarOffset（锚定输入框顶边 +12px）——');
api.syncUndoBarOffset();
const lift = G.frame.style._props['--undo-lift'];
assert('--undo-lift 已赋值', lift !== undefined, '值=' + lift);
assert('数值 = 输入框顶边852-684=168 +12 = 180', lift === '180px', '期望 180px');
/* CSS bottom = var(--undo-lift) = 180 → 胶囊底边 y = 852-180 = 672 = 输入框顶684 - 12 ✓ */

console.log('—— 测试 2：非旅途页回落 CSS 默认位（移除变量）——');
activePage = G.page1;
api.syncUndoBarOffset();
assert('--undo-lift 已移除', G.frame.style._props['--undo-lift'] === undefined);
/* fallback = 86+24 = 110 → 胶囊底边 y = 742，nav 顶 754，间隙 12px ✓ */

console.log('—— 测试 3：CapsuleGuard.check 正确位置（R1~R5 全过）——');
activePage = G.page0; barVisible = true;
G.bar.classList.add('show');
G.bar._rect = makeRect(630, 672, 130, 390);   /* 正确位 */
const res1 = api.CapsuleGuard.check();
assert('整体通过', res1.pass === true, JSON.stringify(res1.rows.map(r => r.规则 + r.结果)));
assert('5 条规则齐全', res1.rows.length === 5, 'rows=' + res1.rows.length);

console.log('—— 测试 4：v66 式偏移（压住气泡）必被检测器抓到 ——');
G.bar._rect = makeRect(520, 562, 130, 390);   /* 高出输入框顶 122px */
G.msg._rect = makeRect(530, 590, 20, 500);    /* 气泡与胶囊 520~562 纵向相交 */
const res2 = api.CapsuleGuard.check();
assert('整体判违规', res2.pass === false);
const r3 = res2.rows.find(r => r.规则 === 'R3 贴输入框');
const r4 = res2.rows.find(r => r.规则 === 'R4 不压气泡');
assert('R3 抓到悬空 122px', r3 && r3.结果.indexOf('❌') >= 0, r3 && r3.测得);
assert('R4 抓到压气泡', r4 && r4.结果.indexOf('❌') >= 0, r4 && r4.测得);

console.log('—— 测试 5：胶囊横向出界被 R1 抓到 ——');
G.bar._rect = makeRect(630, 672, -30, 520);   /* 左出界 */
const res3 = api.CapsuleGuard.check();
assert('R1 判违规', res3.pass === false && res3.rows[0].结果.indexOf('❌') >= 0);

console.log('—— 测试 6：ping/start 冒烟（无 ResizeObserver 环境不崩）——');
try { api.CapsuleGuard.start(); api.CapsuleGuard.ping(); assert('start/ping 无异常', true); }
catch (e) { assert('start/ping 无异常', false, e.message); }

console.log('—— 测试 7：v68 徽章默认隐藏，后台检测照跑 ——');
const before = G.frame.children ? G.frame.children.length : 0;
assert('默认不创建徽章节点（页面零残留）', before === 0, 'frame 子节点=' + before);
const res7 = api.CapsuleGuard.check();
assert('后台检测仍出结果', !!res7 && res7.rows.length > 0, 'rows=' + (res7 && res7.rows.length));
assert('toggleBadge(true) 唤出徽章', api.CapsuleGuard.toggleBadge(true) === true);
assert('唤出后 frame 多出 1 个子节点', G.frame.children.length === 1, 'children=' + G.frame.children.length);
assert('toggleBadge(false) 移除徽章', api.CapsuleGuard.toggleBadge(false) === false);
assert('移除后 frame 子节点归零', G.frame.children.length === 0, 'children=' + G.frame.children.length);
assert('关掉徽章后检测依然工作', api.CapsuleGuard.check().rows.length === 5);

console.log('');
console.log(failed === 0 ? '✅ 全部断言通过（真实源码 + 布局桩）' : '❌ ' + failed + ' 项失败');
process.exit(failed === 0 ? 0 : 1);
