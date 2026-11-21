# sing-box support in this fork

Select **Clash / sing-box** when adding the backend. Detection uses the
`sing-box ...` version string; `meta: true` and `premium: true` in its compatibility
API do not identify it as Mihomo. Existing Clash entries work without migration.
Legacy sing-box entries retain their address, credentials and UUID; mixed backend
lists keep their dae entries.

This fork targets sing-box's Clash API, including the subscription extensions in
[ravy-alt/sing-box](https://github.com/ravy-alt/sing-box). It does not implement
the separate native sing-box management protocol.

| Available                                                     | Hidden for sing-box                                   |
| ------------------------------------------------------------- | ----------------------------------------------------- |
| Overview, traffic, memory, connections and logs               | Core upgrade/restart and Mihomo update checks         |
| Proxy selection, Clash mode selection and latency/IPv6 probes | Configuration reload/import and GEO updates           |
| Subscription provider display, refresh and health checks      | Port, LAN and TUN modification                        |
| Routing rule display                                          | Rule provider updates, rule editing and Smart weights |
| DNS queries, DNS cache and Fake IP cache flushing             | Backend settings synchronization                      |
| Dashboard upgrade through `/upgrade/ui`                       | Per-URL independent latency history                   |

Mode selection remains separate from general configuration editing. sing-box
currently applies only `mode` through `PATCH /configs`; accepting other fields
or returning 204 from `PUT /configs` does not mean those operations work.
Unsupported core and configuration operations are also rejected by the dashboard action layer, including
actions from a dialog opened before switching backends. Search, customization and
the Honk "show all" preference cannot re-enable unsupported sing-box controls.

The subscription actions require a sing-box build with provider support. The
dashboard lists the providers returned by the backend. DNS/Fake IP clearing and
dashboard upgrade likewise depend on the corresponding core configuration.

## Releases and installation

The **Build and release fork** workflow runs on pushes to
`codex/sing-box-support` and supports manual dispatch. It runs type checking,
IPv6 unit/browser tests and sing-box browser regression tests, then builds all
seven upstream font variants. Each archive contains `dist/index.html`, assets
and the license, matching sing-box's ZIP extraction layout.

All seven archives are validated before checksums are generated and a release
is published. The release is marked as the latest release so this URL stays
usable without selecting a version manually:

```text
https://github.com/ravy-alt/zashboard/releases/latest/download/dist.zip
```

Configure sing-box using:

```json
{
  "experimental": {
    "clash_api": {
      "external_ui": "zashboard",
      "external_ui_download_url": "https://github.com/ravy-alt/zashboard/releases/latest/download/dist.zip"
    }
  }
}
```

Preserve your existing controller, authentication and download detour settings.
The dashboard's update check also uses this fork's releases, and CI embeds its
release version in the application. Release uploads use GitHub's repository
token; no personal access token, Pages domain or upstream publishing secret is
required. The original upstream deployment workflow is retained for reference
and disabled in this fork.

Changing the JSON download URL does not change the running core's in-memory
configuration or replace an existing UI directory. Load the updated configuration
on the next normal core restart, and use dashboard upgrade or install `dist.zip`
to update existing UI files. No core restart is required just to serve newly
installed UI files.

Personal backend settings and credentials are stored by the user in the browser,
not embedded in the release archives.
