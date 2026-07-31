use rusqlite::params;
use serde::{Deserialize, Serialize};

use super::database::Database;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandTemplate {
    pub id: String,
    pub category: String,
    pub cmd: String,
    pub description: Option<String>,
    pub is_builtin: bool,
    pub sort_order: i32,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandInput {
    pub category: String,
    pub cmd: String,
    pub description: Option<String>,
}

impl Database {
    pub fn list_commands(&self) -> Result<Vec<CommandTemplate>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, category, cmd, description, is_builtin, sort_order, created_at FROM commands ORDER BY category, sort_order",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(CommandTemplate {
                id: row.get(0)?,
                category: row.get(1)?,
                cmd: row.get(2)?,
                description: row.get(3)?,
                is_builtin: row.get::<_, i32>(4)? != 0,
                sort_order: row.get(5)?,
                created_at: row.get(6)?,
            })
        })?;
        rows.collect()
    }

    pub fn insert_command(&self, input: &CommandInput, is_builtin: bool) -> Result<CommandTemplate, rusqlite::Error> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        self.conn.execute(
            "INSERT INTO commands (id, category, cmd, description, is_builtin, sort_order, created_at) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6)",
            params![id, input.category, input.cmd, input.description, is_builtin as i32, now],
        )?;
        Ok(CommandTemplate {
            id,
            category: input.category.clone(),
            cmd: input.cmd.clone(),
            description: input.description.clone(),
            is_builtin,
            sort_order: 0,
            created_at: now,
        })
    }

    pub fn update_command(&self, id: &str, input: &CommandInput) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "UPDATE commands SET category=?2, cmd=?3, description=?4 WHERE id=?1",
            params![id, input.category, input.cmd, input.description],
        )?;
        Ok(())
    }

    pub fn delete_command(&self, id: &str) -> Result<(), rusqlite::Error> {
        self.conn.execute("DELETE FROM commands WHERE id = ?1 AND is_builtin = 0", params![id])?;
        Ok(())
    }

    /// 首次启动时插入内置命令
    pub fn seed_builtin_commands(&self) -> Result<(), rusqlite::Error> {
        let count: i32 = self.conn.query_row(
            "SELECT COUNT(*) FROM commands WHERE is_builtin = 1",
            [],
            |row| row.get(0),
        )?;
        if count > 0 {
            return Ok(());
        }

        let builtins: Vec<(&str, &str, &str)> = vec![
            ("文件操作", "ls -lah", "列出所有文件(含隐藏)"),
            ("文件操作", "cd /path", "切换目录"),
            ("文件操作", "cat {{文件路径}}", "查看文件内容"),
            ("文件操作", "tail -f {{日志路径}}", "实时追踪日志"),
            ("文件操作", "head -n 50 {{文件路径}}", "查看文件前50行"),
            ("文件操作", "cp -r {{源路径}} {{目标路径}}", "复制文件/目录"),
            ("文件操作", "mv {{旧名称}} {{新名称}}", "移动/重命名"),
            ("文件操作", "mkdir -p {{目录路径}}", "创建目录"),
            ("搜索查找", "grep -rn '{{关键字}}' .", "全文搜索关键字"),
            ("搜索查找", "find / -name '{{文件名}}'", "按名称查找文件"),
            ("搜索查找", "which {{命令名}}", "查找命令位置"),
            ("编辑文件", "vim {{文件路径}}", "Vim编辑"),
            ("编辑文件", "nano {{文件路径}}", "Nano编辑(更简单)"),
            ("编辑文件", "sed -i 's/{{旧文本}}/{{新文本}}/g' {{文件路径}}", "批量替换文本"),
            ("编辑文件", "echo '{{内容}}' >> {{文件路径}}", "追加内容到文件"),
            ("系统信息", "top -bn1 | head -20", "查看进程/CPU"),
            ("系统信息", "df -h", "磁盘使用情况"),
            ("系统信息", "free -h", "内存使用情况"),
            ("系统信息", "uname -a", "系统版本信息"),
            ("系统信息", "uptime", "运行时间和负载"),
            ("系统信息", "ps aux | grep {{进程名}}", "查看指定进程"),
            ("网络", "curl -I {{URL}}", "测试HTTP连接"),
            ("网络", "ping -c 4 {{目标地址}}", "测试网络连通"),
            ("网络", "netstat -tlnp", "查看端口监听"),
            ("网络", "ip addr show", "查看IP地址"),
            ("服务管理", "systemctl status {{服务名}}", "查看服务状态"),
            ("服务管理", "systemctl restart {{服务名}}", "重启服务"),
            ("服务管理", "docker ps -a", "查看容器列表"),
            ("服务管理", "exit", "退出当前会话"),
        ];

        for (category, cmd, desc) in builtins {
            self.insert_command(
                &CommandInput {
                    category: category.to_string(),
                    cmd: cmd.to_string(),
                    description: Some(desc.to_string()),
                },
                true,
            )?;
        }
        Ok(())
    }
}
