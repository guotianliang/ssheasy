import { useState, useEffect } from "react";
import { useServerStore } from "@/stores/useServerStore";
import { serverService } from "@/services/serverService";
import type { Server, ServerInput, TestResult } from "@/types/server";
import { isValidHost } from "@/types/server";
import { ErrorGuide } from "./ErrorGuide";

interface ServerFormModalProps {
  /** 编辑模式：传入要编辑的服务器；新增模式：不传 */
  server?: Server;
  onClose: () => void;
}

export function ServerFormModal({ server, onClose }: ServerFormModalProps) {
  const addServer = useServerStore((s) => s.addServer);
  const updateServer = useServerStore((s) => s.updateServer);
  const isEdit = !!server;

  const [step, setStep] = useState(1);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  /** 前端校验，返回错误文案；无错误返回 null。与后端 validate_server_input 保持一致。 */
  const validateForm = (): string | null => {
    const name = form.name.trim();
    const host = form.host.trim();
    if (!name && !host) return "请填写服务器名称或主机地址";
    if (!host) return "请填写主机地址（IP 或域名）";
    if (!isValidHost(host)) return "主机地址格式不正确（应为 IPv4/IPv6 或合法域名）";
    const port = parseInt(form.port);
    if (isNaN(port) || port < 1 || port > 65535) return "端口号需在 1-65535 之间";
    if (form.authType === "key" && !form.keyPath.trim())
      return "使用密钥认证时必须填写私钥路径";
    return null;
  };

  const [form, setForm] = useState({
    name: server?.name ?? "",
    host: server?.host ?? "",
    port: String(server?.port ?? 22),
    username: server?.username ?? "root",
    authType: (server?.authType ?? "password") as "password" | "key",
    password: "",
    keyPath: server?.keyPath ?? "",
    keyPassphrase: "",
    groupName: server?.groupName ?? "默认分组",
  });

  const buildInput = (): ServerInput => ({
    name: form.name || form.host,
    host: form.host,
    port: parseInt(form.port) || 22,
    username: form.username,
    authType: form.authType,
    keyPath: form.authType === "key" ? form.keyPath : undefined,
    groupName: form.groupName,
  });

  // 编辑模式下，密码留空 = 不修改原密码
  const passwordPayload = () =>
    form.authType === "password" && form.password ? form.password : undefined;
  const passphrasePayload = () =>
    form.authType === "key" && form.keyPassphrase ? form.keyPassphrase : undefined;

  const handleTest = async () => {
    const err = validateForm();
    if (err) {
      setFormError(err);
      return;
    }
    setTesting(true);
    setTestResult(null);
    setFormError(null);
    try {
      const result = await serverService.test(
        buildInput(),
        passwordPayload(),
        passphrasePayload()
      );
      setTestResult(result);
      if (result.success) setStep(2);
    } catch (e) {
      setTestResult({
        success: false,
        error: { code: "unknown", humanMsg: "测试失败", detail: String(e), suggestions: [] },
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    const err = validateForm();
    if (err) {
      setFormError(err);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (isEdit && server) {
        await updateServer(server.id, buildInput(), passwordPayload(), passphrasePayload());
      } else {
        await addServer(buildInput(), passwordPayload(), passphrasePayload());
      }
      onClose();
    } catch (e) {
      console.error("Save failed:", e);
    } finally {
      setSaving(false);
    }
  };

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Enter 提交（在 step 1 时触发测试连接）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !testing && !saving) {
        if (step === 1 && form.host) handleTest();
        else if (step === 2) handleSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, form, testing, saving]);

  const inputClass =
    "w-full px-3 py-2 rounded-lg text-helper text-primary outline-none placeholder-tertiary bg-base border border-border-subtle focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all duration-150";
  const labelClass = "text-label text-tertiary mb-1 block";
  const hintClass = "text-label text-disabled mt-1";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px] animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-96 rounded-xl p-5 shadow-2xl bg-surface border border-border-subtle animate-slide-in">
        <h3 className="text-title font-medium text-primary mb-4">
          {step === 2 ? "连接成功" : isEdit ? "编辑服务器" : "添加服务器"}
        </h3>

        {step === 1 && (
          <div className="space-y-3">
            <div>
              <label className={labelClass}>名称（可选，默认用IP）</label>
              <input
                className={inputClass}
                placeholder="我的VPS"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className={labelClass}>IP / 域名 *</label>
                <input
                  className={inputClass}
                  placeholder="192.168.1.100"
                  value={form.host}
                  onChange={(e) => setForm({ ...form, host: e.target.value })}
                />
              </div>
              <div className="w-20">
                <label className={labelClass}>端口</label>
                <input
                  className={inputClass}
                  placeholder="22"
                  value={form.port}
                  onChange={(e) => setForm({ ...form, port: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>用户名</label>
              <input
                className={inputClass}
                placeholder="root"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </div>
            <div>
              <label className={labelClass}>登录方式</label>
              <div className="flex gap-2">
                <button
                  className={`flex-1 py-1.5 rounded-lg text-helper transition-all duration-150 ${
                    form.authType === "password"
                      ? "bg-accent text-white"
                      : "bg-elevated text-tertiary hover:text-secondary"
                  }`}
                  onClick={() => setForm({ ...form, authType: "password" })}
                >
                  密码
                </button>
                <button
                  className={`flex-1 py-1.5 rounded-lg text-helper transition-all duration-150 ${
                    form.authType === "key"
                      ? "bg-accent text-white"
                      : "bg-elevated text-tertiary hover:text-secondary"
                  }`}
                  onClick={() => setForm({ ...form, authType: "key" })}
                >
                  密钥
                </button>
              </div>
            </div>
            {form.authType === "password" ? (
              <div>
                <label className={labelClass}>密码</label>
                <input
                  className={inputClass}
                  type="password"
                  placeholder={isEdit ? "留空 = 不修改" : "••••••••"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                {isEdit && <div className={hintClass}>不填写则保留原密码</div>}
              </div>
            ) : (
              <>
                <div>
                  <label className={labelClass}>私钥文件路径</label>
                  <input
                    className={inputClass}
                    placeholder="~/.ssh/id_rsa"
                    value={form.keyPath}
                    onChange={(e) => setForm({ ...form, keyPath: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass}>密钥密码（无加密可留空）</label>
                  <input
                    className={inputClass}
                    type="password"
                    placeholder={isEdit ? "留空 = 不修改" : "••••••••"}
                    value={form.keyPassphrase}
                    onChange={(e) => setForm({ ...form, keyPassphrase: e.target.value })}
                  />
                  {isEdit && <div className={hintClass}>不填写则保留原密钥密码</div>}
                </div>
              </>
            )}
            <div>
              <label className={labelClass}>分组</label>
              <input
                className={inputClass}
                placeholder="默认分组"
                value={form.groupName}
                onChange={(e) => setForm({ ...form, groupName: e.target.value })}
              />
            </div>

            {/* 表单校验错误 */}
            {formError && (
              <div className="text-label text-danger bg-danger-soft border border-danger/20 rounded-md px-2.5 py-1.5 animate-fade-in">
                {formError}
              </div>
            )}

            {/* 错误引导 */}
            {testResult && !testResult.success && testResult.error && (
              <ErrorGuide error={testResult.error} />
            )}

            <div className="flex gap-2 pt-2">
              <button
                className="flex-1 py-2 rounded-lg text-helper text-secondary bg-elevated border border-border-subtle hover:text-primary transition-colors"
                onClick={onClose}
              >
                取消
              </button>
              <button
                className="flex-1 py-2 rounded-lg text-helper text-secondary bg-elevated border border-border-subtle hover:text-primary transition-colors disabled:opacity-40"
                disabled={!form.host || saving}
                onClick={handleSave}
                title="跳过测试直接保存"
              >
                {saving ? "保存中..." : "直接保存"}
              </button>
              <button
                className="flex-1 py-2 rounded-lg text-helper font-medium text-white bg-accent hover:bg-accent-hover transition-colors disabled:opacity-40"
                disabled={!form.host || testing}
                onClick={handleTest}
              >
                {testing ? "测试中..." : "测试连接"}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="text-center py-4 animate-fade-in">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-success-soft border border-success/20 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                <path d="M3 8L6.5 11.5L13 4.5" stroke="var(--success)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="text-helper text-secondary mb-4">连接测试通过，保存后即可使用</div>
            <div className="flex gap-2">
              <button
                className="flex-1 py-2 rounded-lg text-helper text-secondary bg-elevated border border-border-subtle hover:text-primary transition-colors"
                onClick={() => setStep(1)}
              >
                返回修改
              </button>
              <button
                className="flex-1 py-2 rounded-lg text-helper font-medium text-white bg-accent hover:bg-accent-hover transition-colors disabled:opacity-40"
                disabled={saving}
                onClick={handleSave}
              >
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** 兼容旧名称 */
export const AddServerWizard = ServerFormModal;
