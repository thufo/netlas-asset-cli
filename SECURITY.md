# Security policy

Please report security issues privately to the repository owner instead of
opening a public issue containing credentials or sensitive asset data.

Never include a Netlas API key in an issue, commit, screenshot, or exported
result. If a key is accidentally exposed, revoke it in Netlas immediately.

The desktop application keeps API keys in memory by default. Optional
persistence uses Electron `safeStorage`; it is disabled on Linux when the
selected backend is `basic_text` or encryption is unavailable. Query history
contains request metadata only and never contains API responses or credentials.

Release builds are currently allowed to be unsigned and include SHA256
checksums. Windows users may see a SmartScreen warning until code-signing
credentials are configured in the release workflow.
