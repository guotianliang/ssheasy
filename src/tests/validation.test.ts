import { describe, expect, it } from "vitest";
import { parseTemplateVars, renderTemplate } from "@/types/command";
import { isValidHost } from "@/types/server";
import { quoteShellPath, isDangerous } from "@/lib/shell";
import { validFileName } from "@/stores/useSftpStore";
describe("user input boundaries", () => {
  it("deduplicates template variables and preserves literal replacement values", () => {
    expect(parseTemplateVars("echo {{a}} {{a}} {{b}}")).toEqual(["a", "b"]);
    expect(renderTemplate("echo {{a}}", { a: "$&'text" })).toBe("echo $&'text");
  });
  it("validates IPv4, IPv6 and hostnames", () => {
    for (const host of ["localhost", "example.org", "127.0.0.1", "::1", "2001:db8::1"]) expect(isValidHost(host), host).toBe(true);
    for (const host of ["999.1.1.1", "1:2:3", ":::1", "a::b::c", "-bad.com", "https://a", "a".repeat(64) + ".org"]) expect(isValidHost(host), host).toBe(false);
  });
  it("quotes bookmark paths so shell metacharacters remain part of the path", () => {
    expect(quoteShellPath("/tmp/a b; touch /bad")).toBe("'/tmp/a b; touch /bad'");
    expect(quoteShellPath("/tmp/it's")).toBe("'/tmp/it'\\''s'");
    expect(quoteShellPath("~/my dir")).toBe('"$HOME"/\'my dir\'');
  });
  it("checks dangerous commands regardless of how they are selected", () => {
    for (const command of ["rm -rf /data", "sudo rm -fr /data", "reboot", "chmod -R 777 /data", "dd if=/a of=/b"]) expect(isDangerous(command)).toBe(true);
    expect(isDangerous("ls -lah")).toBe(false);
  });
  it("permits ordinary dotted filenames and rejects traversal components", () => {
    for (const name of ["a.txt", "backup..txt", ".env"]) expect(validFileName(name)).toBe(true);
    for (const name of ["", ".", "..", "a/b", "a\\b", "a\0b"]) expect(validFileName(name)).toBe(false);
  });
});
