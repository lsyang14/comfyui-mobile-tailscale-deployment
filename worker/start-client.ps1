param(
  [Parameter(Mandatory=$true)][string]$ServerUrl,
  [Parameter(Mandatory=$true)][string]$Token,
  [string]$WorkerId = $env:COMPUTERNAME,
  [string]$ComfyUrl = 'http://127.0.0.1:8188',
  [string]$Workflow = "$PSScriptRoot\..\workflow-krea2.json"
)

$env:WORKER_SERVER_URL = $ServerUrl
$env:WORKER_TOKEN = $Token
$env:WORKER_ID = $WorkerId
$env:COMFYUI_BASE_URL = $ComfyUrl
$env:WORKFLOW_PATH = $Workflow
node "$PSScriptRoot\client.js"
