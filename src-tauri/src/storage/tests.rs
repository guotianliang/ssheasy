use super::{database::Database, server_repo::ServerInput};
use crate::commands::settings_cmds::Settings;
use std::path::Path;
fn input(host: &str) -> ServerInput {
    ServerInput {
        name: "test".into(),
        host: host.into(),
        port: Some(22),
        username: None,
        auth_type: "password".into(),
        key_path: None,
        group_name: None,
        color: None,
    }
}
#[test]
fn migrations_are_repeatable_and_seeds_are_idempotent() {
    let db = Database::open(Path::new(":memory:")).unwrap();
    db.seed_builtin_commands().unwrap();
    let count = db.list_commands().unwrap().len();
    db.seed_builtin_commands().unwrap();
    assert_eq!(db.list_commands().unwrap().len(), count);
    assert!(count > 20);
    assert_eq!(
        db.conn
            .query_row("SELECT MAX(version) FROM schema_version", [], |r| r
                .get::<_, u32>(0))
            .unwrap(),
        5
    );
}
#[test]
fn server_input_is_validated_and_normalized() {
    let db = Database::open(Path::new(":memory:")).unwrap();
    for host in ["", "999.999.999.999", "::bad::", "-bad.com", "http://host"] {
        assert!(db.insert_server(&input(host)).is_err(), "{host}");
    }
    for host in ["127.0.0.1", "::1", "example.com", "localhost"] {
        assert!(db.insert_server(&input(host)).is_ok(), "{host}");
    }
    let server = db.insert_server(&input("  example.org  ")).unwrap();
    assert_eq!(server.host, "example.org");
    let mut invalid = input("host");
    invalid.port = Some(0);
    assert!(db.insert_server(&invalid).is_err());
    invalid.port = Some(22);
    invalid.auth_type = "key".into();
    assert!(db.insert_server(&invalid).is_err());
}
#[test]
fn recent_commands_are_isolated_capped_and_deduplicated() {
    let mut db = Database::open(Path::new(":memory:")).unwrap();
    let a = db.insert_server(&input("a")).unwrap();
    let b = db.insert_server(&input("b")).unwrap();
    db.touch_recent_command(&b.id, "keep").unwrap();
    for i in 0..40 {
        db.touch_recent_command(&a.id, &format!("echo {i}"))
            .unwrap();
    }
    db.touch_recent_command(&a.id, "echo 39").unwrap();
    assert_eq!(db.list_recent_commands(&a.id, 100).unwrap().len(), 30);
    assert_eq!(
        db.list_recent_commands(&b.id, 100).unwrap()[0].command,
        "keep"
    );
    db.delete_server(&a.id).unwrap();
    assert!(db.list_recent_commands(&a.id, 100).unwrap().is_empty());
}
#[test]
fn settings_round_trip_and_retention() {
    let db = Database::open(Path::new(":memory:")).unwrap();
    let mut settings = db.load_settings().unwrap();
    assert_eq!(settings.font_size, 14);
    settings.font_size = 18;
    settings.theme = "light".into();
    db.save_settings(&settings).unwrap();
    assert_eq!(db.load_settings().unwrap().font_size, 18);
    settings.font_size = 100;
    assert!(db.save_settings(&settings).is_err());
    assert_eq!(db.load_settings().unwrap().font_size, 18);
    let server = db.insert_server(&input("a")).unwrap();
    db.insert_log(&server.id, "now", "low").unwrap();
    db.conn.execute("INSERT INTO logs(server_id,command,executed_at) VALUES (?1,'old','2020-01-01 00:00:00')", [&server.id]).unwrap();
    db.prune_logs(30).unwrap();
    let logs = db.list_logs(None, 100).unwrap();
    assert_eq!(logs.len(), 1);
    assert_eq!(logs[0].command, "now");
    assert!(Settings {
        scrollback: 999,
        ..Settings::default()
    }
    .validate()
    .is_err());
}
