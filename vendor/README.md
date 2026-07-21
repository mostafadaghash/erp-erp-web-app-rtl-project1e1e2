# Vendored test dependency

This directory contains an official npm tarball encoded as UTF-8 Base64 so restricted development environments can install the test harness without reaching npm.

## convex-test 0.0.38

- Source: official npm package `convex-test@0.0.38`
- Compatible peer range: `convex ^1.16.4` (the project currently uses Convex 1.24.x)
- SHA-512 (hex) of the decoded tarball:

```text
d68ff71af511f6030b8e2aaaed2c5c848ff439841a5b06d00b820d981d5236dd562c18d480433cf9bae0a6aad9c09f956f50dd199a240957a28704f920f938f7
```

Decode, verify, and install:

```bash
base64 -d vendor/convex-test-0.0.38.tgz.base64 > /tmp/convex-test-0.0.38.tgz
sha512sum /tmp/convex-test-0.0.38.tgz
npm install --save-dev /tmp/convex-test-0.0.38.tgz --ignore-scripts
```

The checksum must match exactly before installation. Keep the Base64 source file in the repository so future Codex/Stunning environments can reproduce the install.
