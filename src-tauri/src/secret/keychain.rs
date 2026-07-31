use security_framework::passwords::*;

const SERVICE: &str = "cc.ssheasy.app";

/// 存储密码到 macOS Keychain
pub fn store_password(server_id: &str, password: &str) -> Result<(), String> {
    set_generic_password(SERVICE, server_id, password.as_bytes())
        .map_err(|e| format!("Keychain 写入失败: {}", e))
}

/// 从 Keychain 读取密码
pub fn get_password(server_id: &str) -> Result<Option<String>, String> {
    match get_generic_password(SERVICE, server_id) {
        Ok(bytes) => Ok(Some(String::from_utf8_lossy(&bytes).to_string())),
        Err(e) => {
            // errSecItemNotFound 表示没有存储过，不是错误
            let msg = e.to_string();
            if msg.contains("not be found") || msg.contains("-25300") {
                Ok(None)
            } else {
                Err(format!("Keychain 读取失败: {}", e))
            }
        }
    }
}

/// 从 Keychain 删除密码
pub fn delete_password(server_id: &str) -> Result<(), String> {
    delete_generic_password(SERVICE, server_id)
        .map_err(|e| format!("Keychain 删除失败: {}", e))
}

// ===== 私钥 passphrase（独立 account，避免与登录密码冲突）=====

fn keypass_account(server_id: &str) -> String {
    format!("keypass:{}", server_id)
}

/// 存储私钥 passphrase
pub fn store_key_passphrase(server_id: &str, passphrase: &str) -> Result<(), String> {
    set_generic_password(SERVICE, &keypass_account(server_id), passphrase.as_bytes())
        .map_err(|e| format!("Keychain 写入失败: {}", e))
}

/// 读取私钥 passphrase
pub fn get_key_passphrase(server_id: &str) -> Result<Option<String>, String> {
    match get_generic_password(SERVICE, &keypass_account(server_id)) {
        Ok(bytes) => Ok(Some(String::from_utf8_lossy(&bytes).to_string())),
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("not be found") || msg.contains("-25300") {
                Ok(None)
            } else {
                Err(format!("Keychain 读取失败: {}", e))
            }
        }
    }
}

/// 删除私钥 passphrase（不存在时静默成功）
pub fn delete_key_passphrase(server_id: &str) -> Result<(), String> {
    match delete_generic_password(SERVICE, &keypass_account(server_id)) {
        Ok(_) => Ok(()),
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("not be found") || msg.contains("-25300") {
                Ok(())
            } else {
                Err(format!("Keychain 删除失败: {}", e))
            }
        }
    }
}
