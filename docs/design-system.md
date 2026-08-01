# SSHEasy Design System v1.0

> 设计基调：暗色柔和风 · 青绿强调 · 强引导 · 非技术用户友好

---

## 0. 风格定调

### 为什么选「暗色柔和风」而不是其他

| 方向 | 适合谁 | 为什么不选 |
|---|---|---|
| 暗色极客风（纯黑+霓虹） | 运维老手 | 非技术用户会觉得"吓人"，纯黑底+高对比霓虹对长时间使用不友好 |
| 暗色柔和风（深蓝灰+柔和强调） | 所有人 ✅ | 暗色省眼+显专业，柔和色调降低压迫感，非技术用户不畏惧 |
| 暗色专业风（炭灰+高密度） | 开发者 | 信息密度太高，非技术用户会迷路 |
| 浅色干净风 | 所有人 | SSH 客户端是长时间盯屏工具，浅色在暗环境下的眩光问题大 |

**最终基调**：暗色柔和，参考 Linear / Raycast 的精致克制，但降低信息密度，增加引导性。

### 设计原则

1. **引导优先**：每个状态都要有明确的人话提示，不留"用户猜不透"的空状态
2. **操作明确**：每个按钮的含义一清二楚，不用 hover 才出现的关键操作
3. **视觉层次**：3 层灰阶就够了——背景 / 表面 / 边框，不要 6 个灰度
4. **一种强调色**：青绿用于所有"可操作/选中/品牌"场景，错误用红、警告用琥珀
5. **舒适间距**：元素间 8px / 12px / 16px 三档，不用 2px / 3px 这种碎间距

---

## 1. 色彩系统

### 核心色板

```css
:root {
  /* === 背景层（3 层灰阶，够了） === */
  --bg-base: #0f1115;       /* 最底层：窗口背景 */
  --bg-surface: #161922;     /* 表面层：侧栏、弹窗、卡片 */
  --bg-elevated: #1d2130;    /* 提升层：hover、选中、输入框 */

  /* === 边框（2 层） === */
  --border-subtle: #232733;  /* 默认边框，几乎看不见 */
  --border-strong: #2e3344;  /* hover/聚焦边框 */

  /* === 文字（4 层） === */
  --text-primary: #e4e7ee;   /* 主要文字 */
  --text-secondary: #9ca3b4;  /* 次要文字 */
  --text-tertiary: #6b7280;  /* 辅助说明 */
  --text-disabled: #4b5563;   /* 禁用/占位 */

  /* === 强调色：青绿 Teal/Emerald === */
  --accent: #14b8a6;          /* 主操作、选中、品牌色 */
  --accent-hover: #0d9488;    /* hover 态 */
  --accent-active: #0f766e;   /* 按下态 */
  --accent-soft: rgba(20, 184, 166, 0.12);  /* 选中背景 */
  --accent-glow: rgba(20, 184, 166, 0.25);  /* 聚焦光晕 */

  /* === 语义色 === */
  --success: #34d399;         /* 连接成功 */
  --warning: #fbbf24;         /* 警告/连接中 */
  --danger: #f87171;          /* 错误/断线/删除 */
  --info: #60a5fa;            /* 信息提示 */

  /* 语义色柔化背景 */
  --success-soft: rgba(52, 211, 153, 0.10);
  --warning-soft: rgba(251, 191, 36, 0.10);
  --danger-soft: rgba(248, 113, 113, 0.10);
  --info-soft: rgba(96, 165, 250, 0.10);
}
```

### 色彩使用规则

| 场景 | 用色 |
|---|---|
| 窗口/终端背景 | `--bg-base` |
| 侧栏、弹窗、卡片底 | `--bg-surface` |
| hover 行、选中行、输入框底 | `--bg-elevated` |
| 主按钮、Tab 选中下划线、选中项 | `--accent` |
| 连接成功状态点 | `--success` |
| 连接中状态点 | `--warning`（配合 `animate-pulse`） |
| 断线状态点 + 删除按钮 | `--danger` |
| 错误提示背景 | `--danger-soft` + `--danger` 文字 |
| 主要文字（标题、内容） | `--text-primary` |
| 次要文字（副标题、说明） | `--text-secondary` |
| 辅助文字（占位符、底部状态） | `--text-tertiary` |

### 禁止行为

- ❌ 不允许在组件里硬编码 `#0a0a0f`、`#1e1e2e` 这种魔法值
- ❌ 不允许出现 `text-gray-500` 这种直接用 Tailwind 调色盘的写法（统一用 CSS 变量映射的 Tailwind alias）
- ❌ 不允许超过 3 层灰阶背景（base / surface / elevated 就够了）
- ❌ 不允许强调色出现第二种（不用 indigo、purple、blue 做强调）

---

## 2. 字号体系

只允许 4 个字号 + 1 个终端字号：

| 用途 | 大小 | 行高 | 对应 |
|---|---|---|---|
| 标题 | 14px | 1.4 | `text-sm` |
| 正文 | 13px | 1.5 | `text-[13px]` |
| 辅助 | 11px | 1.4 | `text-[11px]` |
| 标签 | 10px | 1.3 | `text-[10px]` |
| 终端 | 13px | 1.4 | xterm fontSize: 13 |

### 字重

| 用途 | 字重 |
|---|---|
| 标题/强调 | `font-medium` (500) |
| 正文 | `font-normal` (400) |
| 辅助/标签 | `font-normal` (400) |
| 禁用 | `font-normal` + `--text-disabled` |

### 禁止行为

- ❌ 不用 `text-[9px]`，最小 10px
- ❌ 不用 `text-xs`(12px)，正文统一 13px
- ❌ 不用 `text-lg` / `text-xl`，标题最大 14px
- ❌ 不用 `font-bold`，最粗 `font-medium`

---

## 3. 间距系统

所有间距只用 4 的倍数，3 档 + 2 个特殊：

| 名称 | 值 | 用途 |
|---|---|---|
| `space-xs` | 4px | 图标和文字之间、按钮内图标间距 |
| `space-sm` | 8px | 紧凑元素间距、行内间距 |
| `space-md` | 12px | 标准间距、卡片内边距、列表项间距 |
| `space-lg` | 16px | 区块间距、弹窗内边距 |
| `space-xl` | 24px | 大区块间距、标题与内容间距 |

### 圆角

| 用途 | 值 |
|---|---|
| 按钮、输入框、小卡片 | 8px (`rounded-lg`) |
| 弹窗、大卡片 | 12px (`rounded-xl`) |
| 状态点、图标容器 | 4px (`rounded-md`) |
| 全圆 | 50% (`rounded-full`) |

### 尺寸

| 元素 | 高度 |
|---|---|
| 顶栏/Tab 栏 | 36px |
| 行高（列表项） | 32px（舒适） |
| 按钮 | 32px（sm）/ 36px（md） |
| 输入框 | 32px |
| 图标容器 | 20px / 24px / 28px |
| 状态点 | 6px |

---

## 4. 组件规范

### 按钮

```
┌─ 主按钮（Primary）─────────────┐
│ bg: --accent                   │
│ text: white                    │
│ height: 36px                   │
│ padding: 0 16px                │
│ border-radius: 8px             │
│ hover: --accent-hover          │
│ active: --accent-active        │
│ disabled: opacity 0.4         │
└────────────────────────────────┘

┌─ 次按钮（Secondary）───────────┐
│ bg: --bg-elevated              │
│ text: --text-secondary         │
│ border: 1px --border-subtle    │
│ hover: bg --bg-elevated + 亮字  │
└────────────────────────────────┘

┌─ 幽灵按钮（Ghost）─────────────┐
│ bg: transparent                │
│ text: --text-tertiary          │
│ hover: --text-primary + bg软   │
└────────────────────────────────┘

┌─ 危险按钮（Danger）────────────┐
│ bg: --danger                   │
│ text: white                    │
│ hover: #ef4444                 │
└────────────────────────────────┘
```

- 主按钮每屏只能有 1 个（主操作）
- 次按钮用于"取消""返回"等
- 幽灵按钮用于工具栏图标按钮

### 输入框

```
bg: --bg-base
border: 1px --border-subtle
border-radius: 8px
height: 32px
padding: 0 12px
font-size: 13px
text: --text-primary
placeholder: --text-tertiary

focus:
  border: --accent
  box-shadow: 0 0 0 3px --accent-glow

error:
  border: --danger
  box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.15)
```

### 列表项

```
height: 32px
padding: 0 8px
border-radius: 6px
text: --text-secondary

hover:
  bg: --bg-elevated
  text: --text-primary

active/selected:
  bg: --accent-soft
  text: --text-primary
  左竖条: 2px --accent（可选）
```

### 弹窗

```
遮罩: bg rgba(0, 0, 0, 0.55) + backdrop-blur(2px)
弹窗:
  bg: --bg-surface
  border: 1px --border-subtle
  border-radius: 12px
  padding: 20px
  max-width: 90vw
  box-shadow: 0 20px 60px rgba(0,0,0,0.4)

进入动画: opacity 0→1 + translateY 8px→0, 200ms ease-out
关闭: 点击遮罩关闭 + Esc 关闭
```

### 状态点

```
尺寸: 6px × 6px
圆角: rounded-full

connected:  --success (实色)
connecting: --warning (animate-pulse)
disconnected: --text-disabled (灰色，不闪)
error: --danger (实色)
```

### 空状态

```
图标容器: 48px × 48px, rounded-2xl, bg --bg-elevated, border --border-subtle
图标: 24px, --text-tertiary
标题: 13px, --text-secondary
说明: 11px, --text-tertiary
行动按钮: 主按钮，居中
```

---

## 5. 动效规范

| 场景 | 动效 | 时长 |
|---|---|---|
| 元素出现 | opacity 0→1 + translateY 4px→0 | 200ms ease-out |
| 弹窗出现 | opacity 0→1 + scale 0.96→1 | 150ms ease-out |
| hover 背景色 | background-color 过渡 | 150ms |
| 状态切换 | opacity 过渡 | 200ms |
| 选中态变化 | background-color 过渡 | 100ms |

### 禁止

- ❌ 不用旋转动画做加载（除 spinner）
- ❌ 不用弹跳/回弹（bounce）
- ❌ 动画不超过 300ms
- ❌ 不用 `transform: scale` 做列表 hover（会造成布局抖动）

---

## 6. 图标规范

- 图标尺寸：12px / 14px / 16px 三档
- 线宽：1.2px~1.5px，统一用 1.3px
- 风格：线性（outline），不用填充式（solid）做主图标
- 颜色：跟随 `--text-tertiary`，hover 变 `--text-primary` 或语义色
- 图标容器：20px / 24px，居中对齐

---

## 7. 布局规范

### 间距分配

```
┌─────────────────────────────────────────┐
│ 顶栏 36px                               │
├──────┬──────────────────────┬──────────┤
│      │                      │          │
│ 左栏 │     中间主区域        │  右栏    │
│ 220px│                      │ 260px    │
│ min  │                      │ min     │
│ 180  │                      │ 220     │
│ max  │                      │ max     │
│ 280  │                      │ 320     │
│      │                      │          │
├──────┴──────────────────────┴──────────┤
│ 底部状态栏 28px（可选）                   │
└─────────────────────────────────────────┘
```

- 左右栏可拖拽调整宽度，范围 `[180, 280]` / `[220, 320]`
- 拖拽分隔条：1px 宽，hover 变 `--accent` + 拖拽手柄
- 中间区域至少占 50% 宽度

### 终端区

- 内边距：`8px 12px`
- 光标：`bar` 样式，blink，颜色 `--accent`
- 选中背景：`--accent-soft`
- 字体：`'JetBrains Mono', 'SF Mono', 'Fira Code', monospace`
- 字号：13px，行高 1.4

---

## 8. Tailwind 配置映射

```js
// tailwind.config.js
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // 直接映射 CSS 变量，组件里用 bg-base / bg-surface / text-primary 等
        base: "var(--bg-base)",
        surface: "var(--bg-surface)",
        elevated: "var(--bg-elevated)",
        "border-subtle": "var(--border-subtle)",
        "border-strong": "var(--border-strong)",
        primary: "var(--text-primary)",
        secondary: "var(--text-secondary)",
        tertiary: "var(--text-tertiary)",
        disabled: "var(--text-disabled)",
        accent: "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        "accent-soft": "var(--accent-soft)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        info: "var(--info)",
      },
      fontSize: {
        label: ["10px", "1.3"],
        helper: ["11px", "1.4"],
        body: ["13px", "1.5"],
        title: ["14px", "1.4"],
      },
      spacing: {
        "space-xs": "4px",
        "space-sm": "8px",
        "space-md": "12px",
        "space-lg": "16px",
        "space-xl": "24px",
      },
      borderRadius: {
        pill: "6px",       // 列表项
        card: "12px",      // 弹窗
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "'SF Mono'", "'Fira Code'", "monospace"],
      },
    },
  },
  plugins: [],
};
```

### 组件里的写法

```tsx
// ✅ 正确：用语义化 class
<div className="bg-surface border border-border-subtle rounded-card">
  <span className="text-primary text-body">连接成功</span>
  <span className="text-tertiary text-helper">192.168.1.1:22</span>
</div>

// ❌ 错误：硬编码魔法值
<div className="bg-[#0e0e15] border border-[#1a1a24] rounded-xl">
  <span className="text-[#e2e8f0] text-xs">连接成功</span>
</div>
```

---

## 9. 对当前代码的迁移清单

需要改的点（按影响面排序）：

### 全局（一次性改完）
1. `src/index.css`：加入 CSS 变量定义
2. `tailwind.config.js`：映射变量到 Tailwind 别名
3. 全局搜索替换：`#0a0a0f` → `bg-base`、`#0e0e15` → `bg-surface`、`#1a1a24` → `border-border-subtle` ...

### 组件逐个迁移
4. `AppShell.tsx`：顶栏/布局色改变量
5. `ServerList.tsx`：状态点颜色改语义色
6. `TerminalPanel.tsx`：终端主题色改变量，光标色改 `--accent`
7. `FileBrowser.tsx`：图标/选中色改变量
8. `CommandSidebar.tsx` / `CommandItem.tsx`：强调色 indigo → accent
9. 所有弹窗组件：加 Esc 关闭 + 遮罩点击关闭 + slide-in 动画
10. `AddServerWizard.tsx`：输入框验证红色边框
11. 所有 `text-[9px]` → `text-label`(10px) 或 `text-helper`(11px)
12. 所有 `text-xs`(12px) → `text-body`(13px)

### 新增
13. `src/index.css`：加 `:focus-visible` 全局样式
14. 弹窗 `onKeyDown` Esc 监听
15. 表单 Enter 提交统一处理
