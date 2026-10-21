# SSHEasy

轻量的 macOS SSH / SFTP 桌面客户端，使用 Tauri 2、React 和 Rust 构建。MIT 开源。

**v0.1.1 是 macOS 首版候选版本。** 连接、终端和文件操作直接访问实际服务器；没有演示服务器或模拟成功的交互。尚未完成 Apple Developer ID 签名、公证和广泛兼容性验证，请先在测试环境使用。

## 功能

- 服务器配置的新增、编辑、删除、分组与搜索；支持 IPv4、IPv6、域名、密码和私钥认证。
- OpenSSH / PKCS#8 私钥；老式加密 PEM 通过系统 `openssl` 在内存中解密。
- 首次连接和测试连接均核对主机指纹；指纹变化再次确认，可仅信任本次或保存。
- 多服务器终端、断线提示、手动重连、调整窗口大小、复制粘贴和终端搜索。
- 分类快捷命令、自定义命令编辑、`{{变量}}` 模板、按服务器保存最近命令、路径书签。
- SFTP 复用当前终端连接：目录浏览、文本预览与搜索、新建目录、上传、下载、重命名、递归删除。
- 上传下载按 64 KiB 分块处理，进度来自实际传输字节。下载完成后才替换本地文件；上传覆盖会先保留旧文件，再替换目标。
- 快捷命令发送与成功的文件修改 / 传输操作写入本地日志；支持筛选、搜索、JSON 导出及保留期清理。
- 默认浅色主题、14 px 终端字体；可设置深色主题、字号、光标、滚动行数与日志保留天数。
- 密码与私钥口令保存在 macOS 钥匙串，服务器、命令、书签、设置和日志保存在本地 SQLite。

## 使用

从本项目实际发布的版本获取与你 Mac 架构相符的安装包，或按下文从源码构建。当前仓库不提供在线演示。

1. 点击左侧 **+**，填写主机、端口和用户名，选择密码或私钥文件。私钥口令是解密私钥的口令。
2. 可以先测试连接，再保存。首次连接请向服务器管理员核对 SHA256 指纹。
3. 点击服务器建立终端；顶部可切换 **终端 / 文件 / 日志**。
4. 快捷命令单击填入终端，点执行图标发送；含变量的命令先填变量。命令中的变量按原样替换，请检查最终命令和引号。
5. 文件单击选中、双击打开目录或预览支持的文本。预览仅支持 UTF-8，最大 10 MiB。

**钥匙串弹窗要什么密码？** macOS 询问“登录”钥匙串密码时，通常输入你解锁 Mac 的登录密码。它不是服务器密码。如果曾单独修改过钥匙串密码，则使用钥匙串自己的密码。开发过程中更换二进制或签名可能再次出现授权弹窗；只为你信任的构建授权。

| 快捷键 | 功能 |
| --- | --- |
| `⌘F` | 搜索当前终端输出 |
| `⌘K` | 搜索快捷命令 |
| `⌘,` | 打开设置 |
| `⌘C` / `⌘V` | 复制终端选区 / 粘贴 |

## 从源码运行

需要 macOS、Node.js 22.12+（`.nvmrc` 使用 22）、Rust stable、Xcode Command Line Tools。应用声明最低 macOS 11；本次本地验证环境为 macOS 15.5 / Apple Silicon，最低版本和 Intel 的实际运行仍需相应机器验证。

```bash
npm ci
npm run tauri dev
```

`npm run dev` 仅启动前端开发服务器；浏览器不能建立 SSH 连接，需要通过 Tauri 桌面窗口运行。

```bash
npm run tauri build -- --bundles app,dmg
```

安装包位于 `src-tauri/target/release/bundle/`。构建默认只包含本机架构。签名、公证和发布说明见 [发布文档](docs/release.md)。

## 验证

```bash
npm run check
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
npm run test:rust

python3 -m venv .venv
.venv/bin/pip install -r tests/requirements.txt
npm run test:integration
```

集成测试会在 `127.0.0.1` 随机端口启动真实 SSH / SFTP 服务，使用临时生成的密钥和目录，不需要你的服务器或凭据。覆盖密码 / 加密私钥认证、shell 通道、尺寸请求、共享连接 SFTP、上传下载字节校验、覆盖、重命名与符号链接删除边界。更多细节见 [测试文档](docs/testing.md)。CI 配置同时覆盖 macOS ARM 和 Intel；只有实际运行成功的记录才代表对应平台已验证。

## 数据和范围

应用数据位于 `~/Library/Application Support/cc.ssheasy.app/`，包括 `ssheasy.db` 与应用专用的 `known_hosts`。这个指纹文件的格式是 `host port public-key`，不读取或修改 `~/.ssh/known_hosts`。卸载应用不会自动删除数据或钥匙串项目。

数据库与导出的日志**可能包含命令参数、服务器地址及敏感内容**，并非加密保险箱。默认保留日志和最近命令 30 天，启动或保存设置时清理；删除服务器会同时删除其书签和日志。具体边界见 [安全说明](SECURITY.md)。

本版不包含 ProxyJump 中转连接、端口转发、自动恢复会话、终端录像回放、文件夹批量传输、远程文件编辑或 Windows / Linux 支持；可以直接 SSH 登录跳板机本身。内置命令主要针对 Linux，是否可用取决于远程系统与权限。风险提示使用规则匹配，不是命令安全沙箱。部分旧设备算法兼容项仍保留，建议使用现代 SSH 服务。

欢迎通过 Issue 提供脱敏后的问题与复现步骤，通过 PR 参与开发。见 [贡献指南](CONTRIBUTING.md)、[更新记录](CHANGELOG.md) 和 [MIT 许可证](LICENSE)。
