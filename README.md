# dsh-artifact-wall（会话产物面板）

对标 Workbuddy 的「会话产物」交互，给 DSH Web 界面补上三件事：

1. **每轮对话末尾的产物清单**——本轮写过/交付过的文件（`.sql`、`.cs`、`.json`、`.md`、插件目录里的文件都算），单个或多个都列出；
2. **点击即预览**——点文件在右侧栏直接打开（复用宿主的文件预览 tab），右键走宿主的文件右键菜单（打开/在文件夹中显示等）；
3. **「查看所有产物」入口**——每轮末尾的按钮，点开后右侧栏列出本会话已出现的全部产物，逐行可点。

## 数据来源

宿主内建的 `@deepseek-ai/dsh-client-ui-deliverables` 会在每个轮次的 Location 数据上发布 `deliverables`：

- `produced`：本轮成功的 `write` / `edit` 写入目标；
- `presented`：本轮 `present` 工具声明的交付文件。

本插件读取同一份投影，不重复解析工具调用，也不替换宿主任何注册项；只新增一个 turn-tail cell（`order: 60`）和一个右侧栏 tab 类型。因此：

- 禁用内建 deliverables 会让本插件失去数据源（本插件不依赖它的界面）；
- 本插件被禁用/卸载不会影响宿主原有功能。

## 实现要点

- **两处界面**：`conversation.chat.turnTail`（轮次末尾）与 `sidebar.right.pane.tab`（面板 body，key = `dsh-artifact-wall`）；面板地址 `dsh-resource://artifact-wall/<sessionId>`，由 `sidebarRightTabs.register` 认领（kind `artifact-wall`）。
- **会话级聚合**：turnTail 是 session scope 的 list slot，宿主不把「全部轮次」交给单个 cell，因此本插件用一个模块级 store（`Map<sessionId, {order, byPath}>`）在每轮渲染时登记产物，面板用 `useSyncExternalStore` 订阅同一份数据。
- **打开文件**：turnTail 能拿到宿主给的 `openFile(path)`，面板拿不到，所以 turnTail 渲染时把 `openFile` 登记到 `openers`，面板点击时复用它（与宿主文件卡片的打开路径完全一致）；极端情况回退到自建 `dsh-resource://file/session/<sid>/<path>` 地址。
- **右键菜单**：`useContextMenu().getTriggerProps({kind:'file', value:{sessionId, path}})`，与宿主 present 卡片同一套菜单。
- **不重复**：本轮若已用 `present` 交付（宿主会画 presented 卡片），本插件只保留「查看所有产物」按钮，不再重复列文件行。

## 文件

| 文件 | 作用 |
| --- | --- |
| `package.json` | 插件包声明：`main`（Host 半）、`exports["./client"]`、`dsh.client`（web / immediately）、`dsh.bundle.patch` |
| `cordis.patch.yml` | bundle patch：`insert` 一条 `dsh-artifact-wall` |
| `index.js` | Host 半，空实现（本插件不需要 Host 服务） |
| `client.js` | 浏览器半：store、turnTail、右侧栏面板、样式注入、文案 |
| `README.md` | 本文件 |

## 安装

已在 desktop profile 安装（`dsh.profile.bundles` 含 `dsh-artifact-wall`）。重装/给别的 profile 装：

```
plugin_manager install_bundle("D:\\工作\\22.Harness\\dsh-plugins\\dsh-artifact-wall")
```

装完**刷新页面**（Ctrl+R）即可，不需要重启 app。`node_modules/dsh-artifact-wall` 与源目录是同一份文件，改源码后刷新页面就生效。

## 启用 / 停用

- 启用：插件页确认 `dsh-artifact-wall` 为开启；
- 停用：插件页关掉该项，两处界面同时消失，不影响其他插件。

## 验收步骤

1. 新建会话，让助手在 `D:\工作\22.Harness\数据\` 下写一个 `demo.txt`。
2. 该轮回复末尾出现「本次产物 · 1 个文件」卡片，行内是 `demo.txt` + 所在目录；下面一行是「查看所有产物（1）›」。
3. 点 `demo.txt`：右侧栏打开该文件预览。
4. 右键 `demo.txt`：弹出宿主文件右键菜单（含「打开」「在文件夹中显示」等宿主提供的项）。
5. 再让助手写第二个文件；新一轮末尾显示 `2 个文件`，点「查看所有产物（2）›」：右侧栏出现「产物 2」列表，逐行可点、可预览。
6. 让助手用 `present` 交付文件：该轮由宿主 presented 卡片展示文件行，本插件只保留「查看所有产物」入口。
7. 找一轮**没有写文件**的回复（纯分析回答，或被中途停止的轮次）：末尾同样有淡色的「查看所有产物 ›」，点开是空列表 + 说明文案。

## 入口出现位置

- 每一轮助手回复结束后、该轮操作行（复制 / 点赞 / 用量）上方，固定一行「查看所有产物（N）›」。`N` 是本页已加载轮次的产物累计。
- 该轮有 `write` / `edit` 产物时，入口上方再多一张「本次产物」卡片（默认 4 行 + 「展开其余 N 个」）。
- 该轮走 `present` 交付时，文件行由宿主 presented 卡片负责，本插件只保留入口，避免重复。
- 该轮没有产物（纯对话、被停止、只有命令行写入）时，入口仍然渲染，样式更淡，文案为「查看所有产物」。
- 点击入口 = 在右侧栏打开 `dsh-resource://artifact-wall/<sessionId>`，即本会话产物总列表。

## 产物判定标准（2026-11-19 定稿）

**类型不设限**：任何扩展名都算产物，不做白名单，也不按类型过滤。

`.sql .py .cs .xlsx .xls .pdf .html .md .docx .pptx .txt .json .csv .xml .yaml .png .jpg .svg .zip .7z .log .ini .reg .bat .cmd .sh .ps1 .dll .exe` 一视同仁。

**判定只看来源**，只有登记过的写入才进列表：

| 来源 | 计入 | 说明 |
|---|---|---|
| `write` 工具写文件 | ✅ | 主路径 |
| `edit` 工具改文件 | ✅ | 主路径 |
| `str_replace_editor` | ✅ | 宿主兼容的旧工具名 |
| `present` 交付 | ✅ | 文件行走宿主卡片，本插件只留入口 |
| 命令行写文件（`>`、`cp`、`Out-File`、`--output` 等） | ❌ | 方案 B 曾评估实现，**用户决定不做** |
| 脚本内部改文件（`python x.py` 里 `open(path,'wb')`） | ❌ | 命令文本里没有目标路径，规则式解析不可靠 |
| 部署 / 编译 / 反编译等工具副作用 | ❌ | 无登记动作可依 |

**作业约定（A 方案，已生效）**：凡是要留给用户的项目文件，一律用 `write` / `edit` 落盘。必须保留 CRLF+BOM 的二进制场景（如金蝶 `.cs`），脚本改完后再用 `write` 写一份同内容登记，保证产物可见。

## 已知限制

- 面板只包含**本页已挂载过的轮次**的产物（DSH 的客户端投影按需求出，不缓存整段历史）；往上翻得越多，列表越全。
- 文件大小、修改时间不展示（宿主投影不携带这些字段）。
- 计数是「本页累计」，不是 Host 侧历史累计。

## 变更记录

- 0.1.1（2026-11-19）：入口固定化。删掉「本轮无产物就整块不渲染」的早退，改为**每轮都渲染入口按钮**；无产物轮次用淡色样式，点击打开空列表。修掉「被停止的轮次 / 纯分析轮次找不到入口」的问题。
- 0.1.0（2026-11-19）：首版。

## 运行记录

- 2026-11-19：`plugin_manager install_bundle` → `{stage:"enable", enabled:true, changed:true, application:"applied"}`。
- 2026-11-19：`Slots.listSubTree("conversation.chat.turnTail")` → occupants 含 `{id:"dsh-artifact-wall", order:60, active:true}`；`Slots.listSubTree("sidebar.right.pane.tab")` → occupants 含 `{key:"dsh-artifact-wall", active:true}`；页面 console 无本插件报错。
- 2026-11-19：`node --check` 通过（client.js / index.js）。界面视觉验收（卡片渲染、点击预览、右键、面板）按上文步骤执行。
- 2026-11-19：0.1.1 实测。MRP 会话（末尾轮被停止、整段无 write 产物）末尾出现淡色「查看所有产物 ›」；点击 → 右侧「产物 0」+ 口径说明文案。本会话有产物的轮次显示「查看所有产物（7）」+ 卡片，点行预览成功。
