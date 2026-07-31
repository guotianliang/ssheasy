import { useState } from "react";
import { useServerStore } from "@/stores/useServerStore";
import { serverService } from "@/services/serverService";
import type { Server, ServerInput, TestResult } from "@/types/server";
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
    setTesting(true);
    setTestResult(null);
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
    setSaving(true);
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

  const inputClass =
    "w-full px-3 py-2 rounded-lg text-xs text-gray-200 outline-none focus:border-indigo-500 transition-colors bg-[#0d0d14] border border-[#252530]";
  const labelClass = "text-[11px] text-gray-500 mb-1 block";
  const hintClass = "text-[10px] text-gray-600 mt-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-96 rounded-xl p-5 shadow-2xl bg-[#1e1e2e] border border-[#333]">
        <h3 className="text-sm font-semibold text-gray-200 mb-4">
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
                  className={`flex-1 py-1.5 rounded-lg text-xs transition-colors ${
                    form.authType === "password"
                      ? "bg-indigo-600 text-white"
                      : "bg-[#2a2a3a] text-gray-400"
                  }`}
                  onClick={() => setForm({ ...form, authType: "password" })}
                >
                  密码
                </button>
                <button
                  className={`flex-1 py-1.5 rounded-lg text-xs transition-colors ${
                    form.authType === "key"
                      ? "bg-indigo-600 text-white"
                      : "bg-[#2a2a3a] text-gray-400"
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

            {/* 错误引导 */}
            {testResult && !testResult.success && testResult.error && (
              <ErrorGuide error={testResult.error} />
            )}

            <div className="flex gap-2 pt-2">
              <button
                className="flex-1 py-2 rounded-lg text-xs text-gray-400 bg-[#2a2a3a] hover:text-gray-200 transition-colors"
                onClick={onClose}
              >
                取消
              </button>
              <button
                className="flex-1 py-2 rounded-lg text-xs text-gray-300 bg-[#2a2a3a] hover:bg-[#34344a] transition-colors disabled:opacity-40"
                disabled={!form.host || saving}
                onClick={handleSave}
                title="跳过测试直接保存"
              >
                {saving ? "保存中..." : "直接保存"}
              </button>
              <button
                className="flex-1 py-2 rounded-lg text-xs font-medium text-white transition-colors disabled:opacity-40"
                style={{ background: form.host ? "#6366f1" : "#333" }}
                disabled={!form.host || testing}
                onClick={handleTest}
              >
                {testing ? "测试中..." : "测试连接"}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="text-center py-4">
            <div className="text-green-400 text-2xl mb-2">✓</div>
            <div className="text-xs text-gray-400 mb-4">连接测试通过，保存后即可使用</div>
            <div className="flex gap-2">
              <button
                className="flex-1 py-2 rounded-lg text-xs text-gray-400 bg-[#2a2a3a]"
                onClick={() => setStep(1)}
              >
                返回修改
              </button>
              <button
                className="flex-1 py-2 rounded-lg text-xs font-medium text-white bg-green-600 hover:bg-green-500 disabled:opacity-40"
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
