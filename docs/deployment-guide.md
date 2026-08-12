# ComfyUI 手机端生成服务：开发与部署执行手册

> 目标：在 Windows GPU 电脑运行 ComfyUI；手机通过 HTTPS 域名使用 PWA；群晖负责公网 HTTPS 入口和反向代理；群晖与电脑之间通过 Tailscale 私网互联。ComfyUI 不直接暴露到公网。

## 1. 最终架构

```text
手机浏览器 / PWA
       │ HTTPS https://ai.example.com
       ▼
群晖 NAS（公网域名、证书、DSM 反向代理）
       │ HTTP 到 100.x.y.z:3000（Tailscale 私网）
       ▼
Windows GPU 电脑（Next.js：前端 + 业务 API）
       │ HTTP，仅 127.0.0.1:8188
       ▼
ComfyUI（工作流执行、GPU、模型、输出图片）
```

### 必须遵守的边界

- 只在群晖开放 `443/TCP`；不要在路由器上转发 Windows 的 3000 或 ComfyUI 的 8188 端口。
- ComfyUI 保持监听 `127.0.0.1`；手机绝不直接请求 `/prompt`、`/history`、`/view` 或 `/ws`。
- 后端保存 API 工作流模板，并且只修改经过白名单验证的字段。浏览器不能提交任意 ComfyUI JSON。
- 群晖只做反向代理，不运行模型、不存放模型、不作为图片源站。
- 第一期只允许一个正在执行的生成任务；其余任务排队。这与单 GPU ComfyUI 的实际执行模型一致。

## 2. 工作流审计结果

文件：`C:\Users\林sy\Desktop\image_krea2_turbo_t2i_int8.json`

该文件已经是 **ComfyUI API 格式**：根对象的键是节点 ID，节点包含 `class_type` 和 `inputs`，可原样作为 `POST /prompt` 的 `prompt` 字段提交。它不是带画布位置的保存格式。

### 工作流管线

1. `162:*`：Krea2 Turbo 文生图主流程。
2. `162:147 → 162:155`：可选的提示词润色。关闭时直接使用用户原始文本；打开时，Qwen3-VL 文本生成节点扩写提示词。
3. `162:140/141/142`：主模型、文本编码器和 VAE。
4. `162:144/151/152`：可选 LoRA 分支。
5. `161`：主图 `SaveImage`。
6. `159:*`：RealESRGAN 放大、缩放、Z-Image Turbo 二次采样、解码。
7. `157`：高分修复结果 `SaveImage`；`158` 仅用于 ComfyUI UI 对比，不作为业务输出。

### 需要准备的模型

将实际文件放入 ComfyUI 的对应模型目录，并以 ComfyUI 的模型列表为准核验文件名。

| 文件 | 工作流节点 | 推荐目录 |
|---|---:|---|
| `redcraft22INT8Convrot_2Krea2Edition.safetensors` | `162:140` | `models/unet` |
| `qwen3vl_4b_fp8_scaled.safetensors` | `162:141` | `models/text_encoders` |
| `qwen_image_vae.safetensors` | `162:142` | `models/vae` |
| `krea2_darkbrush.safetensors` | `162:144` | `models/loras` |
| `z_image_turbo_bf16.safetensors` | `159:128` | `models/unet` |
| `qwen_3_4b.safetensors` | `159:129` | `models/text_encoders` |
| `ae.safetensors` | `159:131` | `models/vae` |
| `RealESRGAN_x4plus.safetensors` | `159:132` | `models/upscale_models` |

另外，这个 JSON 使用 `ResolutionSelector`、`TextGenerate`、`PreviewAny`、`ComfySwitchNode` 等非基础节点。先在 ComfyUI 画布里打开它并点击一次 Queue，确认所有自定义节点、模型与显存均正常；任何红色节点都必须在开发前修复。

### 后端可公开的参数映射

将以下映射写死在服务端 `workflow.ts`，而不是放在前端：

| 业务字段 | 节点与字段 | 规则 |
|---|---|---|
| `prompt` | `162:148.inputs.value` | 1–1,000 字符，去除控制字符 |
| `refinePrompt` | `162:153.inputs.value` | Boolean |
| `enableLora` | `162:152.inputs.value` | Boolean |
| `aspectRatio` | `156.inputs.aspect_ratio` | 仅 `1:1`、`3:4`、`4:3`、`9:16`、`16:9` |
| `megapixels` | `156.inputs.megapixels` | 仅 `1`、`2`；先只启用 `1` |
| `seed` | `162:138.inputs.seed` 与 `159:127.inputs.seed` | `-1` 自动随机，或安全整数 |
| `upscale` | 后端选择结果节点 | `false` 返回 `161`，`true` 返回 `157` |

不要向手机公开模型名称、采样器、LoRA 强度、系统提示词或完整节点图。更换工作流时，先更新模板和这张映射表，再跑回归测试。

## 3. Windows：安装与验证 ComfyUI

### 3.1 目录约定

以下示例使用 `D:\AI\ComfyUI`。可替换为你的真实目录，但之后所有配置必须统一。

```text
D:\AI\ComfyUI\
  main.py
  models\
  input\
  output\
  custom_nodes\
D:\AI\comfy-mobile\
  workflow\krea2.json
  app\
  lib\
  prisma\
```

复制 API 工作流到项目目录：

```powershell
Copy-Item 'C:\Users\林sy\Desktop\image_krea2_turbo_t2i_int8.json' 'D:\AI\comfy-mobile\workflow\krea2.json'
```

### 3.2 启动参数

创建 `D:\AI\ComfyUI\run-server.bat`，根据显存情况只保留一个 VRAM 模式参数：

```bat
@echo off
cd /d D:\AI\ComfyUI
python main.py --listen 127.0.0.1 --port 8188 --disable-auto-launch --enable-compress-response-body
```

低显存时可增加 `--lowvram`；高显存且电脑专用于推理时可测试 `--highvram`。不要一开始启用实验性 `--fast` 参数。`--listen 127.0.0.1` 是安全边界，不能改为 `0.0.0.0`。

验证：

```powershell
Invoke-RestMethod http://127.0.0.1:8188/system_stats
Invoke-RestMethod http://127.0.0.1:8188/object_info | Out-Null
```

应分别返回 JSON 系统信息和节点定义；若失败，先修复 ComfyUI，不能跳到应用开发。

### 3.3 Windows 防火墙

ComfyUI 不需要入站规则。应用服务器 3000 端口仅允许来自 Tailscale 网卡；可先通过 Windows 防火墙图形界面创建入站规则：TCP/3000、远程 IP 为群晖的 Tailscale IP。开发初期也可以让 Next.js 仅在 Tailscale IP 上监听，完成反代验证后再收紧防火墙。

## 4. Tailscale：群晖到 Windows 的私有链路

### 4.1 安装与登录

1. 在 Windows 安装 Tailscale，登录同一个 tailnet，不使用 Exit Node。
2. 在群晖套件中心或 Tailscale 的 Synology 安装方式安装 Tailscale，登录同一个 tailnet。
3. 在 Tailscale 管理台为两台设备命名，例如 `gpu-pc` 与 `synology`。
4. 在 Windows 记下 Tailscale IPv4，例如 `100.101.102.103`；在群晖记下它自己的 `100.*` 地址。
5. 在群晖 SSH 或 DSM Terminal 执行 `ping 100.101.102.103`；在 Windows 执行 `tailscale ping synology`。两边都成功后再继续。

### 4.2 与 Clash 共存

- 不启用 Tailscale 的 Exit Node，也不启用“接受其他设备提供的 Exit Node”。
- Clash 使用系统代理时通常无需处理。
- Clash 使用 TUN 模式时，添加直连规则：`IP-CIDR,100.64.0.0/10,DIRECT,no-resolve`。如规则集还拦截私网，再确保 `192.168.0.0/16`、`10.0.0.0/8` 也是 `DIRECT`。
- 若可选，打开 Clash 的“绕过局域网/IP 直连”。Tailscale 网络不能被转给代理，否则群晖转发会间歇失联。

### 4.3 稳定性与安全

- Windows 的 Tailscale 设为随系统启动；电脑关机、休眠、Tailscale 退出时，手机服务自然不可用。
- 在 Tailscale ACL 中仅允许 `synology → gpu-pc:3000`。不要向所有 tailnet 设备开放 3000。
- 如果 Windows 重启后 IP 变化，Tailscale IPv4 通常保持稳定；反向代理应使用 MagicDNS 名称 `gpu-pc.tailnet-name.ts.net`。若 DSM 无法解析该名称，再退回固定的 `100.*` IP。

## 5. 应用开发：Next.js PWA + API

### 5.1 为什么选择单一 Next.js 项目

前端页面和业务 API 同部署在 Windows 一台机器，避免手机跨域、Cookie、WebSocket 转发和前后端版本错配。第一次上线使用轮询进度，稳定后才按需要增加 SSE；不要把 ComfyUI WebSocket 直接穿透到浏览器。

### 5.2 初始化项目

在 Windows 安装 Node.js LTS 后执行：

```powershell
cd D:\AI
npx create-next-app@latest comfy-mobile --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
cd comfy-mobile
npm install zod jose bcryptjs @prisma/client
npm install -D prisma
npx prisma init --datasource-provider sqlite
```

添加 PWA 前先完成浏览器版；PWA 只是在最终阶段加入 manifest、图标和 service worker。这样调试最简单。

### 5.3 建议目录和职责

```text
src/
  app/
    (auth)/login/page.tsx             # 登录
    generate/page.tsx                 # 提示词、开关、提交、进度、结果
    gallery/page.tsx                  # 当前用户历史记录
    api/auth/login/route.ts           # 签发 HttpOnly session cookie
    api/auth/logout/route.ts
    api/jobs/route.ts                 # POST 创建任务、GET 列表
    api/jobs/[id]/route.ts            # GET 单任务状态
    api/images/[id]/route.ts          # 权限校验后流式返回图片
  lib/
    auth.ts                           # 密码验证、会话、requireUser
    db.ts                             # Prisma 单例
    workflow.ts                       # JSON 深拷贝、输入验证后映射节点
    comfy-client.ts                   # /prompt、/history、/view 的唯一封装
    job-runner.ts                     # 串行任务执行器和状态持久化
    validation.ts                     # Zod schema
  types/
    job.ts
workflow/krea2.json                   # 不对外静态发布
prisma/schema.prisma
```

### 5.4 数据模型

初版只有一个管理员账户时，仍保留 `User`，避免未来改表。密码只存 bcrypt 哈希。

```prisma
model User {
  id           String   @id @default(cuid())
  username     String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  jobs         Job[]
}

model Job {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  status      String   // queued | running | succeeded | failed | cancelled
  prompt      String
  optionsJson String
  comfyPromptId String? @unique
  error       String?
  outputFile  String?
  outputSubfolder String?
  outputType  String?
  createdAt   DateTime @default(now())
  startedAt   DateTime?
  completedAt DateTime?
}
```

执行 `npx prisma migrate dev --name init`。生产环境使用 `npx prisma migrate deploy`，不要在上线机器运行会重建数据库的命令。

### 5.5 API 契约

`POST /api/jobs` 请求：

```json
{
  "prompt": "一只橘猫在窗边晒太阳",
  "aspectRatio": "3:4",
  "megapixels": 1,
  "seed": -1,
  "refinePrompt": false,
  "enableLora": false,
  "upscale": true
}
```

成功响应：

```json
{ "jobId": "cm...", "status": "queued", "queuePosition": 1 }
```

`GET /api/jobs/:id` 响应：

```json
{
  "id": "cm...",
  "status": "running",
  "progress": { "node": "162:138", "value": 4, "max": 8 },
  "imageUrl": null,
  "error": null
}
```

完成后 `imageUrl` 为 `/api/images/:id`。该路由从数据库找到 ComfyUI 输出文件，经路径白名单验证后读取；不得接收任意 `filename` 查询参数，避免目录穿越与未授权图片访问。

### 5.6 ComfyUI 调用规则

1. 新建任务后由单例 `job-runner` 取出最早的 `queued` 任务，标为 `running`。
2. `workflow.ts` 从磁盘读取模板并深拷贝，然后只修改第 2 节允许的节点字段。
3. 后端生成 UUID `client_id`，请求 `POST http://127.0.0.1:8188/prompt`，body 为 `{ prompt, client_id }`。
4. 将返回的 `prompt_id` 写入 `comfyPromptId`。HTTP 返回 `node_errors` 时直接将任务记为 `failed`，前端显示经过整理的错误信息。
5. 后端连接 `ws://127.0.0.1:8188/ws?clientId=<client_id>`。只接受该 `prompt_id` 的 `progress`、`execution_error` 和 `execution_success` 事件。
6. 成功事件后请求 `/history/<prompt_id>`，从 `157`（开高清修复）或 `161`（不开）对应的输出中读取 `filename`、`subfolder`、`type`，写入数据库。
7. 任何连接超时、服务重启或 30 分钟无终态都标记为 `failed`，保留诊断日志；不要无限等待。

`/prompt` 是提交并校验工作流的接口；`/history/{prompt_id}` 用于拿历史输出；`/ws` 提供 `progress`、`execution_success` 与 `execution_error`。这些均是 [ComfyUI 官方 Server API](https://docs.comfy.org/zh/development/comfyui-server/comms_routes) 的公开路由与事件。

### 5.7 手机 UI 的第一版范围

- 登录页：用户名、密码；请求失败不透露“用户不存在”或“密码错误”的区别。
- 生成页：提示词大文本框、比例分段按钮、高清修复/润色/LoRA 开关、种子输入与“随机”按钮、提交按钮。
- 任务状态：排队、生成中、失败、成功；生成中每 1–2 秒请求 `GET /api/jobs/:id`。
- 结果页：大图预览、下载、复制提示词、使用相同参数再次生成。
- 画廊：仅显示当前用户的结果，按创建时间倒序；删除功能放到第二期。
- 显示“请勿提交违法、侵权、非自愿或涉及未成年人的内容”的规则，并在提交前做基本长度限制和人工可维护的关键词拦截。不要把系统安全仅建立在提示词过滤上。

### 5.8 身份认证和防滥用

- 第一版使用一个管理员账户，不做注册页。创建账号的脚本只能在 Windows 本机执行。
- Session 使用签名 JWT，放在 `HttpOnly; Secure; SameSite=Lax; Path=/` Cookie；密钥放在 `.env.local`，不提交 Git。
- 为 `POST /api/auth/login` 和 `POST /api/jobs` 加 IP + 用户维度限流；建议登录 5 次/15 分钟，生成 10 次/小时，按显卡能力调整。
- 一个用户同时最多 1 个 queued/running 任务；总队列最多 10 个。超过时返回 429。
- 所有图片路由必须调用 `requireUser()`，并确认 `job.userId === session.userId`。
- 日志不要记录密码、Cookie、完整 Authorization 或原始 ComfyUI 工作流。提示词是否记录由你决定；若是私用服务，可保留，若多人使用，应明确告知保存期限。

### 5.9 环境变量

创建 `D:\AI\comfy-mobile\.env.local`，永远不要提交：

```dotenv
DATABASE_URL="file:./dev.db"
AUTH_SECRET="使用密码管理器生成的至少32字节随机值"
COMFYUI_BASE_URL="http://127.0.0.1:8188"
COMFYUI_OUTPUT_DIR="D:/AI/ComfyUI/output"
APP_ORIGIN="https://ai.example.com"
```

## 6. 群晖：HTTPS 与反向代理

以下以子域名 `ai.example.com`、Windows Tailscale IP `100.101.102.103`、端口 `3000` 为例，必须换成真实值。

### 6.1 域名和证书

1. 在 DNS 服务商将 `ai` 的 A/AAAA 或 CNAME 按现有群晖公网域名方案配置好。
2. 在 DSM「控制面板 → 安全性 → 证书」为 `ai.example.com` 申请或导入 Let's Encrypt 证书。
3. 在「设置 → 配置」将该证书指派给 `ai.example.com`。
4. 路由器只转发 TCP 80（证书续签若需要）与 TCP 443 到群晖。不要转发 3000/8188。

### 6.2 DSM 反向代理规则

进入「控制面板 → 登录门户 → 高级 → 反向代理」，新增规则：

| 项目 | 值 |
|---|---|
| 来源协议 | `HTTPS` |
| 来源主机名 | `ai.example.com` |
| 来源端口 | `443` |
| 目标协议 | `HTTP` |
| 目标主机名 | `100.101.102.103`（或 MagicDNS 名称） |
| 目标端口 | `3000` |

在「自定义标题」添加：

```text
Host: $host
X-Real-IP: $remote_addr
X-Forwarded-For: $proxy_add_x_forwarded_for
X-Forwarded-Proto: https
```

DSM 反向代理通常会处理 WebSocket Upgrade，但本项目一期采用浏览器轮询，反代规则不用为 ComfyUI WebSocket 单独开放路径。若第二期改成 SSE，确保反向代理关闭响应缓冲或将 SSE 路由专门配置为不缓存。

### 6.3 DSM 防火墙

- 允许互联网访问 443；80 仅用于证书验证时允许。
- 允许群晖通过 Tailscale 接口访问 Windows 的 3000。
- 不要把 DSM 管理端口暴露给所有互联网地址；管理使用 VPN、Tailscale 或可信 IP 白名单。

## 7. 上线顺序与验收

按此顺序执行，每一步成功才进入下一步。

1. **工作流验收**：ComfyUI 画布 Queue 成功；普通和高清修复两条输出都能找到图片。
2. **本机 API 验收**：Windows 浏览器访问 `http://localhost:3000`，登录、生成、显示图片均成功。
3. **本机隔离验收**：确认 `http://<Windows-LAN-IP>:8188` 无法访问；确认后端能访问 `127.0.0.1:8188/system_stats`。
4. **Tailscale 验收**：从群晖能访问 `http://100.101.102.103:3000`；从外网无法直接访问该 IP/端口。
5. **群晖反代验收**：手机关闭 Wi-Fi、使用移动网络访问 `https://ai.example.com`，登录和生成成功。
6. **断线验收**：关闭 Windows Tailscale，域名应返回 502，且不能泄露 ComfyUI 信息；恢复后服务自动可用。
7. **安全验收**：未登录请求 `/api/jobs` 和 `/api/images/:id` 应返回 401；用户 A 不能读取用户 B 的任务 ID。
8. **性能验收**：连续提交超过并发阈值的任务，确认只排队不同时挤占 GPU；ComfyUI 重启时任务会在超时后失败并展示可读错误。

## 8. 开机自动启动与备份

### Windows 自动启动

用 Windows 任务计划程序创建两个“计算机启动时”任务：

1. `ComfyUI Server`：运行 `D:\AI\ComfyUI\run-server.bat`，使用“无论用户是否登录都运行”，失败后每分钟重试 3 次。
2. `Comfy Mobile App`：工作目录 `D:\AI\comfy-mobile`，启动命令为 `npm run start -- --hostname 0.0.0.0 --port 3000`。先执行 `npm run build`，生产环境不要运行 `npm run dev`。

Tailscale 服务保持开机启动。任务启动依赖可设置为网络可用后延迟 30 秒，避免电脑刚开机时 API 先于 Tailscale、ComfyUI 启动。

### 备份

每日从 Windows 备份到群晖共享文件夹或 Hyper Backup 目标：

```text
D:\AI\comfy-mobile\prisma\*.db
D:\AI\comfy-mobile\workflow\krea2.json
D:\AI\comfy-mobile\.env.local（加密备份）
D:\AI\ComfyUI\output\（按需要保留最近 30 天）
```

模型文件体积大，单独记录来源、校验值和模型目录，不建议把所有模型重复备份到群晖，除非空间充足。

## 9. 常见故障定位

| 现象 | 排查顺序 |
|---|---|
| `/prompt` 400 / `node_errors` | 在 ComfyUI UI 重跑同一个模板；检查节点 ID、自定义节点、模型文件名和类型 |
| 手机显示 502 | 群晖反代目标是否为正确 Tailscale IP；Windows 是否开机、Tailscale 是否连接、3000 是否监听 |
| 手机登录成功但生成失败 | 后端日志中的 ComfyUI HTTP 状态；确认 `COMFYUI_BASE_URL` 仍为 `127.0.0.1:8188` |
| Tailscale 与 Clash 冲突 | 关闭 Exit Node；在 Clash TUN 增加 `100.64.0.0/10,DIRECT,no-resolve` 后重启 Clash |
| 图片生成了但前端空白 | `history` 返回的 filename/subfolder/type 是否被完整存库；输出目录是否和 `COMFYUI_OUTPUT_DIR` 一致 |
| 高分修复失败 | 单独检查 `159:*` 的 Z-Image、VAE、RealESRGAN 和显存；临时关闭 `upscale` 验证主图流程 |
| 重启后服务不通 | 任务计划程序历史、ComfyUI 控制台日志、`npm run start` 日志、Tailscale 服务状态 |

## 10. 第二期路线图

1. 将轮询升级为后端 SSE，给手机更平滑的队列和进度显示。
2. 支持图片上传/图生图：后端校验 MIME、大小和像素，使用 ComfyUI `/upload/image`，不允许前端指定服务器路径。
3. 增加邀请码、多个用户、配额和管理后台。
4. 将图片异步复制到群晖对象存储或共享目录，降低 Windows 磁盘压力。
5. 若需要电脑离线时仍可受理任务，才在群晖引入 Redis/数据库队列；在单机 GPU 私用场景中，当前 SQLite 串行队列更简单可靠。

## 11. 参考资料

- [ComfyUI：API 示例](https://docs.comfy.org/zh/development/comfyui-server/api-examples)
- [ComfyUI：Server 路由与 WebSocket 事件](https://docs.comfy.org/zh/development/comfyui-server/comms_routes)
- [ComfyUI：工作流 API 格式](https://docs.comfy.org/zh/development/api-development/workflow-api-format)
- [ComfyUI：启动参数](https://docs.comfy.org/zh/development/comfyui-server/startup-flags)

