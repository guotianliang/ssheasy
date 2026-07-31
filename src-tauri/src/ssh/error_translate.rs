use serde::Serialize;

/// 错误码，前端可据此做差异化展示
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    ConnectionRefused,
    AuthFailedPassword,
    AuthFailedKey,
    Timeout,
    HostKeyChanged,
    DnsResolveFailed,
    Unknown,
}

/// 翻译后的错误，直接给前端渲染
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslatedError {
    pub code: ErrorCode,
    pub human_msg: String,
    pub detail: String,
    pub suggestions: Vec<String>,
}

/// 将 SSH 原始错误翻译为人话 + 建议操作
pub fn translate(err: &str, host: &str, port: u16) -> TranslatedError {
    let lower = err.to_lowercase();

    if lower.contains("connection refused") {
        TranslatedError {
            code: ErrorCode::ConnectionRefused,
            human_msg: "连接被拒绝".into(),
            detail: format!("服务器 {}:{} 拒绝了连接请求", host, port),
            suggestions: vec![
                "检查服务器是否已开机".into(),
                format!("确认 SSH 端口是否为 {}（默认22）", port),
                "检查服务器防火墙是否放行了该端口".into(),
                "确认 SSH 服务(sshd)是否正在运行".into(),
            ],
        }
    } else if lower.contains("timed out") || lower.contains("timeout") {
        TranslatedError {
            code: ErrorCode::Timeout,
            human_msg: "连接超时".into(),
            detail: format!("无法在指定时间内连接到 {}:{}", host, port),
            suggestions: vec![
                "检查本机网络是否正常".into(),
                "确认 IP 地址/域名是否正确".into(),
                "服务器可能被防火墙静默丢包（不返回拒绝）".into(),
                "如果是云服务器，检查安全组规则".into(),
            ],
        }
    } else if lower.contains("permission denied") && lower.contains("publickey") {
        TranslatedError {
            code: ErrorCode::AuthFailedKey,
            human_msg: "密钥认证失败".into(),
            detail: "服务器拒绝了你的密钥".into(),
            suggestions: vec![
                "确认公钥已添加到服务器的 ~/.ssh/authorized_keys".into(),
                "检查私钥文件权限是否为 600（chmod 600）".into(),
                "确认使用的是正确的私钥文件".into(),
                "服务器可能禁用了密钥登录（检查 sshd_config）".into(),
            ],
        }
    } else if lower.contains("permission denied") || lower.contains("authentication failed") {
        TranslatedError {
            code: ErrorCode::AuthFailedPassword,
            human_msg: "密码错误或认证失败".into(),
            detail: format!("用户登录 {} 被拒绝", host),
            suggestions: vec![
                "确认密码是否正确（注意大小写）".into(),
                "确认用户名是否正确".into(),
                "服务器可能禁用了密码登录（只允许密钥）".into(),
                "检查账号是否被锁定（fail2ban）".into(),
            ],
        }
    } else if lower.contains("host key") || lower.contains("known_hosts") {
        TranslatedError {
            code: ErrorCode::HostKeyChanged,
            human_msg: "服务器指纹发生变化".into(),
            detail: "服务器的身份标识与之前记录的不一致".into(),
            suggestions: vec![
                "如果服务器重装过系统，这是正常的".into(),
                "删除 ~/.ssh/known_hosts 中对应行后重试".into(),
                "⚠️ 如果没有重装过，可能是中间人攻击，请谨慎".into(),
            ],
        }
    } else if lower.contains("resolve") || lower.contains("name or service not known") {
        TranslatedError {
            code: ErrorCode::DnsResolveFailed,
            human_msg: "无法解析主机名".into(),
            detail: format!("找不到主机 {}", host),
            suggestions: vec![
                "检查域名/IP 是否拼写正确".into(),
                "尝试直接使用 IP 地址连接".into(),
                "检查本机 DNS 设置".into(),
            ],
        }
    } else {
        TranslatedError {
            code: ErrorCode::Unknown,
            human_msg: "连接失败".into(),
            detail: err.to_string(),
            suggestions: vec![
                "检查网络连接".into(),
                "确认服务器信息（IP、端口、用户名）是否正确".into(),
            ],
        }
    }
}
