# macOS 发布

## 本地打包

在完成 [测试](testing.md) 后执行：

```bash
npm ci
npm run tauri build -- --bundles app,dmg
```

输出位于 `src-tauri/target/release/bundle/macos/SSHEasy.app` 与 `src-tauri/target/release/bundle/dmg/`。默认构建本机 CPU 架构；若使用 Intel 或 Universal 构建，请在对应机器上完成连接与文件操作验收，不能只凭配置声明已支持。

`npm run tauri build -- --debug --bundles app` 用于快速检查安装包，开发构建不作为正式发布产物。

## 版本与签名

版本同时维护在 `package.json` / `package-lock.json`、`src-tauri/Cargo.toml` / `Cargo.lock` 和 `src-tauri/tauri.conf.json`。整理 CHANGELOG，确认文档描述的功能确实可用。

当前源码不包含 Apple Developer ID 证书、公证凭据或自动更新密钥。没有这些凭据的构建不具备 Developer ID 身份与公证，macOS 可能阻止打开。不要通过关闭 Gatekeeper 或删除安全属性作为正式安装流程。

正式分发需由维护者配置自己的 Developer ID 签名、公证与 stapling，使用 `codesign --verify --deep --strict --verbose=2`、`spctl --assess --type execute --verbose=2` 和 `xcrun stapler validate` 检查实际产物。具体账号配置参考 [Tauri macOS 签名文档](https://v2.tauri.app/distribute/sign/macos/)。

签名身份及应用标识影响钥匙串访问。当前标识 `cc.ssheasy.app` 为现有用户的数据目录和访问身份，虽然以 `.app` 结尾会触发打包提示，首版不会无迁移地改名。未来修改需同时考虑数据目录、指纹记录及钥匙串迁移。

## 发布记录

在 GitHub Releases 上传实际构建的包，列出 macOS 最低版本、CPU 架构、签名 / 公证状态、功能范围和已知问题，并附校验和：

```bash
shasum -a 256 src-tauri/target/release/bundle/dmg/*.dmg
```

发布前在未安装开发工具的目标 Mac 上完成安装、启动和基础工作流验收。发布源码不会自动创建 Release 或上传二进制；当前 CI 仅执行检查，不使用发布凭据。
