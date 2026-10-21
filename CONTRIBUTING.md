# 贡献指南

欢迎参与 SSHEasy。首版目标是稳定、可用的 macOS SSH / SFTP 客户端。

## 开始开发

1. 阅读 README 与 SECURITY.md，在 macOS 安装 Node.js 22.12+、Rust stable 和 Xcode Command Line Tools。
2. 执行 `npm ci` 和 `npm run tauri dev`。前端位于 `src/`，Rust 后端位于 `src-tauri/src/`，SQLite 迁移位于 `src-tauri/migrations/`。
3. 为问题开分支；现有用户数据迁移必须向后兼容，增加迁移文件，不重写已经发布的迁移。
4. 提交 PR，说明触发场景、最终行为、验证结果与已知限制。UI 改动附脱敏截图。

## 检查

提交前运行 README 的前端构建、测试、Rust fmt / clippy / 测试。连接层和文件操作变更还应运行真实 SSH 集成测试，步骤见 [docs/testing.md](docs/testing.md)。

新增按钮必须连接实际功能，异步请求应显示实际结果和错误。不要加入假服务器、假进度或静默成功的占位实现。新的网络请求、系统权限或依赖请说明用途。

## 反馈与安全

Issue 请包含 macOS / CPU 架构、应用版本、复现步骤、期望与实际行为。公开内容需要脱敏，不附真实凭据或完整数据库。漏洞报告遵循 [SECURITY.md](SECURITY.md)。

讨论聚焦问题和代码，尊重其他贡献者。提交代码表示你有权以本项目 MIT 许可证提供该贡献。
