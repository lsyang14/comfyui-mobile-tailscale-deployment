# ComfyUI mobile Tailscale deployment

This repository contains the first runnable backend core for the local ComfyUI mobile service described in [the deployment guide](../docs/comfyui-mobile-tailscale-deployment-guide.md).

## Current milestone (v0.1.0)

- Safe validation for the mobile request contract.
- Allow-listed parameter mapping into the supplied Krea2 API workflow.
- Deterministic output selection for normal and upscale results.
- Node.js test suite with no external runtime dependency.

The public HTTP UI, authentication, persistent job queue, and ComfyUI WebSocket runner are the next implementation milestone. The workflow is intentionally kept server-side and must never be accepted from the browser.

## Run tests

```powershell
npm test
```

## Repository setup

The intended remote is:

```text
https://github.com/lsyang14/comfyui-mobile-tailscale-deployment.git
```

See `docs/comfyui-mobile-tailscale-deployment-guide.md` in the parent workspace for the full Windows, Tailscale, Synology reverse-proxy, and production checklist.
