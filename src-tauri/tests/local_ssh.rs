use russh::{client, keys::key::PrivateKeyWithHashAlg, ChannelMsg, Disconnect};
use russh_sftp::client::SftpSession;
use ssheasy_lib::ssh::{
    session::{authenticate_private_key, load_key_with_legacy_fallback},
    sftp,
};
use std::{
    io::{BufRead, BufReader},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Arc,
    time::Duration,
};
use tokio::io::AsyncWriteExt;
struct Fixture {
    child: Child,
    root: PathBuf,
    port: u16,
    key_path: String,
    legacy_key_path: String,
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = std::fs::remove_dir_all(&self.root);
    }
}
impl Fixture {
    fn start() -> Self {
        Self::start_with_legacy_rsa(false)
    }
    fn start_with_legacy_rsa(legacy: bool) -> Self {
        let project = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .to_owned();
        let python = std::env::var("SSHEASY_TEST_PYTHON").unwrap_or_else(|_| {
            project
                .join(".venv/bin/python")
                .to_string_lossy()
                .into_owned()
        });
        let mut command = Command::new(python);
        command.arg(project.join("tests/fixtures/ssh_server.py"));
        if legacy {
            command.arg("--legacy-rsa");
        }
        let mut child = command
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .expect("create .venv and install tests/requirements.txt first");
        let mut line = String::new();
        BufReader::new(child.stdout.take().unwrap())
            .read_line(&mut line)
            .unwrap();
        let info: serde_json::Value =
            serde_json::from_str(&line).expect("SSH fixture did not start");
        Self {
            child,
            root: info["root"].as_str().unwrap().into(),
            port: info["port"].as_u64().unwrap() as u16,
            key_path: info["keyPath"].as_str().unwrap().into(),
            legacy_key_path: info["legacyKeyPath"].as_str().unwrap().into(),
        }
    }
}
struct Handler;
impl client::Handler for Handler {
    type Error = russh::Error;
    async fn check_server_key(
        &mut self,
        _: &russh::keys::PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}
async fn connect(port: u16) -> client::Handle<Handler> {
    let config = Arc::new(client::Config {
        inactivity_timeout: None,
        ..Default::default()
    });
    client::connect(config, ("127.0.0.1", port), Handler)
        .await
        .unwrap()
}
#[tokio::test]
#[ignore = "requires the local Python SSH fixture; run npm run test:integration"]
async fn real_ssh_and_sftp_workflow() {
    tokio::time::timeout(Duration::from_secs(60), async {
        let fixture = Fixture::start();
        let mut client = connect(fixture.port).await;
        assert!(!client.authenticate_password("fixture", "wrong").await.unwrap().success());
        assert!(client.authenticate_password("fixture", "fixture-password").await.unwrap().success());
        let mut shell = client.channel_open_session().await.unwrap();
        shell.request_pty(true, "xterm-256color", 100, 30, 0, 0, &[]).await.unwrap();
        shell.window_change(120, 40, 0, 0).await.unwrap();
        shell.request_shell(true).await.unwrap(); shell.data(&b"printf 'REAL_SSH_OK\\n'\n"[..]).await.unwrap();
        let mut output = String::new();
        while let Some(message) = shell.wait().await {
            if let ChannelMsg::Data { data } = message { output.push_str(&String::from_utf8_lossy(&data)); if output.contains("REAL_SSH_OK") { break; } }
        }
        assert!(output.contains("REAL_SSH_OK"));
        let channel = client.channel_open_session().await.unwrap(); channel.request_subsystem(true, "sftp").await.unwrap();
        let session = SftpSession::new(channel.into_stream()).await.unwrap();
        assert_eq!(sftp::home_dir(&session).await.unwrap(), "/");
        assert!(sftp::list_dir(&session, "/").await.unwrap().iter().any(|f| f.name == "hello.txt"));
        assert!(sftp::read_text_file(&session, "/hello.txt").await.unwrap().content.contains("中文"));
        let bytes: Vec<u8> = (0..1_048_777).map(|i| (i % 251) as u8).collect();
        let source = fixture.root.join("source.bin"); std::fs::write(&source, &bytes).unwrap();
        sftp::upload_from_file(&session, None, "fixture", "/upload.bin", source.to_str().unwrap(), false).await.unwrap();
        assert_eq!(sftp::upload_from_file(&session, None, "fixture", "/upload.bin", source.to_str().unwrap(), false).await.unwrap_err(), "FILE_EXISTS");
        sftp::rename_entry(&session, "/upload.bin", "/renamed.bin").await.unwrap();
        let target = fixture.root.join("download.bin"); std::fs::write(&target, "old-content").unwrap();
        sftp::download_to_file(&session, None, "fixture", "/renamed.bin", target.to_str().unwrap()).await.unwrap();
        assert_eq!(std::fs::read(&target).unwrap(), bytes);
        assert!(sftp::download_to_file(&session, None, "fixture", "/missing", target.to_str().unwrap()).await.is_err());
        assert_eq!(std::fs::read(&target).unwrap(), bytes);
        std::fs::write(&source, "replacement").unwrap();
        sftp::upload_from_file(&session, None, "fixture", "/renamed.bin", source.to_str().unwrap(), true).await.unwrap();
        assert_eq!(sftp::read_text_file(&session, "/renamed.bin").await.unwrap().content, "replacement");
        assert!(sftp::rename_entry(&session, "/renamed.bin", "/hello.txt").await.is_err());
        session.create_dir("/protected").await.unwrap(); session.create_dir("/delete-me").await.unwrap();
        session.create_dir("/delete-me/nested").await.unwrap();
        let mut keep = session.create("/protected/keep.txt").await.unwrap(); keep.write_all(b"keep").await.unwrap(); keep.shutdown().await.unwrap();
        session.symlink("/delete-me/link", "/protected").await.unwrap();
        sftp::remove_path(&session, "/delete-me").await.unwrap();
        assert_eq!(sftp::read_text_file(&session, "/protected/keep.txt").await.unwrap().content, "keep");
        session.symlink("/top-link", "/protected").await.unwrap(); sftp::remove_path(&session, "/top-link").await.unwrap();
        assert!(session.metadata("/protected/keep.txt").await.is_ok());
        assert!(sftp::remove_path(&session, "/").await.is_err());
        assert!(!sftp::list_dir(&session, "/").await.unwrap().iter().any(|f| f.name.starts_with(".ssheasy-")));
        session.close().await.unwrap(); client.disconnect(Disconnect::ByApplication, "test done", "en").await.unwrap();
        let mut key_client = connect(fixture.port).await;
        let key = load_key_with_legacy_fallback(&fixture.key_path, Some("fixture-key-pass")).unwrap();
        let key = PrivateKeyWithHashAlg::new(Arc::new(key), None);
        assert!(key_client.authenticate_publickey("fixture", key).await.unwrap().success());
        assert!(load_key_with_legacy_fallback(&fixture.key_path, Some("wrong-pass")).is_err());
        key_client.disconnect(Disconnect::ByApplication, "done", "en").await.unwrap();
        let mut legacy_client = connect(fixture.port).await;
        let key = load_key_with_legacy_fallback(&fixture.legacy_key_path, Some("fixture-legacy-pass")).unwrap();
        assert_eq!(legacy_client.best_supported_rsa_hash().await.unwrap(), Some(Some(russh::keys::HashAlg::Sha256)));
        assert!(authenticate_private_key(&mut legacy_client, "fixture", key).await.unwrap().success());
        assert!(load_key_with_legacy_fallback(&fixture.legacy_key_path, Some("wrong-pass")).is_err());
        legacy_client.disconnect(Disconnect::ByApplication, "done", "en").await.unwrap();
        println!("Verified real SSH password/key auth, PTY shell/resize, shared SFTP, UTF-8 preview, streaming upload/download, overwrite, rename, recursive deletion, symlink safety.");
    }).await.expect("local SSH integration timed out");
}

#[tokio::test]
#[ignore = "requires the local Python SSH fixture; run npm run test:integration"]
async fn rsa_sha1_without_server_signature_extension() {
    tokio::time::timeout(Duration::from_secs(30), async {
        let fixture = Fixture::start_with_legacy_rsa(true);
        let mut client = connect(fixture.port).await;
        assert_eq!(client.best_supported_rsa_hash().await.unwrap(), None);
        let key =
            load_key_with_legacy_fallback(&fixture.legacy_key_path, Some("fixture-legacy-pass"))
                .unwrap();
        assert!(
            authenticate_private_key(&mut client, "fixture", key)
                .await
                .unwrap()
                .success(),
            "old servers without server-sig-algs must authenticate with ssh-rsa"
        );
        client
            .disconnect(Disconnect::ByApplication, "done", "en")
            .await
            .unwrap();
    })
    .await
    .expect("legacy RSA authentication timed out");
}
