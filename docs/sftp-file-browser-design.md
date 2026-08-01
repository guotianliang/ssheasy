# SFTP 可视化文件浏览 · 方案设计

> 状态：待评审 · 作者：QoderWork · 日期：2026-08-01

## 1. 背景与目标

小白用户连上服务器后最大的焦虑之一是「**看不见服务器里有什么**」——只能靠 `ls` 一层层敲、`cd` 一个个进，传文件更是要背 `scp` 命令。这是 FinalShell / Xshell 相对我们目前最大的优势项。

目标：让小白**用鼠标就能浏览服务器文件、进出目录、（进阶）上传下载**，不再依赖记忆命令。

非目标（本期不做）：在线编辑大文件、文件 diff、批量任务队列、断点续传。

## 2. 关键决策：交互形态（需拍板）

文件浏览器放在哪、怎么切换，决定了整体布局结构，**定错后期返工成本高**。三个候选：

### 方案 A：右侧面板内嵌（与命令面板共存）

把文件浏览器做成右侧栏的一个 Tab，和「快捷命令」并列切换。

- 优点：不动现有三栏布局，改动最小；浏览文件时仍能随时看命令面板。
- 缺点：右侧栏只有 240px 宽，文件列表（名称+大小+时间）会很挤；和命令面板抢空间。
- 适合：轻量浏览，不适合传输进度展示。

### 方案 B：中间区域「终端 / 文件」双视图切换（推荐）

中间主区域顶部加视图切换：`终端` | `文件`。切到「文件」时，主区域变成全宽的文件浏览器（面包屑 + 列表 + 操作栏），终端在后台保持运行不销毁。

- 优点：空间充足（主区域宽度），文件列表舒展，能放传输进度条；终端与文件浏览互不干扰；符合 FinalShell / WinSCP 用户心智。
- 缺点：改动涉及主区域布局，工作量中等；需要管理「当前视图」状态。
- 适合：要长期演进成产品级文件管理，这是最可扩展的形态。

### 方案 C：独立窗口 / 抽屉

文件浏览器作为可拖出的独立窗口或底部抽屉。

- 优点：可同时看终端和文件。
- 缺点：Tauri 多窗口管理复杂，状态同步麻烦；对小白反而增加认知负担。**不推荐**。

**我的推荐：方案 B。** 理由是空间利用率和可扩展性最好，且与你「架构稳定、避免返工」的诉求一致——一次把主区域做成可切换视图，后续 AI 面板、会话日志等都能复用这套视图机制。

## 3. 技术架构

### 3.1 后端（Rust）

russh-sftp 2.3.0 已在依赖树（russh 传递依赖），无需新增 crate。

**会话管理**：SFTP 需要独立的 SSH channel（`channel_open_session` + `request_subsystem("sftp")`），与现有 shell channel 分开。设计 `SftpManager`：

```
AppState
├── ssh_manager: ConnectionManager   (现有, shell 会话)
└── sftp_manager: SftpManager        (新增, 按 server_id 缓存 SftpSession)
```

- 懒加载：第一次打开文件视图时才为该 server 建立 SFTP 会话，复用 `ConnectConfig`（含密钥 fallback）。
- 生命周期：跟随服务器连接，断开时一并清理。
- 每个 SftpSession 由独立 tokio task 持有，对外暴露 `Arc`，命令层通过它调用 `read_dir` 等。

**新增 Tauri 命令**（`commands/sftp_cmds.rs`）：

| 命令 | 入参 | 说明 |
| --- | --- | --- |
| `sftp_list_dir` | server_id, path | 返回条目列表（名称/大小/mtime/类型/权限） |
| `sftp_home` | server_id | 返回默认家目录（canonicalize(".")） |
| `sftp_mkdir` | server_id, path | 新建文件夹（进阶） |
| `sftp_remove` | server_id, path, is_dir | 删除（进阶，带前端二次确认） |
| `sftp_rename` | server_id, old, new | 重命名（进阶） |
| `sftp_download` | server_id, remote, local | 下载到本地（进阶，大文件流式 + 进度事件） |
| `sftp_upload` | server_id, local, remote | 上传（进阶） |

**数据类型**：

```rust
struct FileEntry {
    name: String,
    path: String,        // 绝对路径
    is_dir: bool,
    is_symlink: bool,
    size: u64,
    modified: String,    // 格式化时间
    permissions: String, // 如 "drwxr-xr-x"
}
```

### 3.2 前端（React）

- `types/sftp.ts`：FileEntry 等类型
- `services/sftpService.ts`：invoke 封装
- `stores/useSftpStore.ts`：当前 server 的路径栈、条目列表、加载态、视图模式（terminal/files）
- `components/files/FileBrowser.tsx`：面包屑 + 工具栏（刷新/新建/上传）+ 文件表格
- `components/files/FileRow.tsx`：单行，双击进入 / 下载，右键菜单（进阶）
- 主区域改造：`TerminalPanel` 外层包一个视图切换容器

### 3.3 边界与坑

- **符号链接**：`read_dir` 返回的可能是 symlink，需 `symlink_metadata` 区分，避免点进去报错。
- **权限不足**：`read_dir` 失败时翻译成人话（复用 `error_translate`）。
- **大目录**：上千条目时前端做虚拟滚动或分页（MVP 先硬渲染，超 500 条提示）。
- **大文件传输**：必须流式（`File` + 分块 read/write），不能一次性 `read` 进内存；进度通过 Tauri event 推送。
- **路径编码**：中文路径需 UTF-8 处理。

## 4. 分期任务拆解

### Phase 2a · MVP 浏览（约 1～1.5 天）

1. SftpManager + 会话懒加载（2h）
2. `sftp_list_dir` / `sftp_home` 命令（2h）
3. 主区域视图切换容器（terminal/files）（2h）
4. FileBrowser 面板：面包屑 + 列表 + 双击进入 + 上级 + 刷新（4h）
5. 联调 + 边界（symlink/权限/空目录）（2h）

**验收**：能浏览任意目录、进出文件夹、看到大小和时间。

### Phase 2b · 传输（约 1～1.5 天）

6. `sftp_download` + 保存对话框 + 进度条（4h）
7. `sftp_upload` + 文件选择 + 进度（5h）
8. 大文件分块 + 取消（3h）

**验收**：能上传下载文件，大文件有进度、可取消。

### Phase 2c · 产品级（约 2～3 天）

9. 文件操作：新建/重命名/删除（带确认）
10. 右键菜单、排序、隐藏文件开关、复制路径
11. 文本小文件在线预览
12. 多服务器浏览状态独立

## 5. 风险

- **russh-sftp 与现有 russh 0.49 的版本兼容**：需在动手前先写个最小连通 demo 验证（0.5h），避免 API 不匹配返工。
- **视图切换的终端保活**：切到文件视图时 xterm 实例不能销毁（现有 per-session Map 已支持 show/hide，风险低）。
- **传输稳定性**：网络抖动下大文件传输可能中断，MVP 不做断点续传，需明确告知用户。

## 6. 待确认问题

1. 交互形态选 A / B / C？（推荐 B）
2. MVP 是否只做浏览，传输放 2b？（推荐是）
3. 文件视图是否需要和路径书签联动（浏览到某目录可一键收藏）？
