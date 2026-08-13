# ComfyUI mobile — Synology Web + Windows GPU Worker Client

The production architecture is a Synology-hosted web service plus a replaceable Windows GPU Worker Client. The Windows client makes an outbound WSS connection to Synology and calls only local ComfyUI (`127.0.0.1:8188`); Windows needs no public IP or inbound port.

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

See [docs/synology-docker-deployment.md](docs/synology-docker-deployment.md) for Docker deployment and Windows Client setup. Start the Client with:

```powershell
./worker/start-client.ps1 -ServerUrl 'https://your-domain.example' -Token 'your-worker-token' -WorkerId 'GPU-01'
```
