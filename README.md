# SSHEasy

> 小白都能用的 SSH 客户端 · macOS 桌面应用

一个用 Tauri 2 + React + Rust 构建的轻量 SSH 工具。目标是把「连服务器执行命令」这件事做到最简单：填个 IP 和密码就能连，常用命令点一下就能执行。

## 特性

- **极简连接**：填 IP / 用户名 / 密码即可，支持密码与私钥两种登录方式
- **加密私钥支持**：兼容 OpenSSH / PKCS#8 新格式，以及 OpenSSL 老式加密 PEM（`Proc-Type: 4,ENCRYPTED`，自动调用系统 openssl 解密）
- **老服务器兼容**：内置 legacy KEX / host key 算法（dh-group14-sha1、ssh-rsa 等），能连老旧设备
- **多终端 Tab**：每台连接独立终端实例，切换不丢历史，断线自动感知并提供一键重连
- **快捷命令面板**：内置常用命令（查看 / 搜索 / 编辑文件 / 退出等），支持自定义命令与 `{{变量}}` 模板，单击填入、双击直接执行
- **安全存储**：密码与私钥 passphrase 存入 macOS Keychain，不落数据库
- **错误引导**：连接失败时给出人话解释 + 可操作建议，而不是冷冰冰的报错

## 技术栈

| 层 | 技术 |
| --- | --- |
| 桌面框架 | Tauri 2.0 |
| 前端 | React 18 + TypeScript + Vite 6 + Zustand + Tailwind CSS |
| 终端渲染 | xterm.js |
| SSH | russh 0.49（纯 Rust 异步实现） |
| 持久化 | SQLite（rusqlite） |
| 密钥存储 | macOS Keychain（security-framework） |

## 项目结构

```
ssheasy/
├── src/                    # 前端 React
│   ├── components/         # UI 组件（connection / terminal / commands / layout）
│   ├── stores/             # Zustand 状态
│   ├── services/           # Tauri invoke 封装
│   ├── hooks/              # 事件监听等
│   └── types/              # 共享类型
└── src-tauri/              # Rust 后端
    ├── src/ssh/            # SSH 连接 / 会话管理 / 错误翻译
    ├── src/storage/        # SQLite 仓储
    ├── src/secret/         # Keychain 封装
    └── src/commands/       # Tauri IPC 命令
```

## 开发

前置：Node.js ≥ 20、Rust（rustup）、Xcode Command Line Tools。

```bash
npm install
npm run tauri dev
```

## 打包

```bash
npm run tauri build
```

产物位于 `src-tauri/target/release/bundle/`（`.app` 与 `.dmg`）。

## 路线图

- [ ] 完整应用图标（.icns / .ico）
- [ ] 设置页（字体 / 主题 / 默认终端尺寸）
- [ ] known_hosts 主机指纹校验
- [ ] 会话日志查看 / 回放
- [ ] Windows / Linux 跨平台支持
- [ ] SFTP 文件浏览

## License

[MIT](./LICENSE)
