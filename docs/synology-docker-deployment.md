# 群晖主站 + Windows GPU Worker Client（WSS）部署

## 架构

```text
手机/浏览器 --HTTPS--> 群晖反向代理 --HTTP--> web:3000
                                      │
                                      ├── Redis 持久队列
                                      ├── SQLite/图片存储/SFTP
                                      └── /api/worker/ws
                                            ▲
                                            │ WSS 出站长连接
                                      Windows Worker Client
                                            │
                                      127.0.0.1:8188
                                            │
                                          ComfyUI
```

Windows 不需要公网 IP、端口转发、Tailscale 或入站防火墙规则。公网只开放群晖 443；ComfyUI 永远监听 `127.0.0.1:8188`。

## 群晖 Docker 部署

本测试版所有 Docker 基础镜像和 npm 包均使用国内源：

```text
Node 镜像：m.daocloud.io/docker.io/library/node:22-bookworm-slim
Redis 镜像：m.daocloud.io/docker.io/library/redis:7-alpine
npm：       https://registry.npmmirror.com
```

如果某个国内镜像临时不可用，可在 Dockerfile/Compose 中替换为你能访问的企业镜像仓库；不要恢复成 `node:22-bookworm-slim` 或 `redis:7-alpine`，否则会再次访问 Docker Hub。

1. 将仓库放入 `/volume1/docker/comfy-mobile`。
2. 创建 `secrets/sftpUploaderConfig.json`，填入现有 SFTP 图床配置，不提交 Git。
3. 复制 `.env.docker.example` 为 `.env`，设置至少 32 字节随机的 `WORKER_PAIRING_TOKEN`、管理员账号密码。
4. 在 Container Manager 项目目录执行：

```bash
docker compose build
docker compose up -d
docker compose ps
curl http://127.0.0.1:3000/health
```

先单独验证国内镜像连通性：

```bash
docker pull m.daocloud.io/docker.io/library/redis:7-alpine
docker pull m.daocloud.io/docker.io/library/node:22-bookworm-slim
curl -I https://registry.npmmirror.com
```

Redis 仅在 Docker 内网，不映射宿主机端口。DSM 反向代理将 `https://你的域名` 转发到 `127.0.0.1:3000`，并开启 WebSocket 转发；不要转发 Windows 的 8188 或任何 Worker 端口。

## Worker 配对与 Token

当前 MVP 使用部署级 `WORKER_PAIRING_TOKEN` 作为 WSS 凭据，先保证可替换节点链路稳定。后续管理后台可将它升级为一次性配对码换 Worker Token。

在群晖 `.env` 生成随机值，不要把真实值放入 Git：

```bash
openssl rand -hex 32
```

然后把这个值同时作为 Windows Client 的 `WORKER_TOKEN`。

## Windows Client

在 Windows GPU 电脑准备独立目录，至少复制：

```text
worker/client.js
src/workflow.js
src/paths.js
workflow-krea2.json
src/worker-client.js
package.json
```

安装依赖后运行：

```powershell
npm install
$env:WORKER_SERVER_URL='https://你的域名'
$env:WORKER_TOKEN='与群晖 WORKER_PAIRING_TOKEN 相同的随机值'
$env:WORKER_ID='GPU-01'
$env:COMFYUI_BASE_URL='http://127.0.0.1:8188'
$env:WORKFLOW_PATH='D:\AI\comfy-worker\workflow-krea2.json'
node worker/client.js
```

Client 启动后会：

1. 通过 `wss://域名/api/worker/ws?token=...` 主动连接群晖。
2. 发送 `hello` 注册 Worker，并每 15 秒发送 heartbeat。
3. 收到任务后只使用本地白名单字段构建 `workflow-krea2.json`。
4. 通过本机 ComfyUI WebSocket 获取进度。
5. 读取本机生成图片，以 Base64 通过 WSS 回传群晖。
6. 断线按 1、2、4、8…秒自动重连，最高 30 秒。

建议使用 Windows 任务计划程序设置“用户登录时运行”或“系统启动时运行”，不要把 Token 写入代码或提交 Git。生产版 GUI Client 应把 Token 存入 Windows Credential Manager；当前 MVP 使用环境变量便于验证链路。

公网部署时在 `.env` 中同时设置 `APP_ORIGIN=https://你的域名`，启用状态变更请求的 Origin 校验；设置 `IMAGE_HOST_ALLOWLIST=你的图床域名`（多个域名用逗号分隔），图片代理会拒绝本机、内网、链路本地和元数据地址。不要把 `IMAGE_HOST_ALLOWLIST` 留空后直接暴露公网。

## WSS 消息协议

Client → 群晖：

```json
{"type":"hello","workerId":"GPU-01","capabilities":{"clientVersion":"1.0.0"}}
{"type":"heartbeat","status":"idle","capabilities":{"comfyOnline":true}}
{"type":"started","jobId":"..."}
{"type":"progress","jobId":"...","value":4,"max":8,"percent":50,"node":"162:138"}
{"type":"result","jobId":"...","filename":"image.png","imageBase64":"..."}
{"type":"failed","jobId":"...","message":"ComfyUI execution failed"}
```

群晖 → Client：

```json
{"type":"hello","ok":true,"workerId":"GPU-01"}
{"type":"job","jobId":"...","input":{"prompt":"...","aspectRatio":"3:4","megapixels":1,"seed":-1,"upscale":true}}
```

Worker Token 只允许连接 WSS；浏览器永远不会接触 Worker Token、ComfyUI 地址或 Workflow JSON。

## 可替换节点行为

- 多台 Client 使用不同 `WORKER_ID` 连接同一个群晖。
- 群晖只向在线且 idle 的 Client 派发任务。
- Client 断线时不再接收新任务；未完成任务超时失败，避免重复执行。
- 新电脑只需复制 Client、配置新的 `WORKER_ID` 和 Token，即可替换旧算力节点。

## 诊断

```powershell
Invoke-WebRequest http://127.0.0.1:8188/system_stats
```

群晖侧：

```bash
docker compose logs -f web
```

如果 Client 显示连接失败，依次检查：域名 HTTPS 证书、DSM 反向代理 WebSocket、群晖容器状态、Token 是否一致，以及 Windows 是否能访问 `127.0.0.1:8188`。
