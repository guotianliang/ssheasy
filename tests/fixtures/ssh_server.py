"""Local integration fixture. Generated keys and files live in a disposable directory."""
import asyncio
import json
import sys
from pathlib import Path
import tempfile
import asyncssh

async def main():
    legacy_rsa = "--legacy-rsa" in sys.argv
    with tempfile.TemporaryDirectory(prefix="ssheasy-test-") as directory:
        root = Path(directory)
        remote = root / "remote"
        remote.mkdir()
        (remote / "hello.txt").write_text("SSHEasy 中文测试\n", encoding="utf-8")
        host_key = asyncssh.generate_private_key("ssh-ed25519")
        user_key = asyncssh.generate_private_key("ssh-ed25519")
        rsa_key = asyncssh.generate_private_key("ssh-rsa", key_size=2048)
        active_host_key = rsa_key if legacy_rsa else host_key
        legacy_path = root / "legacy_rsa"
        legacy_path.write_bytes(rsa_key.export_private_key("pkcs1-pem", passphrase="fixture-legacy-pass"))
        legacy_path.chmod(0o600)
        ui_key = root / "ui_ed25519"
        ui_key.write_bytes(user_key.export_private_key("openssh"))
        ui_key.chmod(0o600)
        key_path = root / "client_key"
        key_path.write_bytes(user_key.export_private_key("openssh", passphrase="fixture-key-pass"))
        key_path.chmod(0o600)
        class Server(asyncssh.SSHServer):
            def connection_made(self, connection):
                validate_key = connection.validate_public_key
                allowed_signatures = {b"ssh-rsa"} if legacy_rsa else {b"ssh-ed25519", b"rsa-sha2-256"}
                async def validate_signature(username, key_data, message, signature):
                    if signature:
                        size = int.from_bytes(signature[:4], "big")
                        if signature[4:4 + size] not in allowed_signatures:
                            return False
                    return await validate_key(username, key_data, message, signature)
                connection.validate_public_key = validate_signature
                if legacy_rsa:
                    # OpenSSH 5.3 predates EXT_INFO/server-sig-algs. Suppress the
                    # fixture's extension packet to exercise this real wire case.
                    connection._send_ext_info = lambda: None
            def begin_auth(self, username): return True
            def password_auth_supported(self): return True
            def public_key_auth_supported(self): return True
            def validate_password(self, username, password): return username == "fixture" and password == "fixture-password"
            def validate_public_key(self, username, key): return username == "fixture" and key in [user_key.convert_to_public(), rsa_key.convert_to_public()]
        async def shell(process):
            args = ["/bin/sh", "-c", process.command] if process.command else ["/bin/sh", "-i"]
            child = await asyncio.create_subprocess_exec(*args, cwd=remote, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT, env={"PATH": str(root / "empty-bin"), "HOME": str(remote), "LANG": "en_US.UTF-8", "PS1": "fixture@localhost:~$ "})
            async def feed():
                try:
                    while True:
                        try:
                            data = await process.stdin.read(4096)
                        except (asyncssh.BreakReceived, asyncssh.TerminalSizeChanged):
                            continue
                        if not data:
                            break
                        child.stdin.write(data.replace("\r", "\n").encode())
                        await child.stdin.drain()
                finally:
                    if child.stdin: child.stdin.close()
            task = asyncio.create_task(feed())
            try:
                while data := await child.stdout.read(65536): process.stdout.write(data.decode("utf-8", errors="replace"))
                process.exit(await child.wait())
            finally:
                task.cancel()
                if child.returncode is None: child.terminate()
        listener = await asyncssh.create_server(Server, "127.0.0.1", 0, server_host_keys=[active_host_key], signature_algs=["ssh-rsa"] if legacy_rsa else ["ssh-ed25519", "rsa-sha2-256"], process_factory=shell, sftp_factory=lambda channel: asyncssh.SFTPServer(channel, chroot=str(remote)))
        print(json.dumps({"port": listener.get_port(), "fingerprint": active_host_key.get_fingerprint(), "root": str(root), "keyPath": str(key_path), "legacyKeyPath": str(legacy_path), "uiKeyPath": str(ui_key)}), flush=True)
        await asyncio.Event().wait()

if __name__ == "__main__":
    asyncio.run(main())
