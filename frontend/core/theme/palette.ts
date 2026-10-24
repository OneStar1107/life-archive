// core/theme/palette.ts
// ══════════════════════════════════════════════════════════════
// Canvas 调色板
// ══════════════════════════════════════════════════════════════
//
// 为什么需要这个文件：
//   `<canvas>` 的 2D 上下文（CanvasRenderingContext2D）**不认 CSS 变量**，
//   setStrokeStyle / setFillStyle 只能接具体色值。
//   如果在 pages/memory/index.uvue 里直接写 '#4FB0D9'，就同时踩了两条红线：
//     1. 页面里出现色值字面量（应由 theme.json 统管）
//     2. 深色模式下画出来还是浅色蓝，节点会「发光」糊成一片
//   所以色值**只允许**收敛在本文件一处，由isDark 决定返回哪一套。
//
// 铁律：
//   1. 本文件的色值必须与 theme.json 的同名令牌**逐字一致**，改一处要改两处。
//   2. pages / components 里**禁止**再出现任何色值字面量。
//   3. 新增画布场景时只在这里加令牌，不要在页面里就地取色。

/** 一套画布配色 */
export type CanvasPalette = {
  /** 画布底色（透明，让玻璃卡片透出来） */
  surface: string
  /** 连线 */
  edge: string
  /** 节点描边 */
  nodeStroke: string
  /** 节点填充 */
  nodeFill: string
  /** 选中节点描边 */
  nodeActive: string
  /** 节点文字 */
  nodeText: string
  /** 次要文字（副标题 / 计数） */
  textDim: string
}

/** 浅色画布配色（与 theme.json 的 light 同源） */
const LIGHT: CanvasPalette = {
  surface: '#F8FBFE',
  edge: 'rgba(10, 34, 51, 0.14)',
  nodeStroke: '#0E5C7E',
  nodeFill: 'rgba(79, 176, 217, 0.18)',
  nodeActive: '#1E87B5',
  nodeText: '#0A2233',
  textDim: '#5B7C90',
}

/** 深色画布配色（与 theme.json 的 dark 同源） */
const DARK: CanvasPalette = {
  surface: '#081217',
  edge: 'rgba(230, 241, 247, 0.18)',
  nodeStroke: '#7FD4F2',
  nodeFill: 'rgba(79, 176, 217, 0.22)',
  nodeActive: '#9FE0F7',
  nodeText: '#E6F1F7',
  textDim: '#A8C2D0',
}

/** 按当前主题取画布配色 */
export function canvasPalette(isDark: boolean): CanvasPalette {
  return isDark ? DARK : LIGHT
}
