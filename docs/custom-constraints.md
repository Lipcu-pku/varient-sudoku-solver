# 自定义限制（Custom Constraints）JS 编写文档

> 本文是 sudoku_solver「自定义限制」功能的完整参考。同一份指南也可在页面内
> 「自定义限制 → API 文档」弹窗中查看（中英双语）。示例代码可在工具面板中
> 一键插入（“Insert example” 按钮）。

## 目录

1. [功能概述](#1-功能概述)
2. [规则代码的结构](#2-规则代码的结构)
3. [棋盘对象 B（Board API）](#3-棋盘对象-bboard-api)
4. [关键语义](#4-关键语义)
5. [性能](#5-性能)
6. [调试与常见问题](#6-调试与常见问题)
7. [常见限制实例代码](#7-常见限制实例代码)

---

## 1. 功能概述

- 「自定义限制」让你用纯 JavaScript 编写内置工具没有的约束。
- 每条规则会在**两个地方**生效：
  1. **实时生效**：在盘面输入数字时，违反规则的格子会被标红（冲突高亮）；
  2. **求解生效**：求解器会拒绝违反 `canPlace` 的填法，并筛掉不满足 `valid`
     的完整解。
- 可同时启用多条规则，它们之间是“逻辑与”（全部必须满足）。
- 规则随谜题一起序列化：**复制链接 / 分享链接会包含规则代码**，打开链接即可还原。
- 规则是代码，**导出到 SudokuPad 时不携带逻辑**（导出会在题目说明中注明规则名）。
- 基础数独规则（行 / 列 / 宫不重复）及其它内置约束仍由引擎强制执行；
  你只需编写“额外的”规则，不需要重复实现行/列/宫判重。

## 2. 规则代码的结构

编辑框内容是一个 **JavaScript 函数体**，必须以 `return { ... };` 语句结尾，
返回一个“规则描述对象”。输入时代码会被实时编译：显示绿色 “✓ 编译通过”表示
接受，红色文字给出语法 / 类型错误。编译失败或运行异常的规则会被**跳过并提示**，
绝不会被“静默地当作正确规则”使用。

```js
// 规则必须以 return 一个对象结尾
return {
  // 规则显示名（可选，用于报错与提示信息）
  name: "My Rule",

  // 可选：本次会话开始时调用一次，用于预计算（见第 3、4 节）
  init(B) { /* ... */ },

  // 可选：把数字 v 放入格子 i 之前询问；返回 false 则拒绝该填法
  canPlace(i, v, B) { return true; },

  // 可选：整盘填满后的最终校验；返回 false 则整盘作废
  valid(B) { return true; },
};
```

| 字段 | 类型 | 何时被调用 | 说明 |
| --- | --- | --- | --- |
| `name` | string | — | 显示名，出现在报错与消息里。可选。 |
| `init(B)` | function | 每次校验/求解开始前一次 | 预计算（例如把固定几何位置算好存入闭包变量）。可选。 |
| `canPlace(i, v, B)` | function | **每次试探填数**（求解中的每一步、以及你手动输入该格时） | 返回 `v` 是否允许放入格 `i`。返回 `false` 则拒绝。可选，缺省为允许。 |
| `valid(B)` | function | **整盘填满后**（求得完整解、或你填完最后一格） | 对完整盘面做最终裁决。返回 `false` 则整盘作废。可选，缺省为允许。 |

在 `return { ... };` 之前声明的局部变量会被各钩子通过闭包捕获——
这是共享预计算数据的推荐方式（参见“中心四格和 22”示例）。

## 3. 棋盘对象 B（Board API）

每个钩子都会收到只读的棋盘对象 `B`：

| 成员 | 含义 |
| --- | --- |
| `B.rows`, `B.cols` | 网格尺寸 |
| `B.N` | 数字个数（即最大数字） |
| `B.total` | `rows × cols` |
| `B.values` | 底层数字数组；`B.values[i]` = 格 i 的数字（1..N，大于 9 的数字为 10..16），0 = 空 |
| `B.deleted` | 空洞（删除格）标记 0/1 数组，可为 null |
| `B.get(i)` / `B.get(r, c)` | 读取某格数字 |
| `B.idx(r, c)` | 格 (r, c) 的编号 |
| `B.row(i)`, `B.col(i)` | 格 i 所在行 / 列 |
| `B.region(i)` | 格 i 所属宫格编号（未分配为 -1） |
| `B.rowCells(r)` / `B.colCells(c)` / `B.regionCells(reg)` | 行 / 列 / 宫的所有格子编号数组 |
| `B.ortho(i)` | 正交相邻格（上下左右） |
| `B.king(i)` | 八方向相邻格（含对角） |
| `B.knight(i)` | 马步可达格 |

约定：

- 格子编号从 0 开始，`i = r * B.cols + c`。
- 空洞格恒为 0，永远不会被填数；相关 `rowCells`/`colCells` 仍包含它们。
- **B 是只读的**：不要修改 `B.values` 或任何成员。

## 4. 关键语义

- **`canPlace` 是“主力”钩子**：每次试探（求解每一步 / 手动输入）都会调用。
  调用时格 `i` 在 `B` 中为**空**；你能看到的其它数字是已确定的数字
  （输入的数字或求解器先前确定的填数）。
- **必须“纯”且快**：只读 B、判断、返回。不要在两次调用之间保留随调用变化的状态；
  需要缓存就在 `init` 或代码顶部算好（闭包共享）。
- **`valid` 只在整盘填满时调用**：它无法在搜索中剪枝。
- 编译错误 / 异常不会被静默忽略：出错规则显示“规则名 + 原因”并跳过；
  若在求解器中抛错，求解会中止并显示该信息。
- 代码为空、或复选框未勾选的规则被跳过；停用的规则仍随链接分享，取消勾选即停用。
- 适用于 4..16 任意尺寸及异形 / 带空洞盘面；请用 `B.rows`/`B.cols`/`B.region`
  编写，不要硬编码 9。

## 5. 性能

> 最重要：**能用 `canPlace` 表达的规则就写 `canPlace`。**

- `canPlace` 在每次试探填数时被检查，廉价的局部判断（邻居、小集合等）能大幅剪枝。
- 只写 `valid` 的规则无法剪枝：求解器必须先完成普通数独解，再逐一淘汰不合规的。
- 每次 `canPlace` 尽量少扫描（用 `B.ortho`/`B.king`/`B.knight` 或预计算集合）。
- “某些格之和 = K”类规则：`canPlace` 用运行上限剪枝（已有和 + v ≤ K），
  `valid` 判定精确相等。
- **纯 `valid` 规则 + 稀疏盘面可能非常慢**：若求解器已检查完整盘面约 1.5 秒仍无
  结果，会停止并提示“该自定义规则需要更多已知数或补充 canPlace 钩子”。

## 6. 调试与常见问题

- **规则没生效？** 检查：已勾选启用、代码编译通过（绿色 ✓）、以 `return` 对象结尾。
  代码出错时规则被跳过并显示红色原因。
- **`canPlace` 与 `valid` 的区别？** `canPlace` 尽早拒绝单次填数（快，用于求解与
  输入时）；`valid` 对整张完成的盘面做最终裁决（不能剪枝）。
- **想打印调试信息？** 直接 `console.log`；求解在 Worker 中进行，日志同样出现在
  浏览器控制台。
- **为什么提示 “custom rule …” 并停止？** 规则抛了异常（读信息内容），或纯 `valid`
  规则在稀疏盘面上超过了约 1.5 秒预算。
- **能与内置约束混用吗？** 可以，自定义规则叠加在谜题已有约束之上。

## 7. 常见限制实例代码

以下六个模板覆盖了最常见的“手工题”自定义约束写法；均可从工具面板
“Insert example” 一键插入。

### 7.1 反马步 Anti-Knight（纯 `canPlace`，速度快）

```js
// 反马步 Anti-Knight：马步距离内的两格数字不能相同
return {
  name: 'Anti-Knight',
  canPlace(i, v, B) {
    // 附近已存在数字 v 时拒绝（i 此刻在 B 中为空）
    for (const j of B.knight(i)) {
      if (B.values[j] === v) return false;
    }
    return true;
  },
};
```

### 7.2 反邻数 Non-Consecutive（纯 `canPlace`）

```js
// 反邻数 Non-Consecutive：正交相邻两格不能相差 1
return {
  name: 'Non-Consecutive',
  canPlace(i, v, B) {
    for (const j of B.ortho(i)) {
      const w = B.values[j];
      if (w !== 0 && Math.abs(w - v) === 1) return false;
    }
    return true;
  },
};
```

### 7.3 强耳语 Whisper（差 ≥ 4，八方向）

```js
// 强耳语 Whisper：所有八方向相邻格之差 ≥ 4
return {
  name: 'Whisper (diff ≥ 4)',
  canPlace(i, v, B) {
    for (const j of B.king(i)) {
      const w = B.values[j];
      if (w !== 0 && Math.abs(w - v) < 4) return false;
    }
    return true;
  },
};
```

### 7.4 中心镜像等值 Mirror Equality（纯 `canPlace`）

```js
// 中心镜像 Mirror：180° 旋转对称的两格数字相同
return {
  name: 'Mirror Equality',
  canPlace(i, v, B) {
    const r = B.row(i), c = B.col(i);
    const rr = B.rows - 1 - r;
    const cc = B.cols - 1 - c;
    if (rr === r && cc === c) return true;   // 正中心一格无镜像
    const w = B.values[B.idx(rr, cc)];       // 镜像格的当前值
    return w === 0 || w === v;
  },
};
```

### 7.5 中心四格和 = 22 Center Sum（推荐组合：`canPlace` 剪枝 + `valid` 定值）

```js
// 中心四格和 = 22（9×9 示例，其它尺寸请改 TARGET）
const TARGET = 22;
let cells = [];                 // init 时按网格尺寸计算中心 2×2
return {
  name: 'Center Sum 22',
  init(B) {
    const r0 = Math.floor((B.rows - 2) / 2);
    const c0 = Math.floor((B.cols - 2) / 2);
    cells = [B.idx(r0, c0), B.idx(r0, c0 + 1), B.idx(r0 + 1, c0), B.idx(r0 + 1, c0 + 1)];
  },
  canPlace(i, v, B) {           // 剪枝：部分和不能超过目标
    if (!cells.includes(i)) return true;
    let s = v;
    for (const j of cells) {
      if (j !== i) s += B.values[j];
    }
    return s <= TARGET;
  },
  valid(B) {                    // 整盘完成：必须恰好等于目标
    let s = 0;
    for (const j of cells) s += B.values[j];
    return s === TARGET;
  },
};
```

### 7.6 四角为偶数 Even Corners（纯 `valid` 示例，注意性能）

```js
// 四角为偶数 Even Corners（只用 valid 的示例）
return {
  name: 'Even Corners',
  valid(B) {
    const corners = [
      B.idx(0, 0),
      B.idx(0, B.cols - 1),
      B.idx(B.rows - 1, 0),
      B.idx(B.rows - 1, B.cols - 1),
    ];
    return corners.every(i => B.values[i] % 2 === 0);
  },
};
```

---

*代码注释与报错信息为英文的部分保留英文，以便与 JavaScript 生态一致；界面文案
在页面右上角切换 简体中文 / English。*
