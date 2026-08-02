/// 事件名常量，前后端共用
pub const TERMINAL_OUTPUT: &str = "terminal:output";
pub const CONNECTION_STATUS: &str = "connection:status";
pub const CONNECTION_ERROR: &str = "connection:error";
/// Host Key 验证询问（前端弹窗用）
pub const HOSTKEY_VERIFY: &str = "hostkey:verify";
/// 终端状态栏信息（user@host:路径）
pub const SESSION_STATUS: &str = "session:status";
/// SFTP 传输进度（下载流式写入本地时推送）
pub const SFTP_PROGRESS: &str = "sftp:progress";
