# ComfyUI Mobile API

当前版本 API 基础地址：

```text
http://localhost:3000
```

公网部署时替换为：

```text
https://你的群晖域名
```

浏览器业务接口使用 HttpOnly Session Cookie；Windows GPU Client 使用 WSS Token。浏览器不能提交 ComfyUI Workflow JSON。

## 1. 健康检查

### `GET /health`

无需登录。

响应：

```json
{
  "ok": true,
  "service": "comfy-mobile",
  "workers": [
    { "id": "GPU-01", "idle": true, "lastSeenAt": 1760000000000 }
  ]
}
```

`workers` 只返回在线 Worker，不包含 Token。

## 2. 用户认证

### `POST /api/auth/user-login`

普通用户入口。管理员账号也允许从普通入口登录生成页。

请求：

```json
{ "username": "lsyang", "password": "你的密码" }
```

成功 `200`，服务端设置 `session` Cookie：

```json
{ "id": "用户ID", "username": "lsyang", "role": "admin" }
```

### `POST /api/auth/admin-login`

管理员独立入口。只允许 `role=admin`。

请求和响应格式同普通登录。

### `GET /api/auth/me`

需要 Session Cookie。返回当前用户：

```json
{ "id": "用户ID", "username": "lsyang", "role": "user" }
```

未登录返回 `401`。

### `POST /api/auth/logout`

删除当前 Session，返回：

```json
{ "ok": true }
```

## 3. ComfyUI 状态

### `GET /api/comfy/status`

当前前端用于顶部在线状态。响应：

```json
{ "online": true, "address": "http://127.0.0.1:8188" }
```

在 Worker 模式下，`online` 表示至少有一个在线且 ComfyUI 可用的 Worker。

## 4. 创建生成任务

### `POST /api/jobs`

需要登录。`Content-Type: application/json`。

Turbo 工作流请求：

```json
{
  "workflow": "krea2-turbo",
  "prompt": "一只橘猫在窗边晒太阳",
  "aspectRatio": "3:4 (Portrait Standard)",
  "megapixels": 1.0,
  "seed": -1,
  "refinePrompt": false,
  "enableLora": false,
  "upscale": true
}
```

HD 4K 工作流请求：

```json
{
  "workflow": "krea2-hd4k",
  "prompt": "一只橘猫在窗边晒太阳",
  "aspectRatio": "3:4 (Portrait Standard)",
  "seed": -1,
  "seedvrResolution": 4096,
  "skinContrast": true,
  "skinContrastStrength": 0.2,
  "skinContrastMode": "normal"
}
```

HD 4K 的 `848.inputs.megapixels` 固定为工作流默认值 `1.5`；节点 `702` 不接受前端修改。`seedvrResolution` 会同时写入：

```text
713.inputs.resolution
713.inputs.max_resolution
```

响应 `202`：

```json
{ "jobId": "任务ID", "status": "queued", "queuePosition": 1 }
```

允许的 `aspectRatio`：

```text
1:1 (Square)
2:3 (Portrait Photo)
3:2 (Photo)
3:4 (Portrait Standard)
4:3 (Standard)
9:16 (Portrait Widescreen)
16:9 (Widescreen)
21:9 (Ultrawide)
```

`seed` 使用 `-1` 表示随机种子，或使用安全整数。HD `seedvrResolution` 范围为 `1024`～`8192`，必须是 `256` 的倍数。皮肤强度范围为 `0`～`1`。

## 5. 查询任务

### `GET /api/jobs/:jobId`

需要登录，且只能查询自己的任务。

处理中响应示例：

```json
{
  "id": "任务ID",
  "status": "running",
  "promptId": null,
  "queuePosition": 0,
  "progress": {
    "value": 4,
    "max": 8,
    "percent": 50,
    "node": "162:138",
    "label": "正在生成…"
  },
  "output": null,
  "imageUrl": null,
  "error": null
}
```

完成响应：

```json
{
  "id": "任务ID",
  "status": "succeeded",
  "progress": { "value": 1, "max": 1, "percent": 100, "label": "上传完成" },
  "output": { "filename": "20260813-abc.png", "subfolder": "", "type": "output" },
  "imageUrl": "http://图床域名/上传后的图片.png",
  "error": null
}
```

可能状态：

```text
queued → running → succeeded
queued → running → failed
```

## 6. 图库

### `GET /api/gallery`

需要登录，只返回当前用户的图库。

响应：

```json
{
  "items": [
    {
      "id": "图库记录ID",
      "job_id": "任务ID",
      "image_url": "http://图床地址/image.png",
      "prompt": "提示词",
      "aspect_ratio": "3:4 (Portrait Standard)",
      "megapixels": 1.5,
      "seed": -1,
      "refine_prompt": 0,
      "enable_lora": 0,
      "upscale": 0,
      "status": "succeeded",
      "created_at": "2026-08-13T12:00:00.000Z"
    }
  ]
}
```

### `GET /api/images/:jobId`

需要登录。服务端检查任务归属后，从数据库中的图床 URL 拉取图片并以图片响应返回。用于解决 HTTPS 页面加载 HTTP 图床的混合内容问题。

成功响应：

```text
200 image/png 或 image/jpeg
```

其他用户的任务返回 `404`，图床暂时不可访问返回 `502`。

## 7. 管理员用户接口

以下接口都需要管理员 Session。

### `GET /api/admin/users`

响应：

```json
{ "items": [{ "id": "...", "username": "user1", "role": "user", "created_at": "..." }] }
```

### `POST /api/admin/users`

请求：

```json
{ "username": "user1", "password": "password" }
```

成功 `201`。

### `POST /api/admin/users/:userId/password`

请求：

```json
{ "password": "new-password" }
```

### `DELETE /api/admin/users/:userId`

删除普通用户及其 Session/图库记录。不能删除当前管理员，不能删除管理员账号。

## 8. Windows Worker WSS

连接地址（Token 不放在 URL）：

```text
https://域名/api/worker/ws
```

实际 WebSocket 协议：

```text
https:// → wss://
http://  → ws://（仅本地测试）
```

握手 Header：

```http
Authorization: Bearer WORKER_TOKEN
```

### Worker → 群晖：注册

```json
{
  "type": "hello",
  "workerId": "GPU-01",
  "capabilities": {
    "comfyOnline": true,
    "clientVersion": "1.0.0"
  }
}
```

群晖返回：

```json
{ "type": "hello", "ok": true, "workerId": "GPU-01" }
```

### Worker → 群晖：心跳

建议每 15 秒：

```json
{
  "type": "heartbeat",
  "status": "idle",
  "capabilities": { "comfyOnline": true, "clientVersion": "1.0.0" }
}
```

`status` 可为 `idle`、`busy`、`unavailable`。

### 群晖 → Worker：派发任务

```json
{
  "type": "job",
  "jobId": "任务ID",
  "input": {
    "workflow": "krea2-hd4k",
    "prompt": "提示词",
    "aspectRatio": "3:4 (Portrait Standard)",
    "seed": -1,
    "seedvrResolution": 4096,
    "skinContrast": true,
    "skinContrastStrength": 0.2,
    "skinContrastMode": "normal"
  }
}
```

Worker 收到后本地选择模板：

```text
krea2-turbo → workflow-krea2.json
krea2-hd4k  → workflow-krea2-hd4k.json
```

### Worker → 群晖：开始/进度

```json
{ "type": "started", "jobId": "任务ID" }
```

```json
{
  "type": "progress",
  "jobId": "任务ID",
  "value": 4,
  "max": 8,
  "percent": 50,
  "node": "713"
}
```

### Worker → 群晖：成功结果

```json
{
  "type": "result",
  "jobId": "任务ID",
  "filename": "Krea2HD4k.png",
  "imageBase64": "图片二进制的 Base64 字符串"
}
```

单条 WSS 消息上限当前为约 12 MB。大图生产环境建议改为一次性 HTTPS 上传凭据，而不是继续扩大 Base64 消息。

### Worker → 群晖：失败

```json
{
  "type": "failed",
  "jobId": "任务ID",
  "message": "ComfyUI execution failed"
}
```

## 9. 错误格式

常规错误：

```json
{ "error": "请先登录" }
```

内部异常对外统一为：

```json
{ "error": "服务暂时不可用", "code": "INTERNAL_ERROR" }
```

常见 HTTP 状态码：

```text
200 成功
201 创建成功
202 任务已入队
400 请求参数错误
401 未登录/Token 错误
403 权限不足
404 资源不存在或不属于当前用户
409 用户名冲突
429 队列已满
502 图床上游暂时不可用
```

## 10. 本地联调示例

登录并保存 Cookie：

```bash
curl -c cookie.txt -H 'content-type: application/json' \
  -d '{"username":"lsyang","password":"你的密码"}' \
  http://localhost:3000/api/auth/user-login
```

提交 Turbo 任务：

```bash
curl -b cookie.txt -H 'content-type: application/json' \
  -d '{"workflow":"krea2-turbo","prompt":"一只橘猫","aspectRatio":"3:4 (Portrait Standard)","megapixels":1,"seed":-1}' \
  http://localhost:3000/api/jobs
```

查询任务：

```bash
curl -b cookie.txt http://localhost:3000/api/jobs/任务ID
```

查询图库：

```bash
curl -b cookie.txt http://localhost:3000/api/gallery
```
