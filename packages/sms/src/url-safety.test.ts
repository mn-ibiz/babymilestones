import { describe, expect, it } from "vitest";
import { checkProviderUrlSafety, isSafeProviderUrl } from "./url-safety.js";

describe("checkProviderUrlSafety (P1-E09-S02 AC3)", () => {
  it("accepts a public HTTPS URL", () => {
    expect(checkProviderUrlSafety("https://api.africastalking.com/version1/messaging")).toEqual({
      ok: true,
    });
    expect(isSafeProviderUrl("https://sms.provider.co.ke/send")).toBe(true);
  });

  it("rejects non-HTTPS schemes", () => {
    for (const u of [
      "http://api.provider.com/send",
      "ftp://api.provider.com",
      "ws://api.provider.com",
    ]) {
      const r = checkProviderUrlSafety(u);
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("not_https");
    }
  });

  it("rejects malformed / empty input", () => {
    for (const u of ["", "   ", "not a url", "https://", 42, null, undefined]) {
      const r = checkProviderUrlSafety(u as unknown);
      expect(r.ok).toBe(false);
    }
  });

  it("rejects localhost and loopback", () => {
    for (const u of [
      "https://localhost/send",
      "https://localhost:8443/send",
      "https://api.localhost/send",
      "https://127.0.0.1/send",
      "https://127.0.0.99/send",
    ]) {
      const r = checkProviderUrlSafety(u);
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("private_host");
    }
  });

  it("rejects RFC1918 private ranges", () => {
    for (const u of [
      "https://10.0.0.5/send",
      "https://172.16.4.1/send",
      "https://172.31.255.255/send",
      "https://192.168.1.1/send",
    ]) {
      expect(checkProviderUrlSafety(u).reason).toBe("private_host");
    }
  });

  it("accepts a public IP just outside the private 172.x window", () => {
    expect(isSafeProviderUrl("https://172.32.0.1/send")).toBe(true);
  });

  it("rejects the cloud metadata address and link-local", () => {
    expect(checkProviderUrlSafety("https://169.254.169.254/latest/meta-data/").reason).toBe(
      "private_host",
    );
    expect(checkProviderUrlSafety("https://169.254.0.1/send").reason).toBe("private_host");
  });

  it("rejects CGNAT and 0.0.0.0", () => {
    expect(checkProviderUrlSafety("https://100.64.0.1/send").reason).toBe("private_host");
    expect(checkProviderUrlSafety("https://0.0.0.0/send").reason).toBe("private_host");
  });

  it("rejects private IPv6 (loopback, link-local, unique-local, metadata-mapped)", () => {
    for (const u of [
      "https://[::1]/send",
      "https://[fe80::1]/send",
      "https://[fd00::1]/send",
      "https://[::ffff:169.254.169.254]/send",
      "https://[::ffff:10.0.0.1]/send",
    ]) {
      expect(checkProviderUrlSafety(u).reason).toBe("private_host");
    }
  });

  it("rejects IPv4-COMPATIBLE IPv6 embedding metadata/loopback (review fix)", () => {
    // ::169.254.169.254 and ::127.0.0.1 — Node compresses these to ::a9fe:a9fe
    // and ::7f00:1, which previously slipped past the validator.
    for (const u of [
      "https://[::169.254.169.254]/send",
      "https://[::127.0.0.1]/send",
      "https://[::a9fe:a9fe]/send",
      "https://[::7f00:1]/send",
    ]) {
      expect(checkProviderUrlSafety(u).reason).toBe("private_host");
    }
  });
});
