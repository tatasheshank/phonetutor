# Uploads the app from this laptop to the Oracle server and redeploys it.
# Run from the project folder in PowerShell:
#   .\deploy\upload.ps1 -Ip 140.238.1.2 -Key C:\Users\you\Downloads\ssh-key.key
# Add -SetupOnly the first time to only upload and run the one-time server setup.
param(
  [Parameter(Mandatory = $true)][string]$Ip,
  [Parameter(Mandatory = $true)][string]$Key,
  [string]$User = "ubuntu",
  [switch]$SetupOnly
)
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$target = "$User@$Ip"
$archive = Join-Path $env:TEMP "aitutor-upload.tgz"

foreach ($f in @(".env", "web.env", "agent.env")) {
  if (-not (Test-Path (Join-Path $root "deploy\$f"))) {
    Write-Host "Missing deploy\$f - copy deploy\$f.example to deploy\$f and fill it in first." -ForegroundColor Red
    exit 1
  }
}

Write-Host "==> Packing the app (no node_modules, build output, secrets or local data)"
if (Test-Path $archive) { Remove-Item $archive -Force -Confirm:$false }
# Windows 10/11 include tar.exe.
tar -czf $archive -C $root `
  --exclude=node_modules --exclude=.next --exclude=dist --exclude=.git --exclude=.claude `
  --exclude=data --exclude=samples --exclude=*.log `
  --exclude=.env --exclude=.env.local --exclude=deploy/web.env --exclude=deploy/agent.env --exclude=deploy/.env `
  .
if ($LASTEXITCODE -ne 0) { throw "tar failed" }
Write-Host ("    {0:N1} MB" -f ((Get-Item $archive).Length / 1MB))

$sshOpts = @("-i", $Key, "-o", "StrictHostKeyChecking=accept-new")

Write-Host "==> Uploading to $target"
ssh @sshOpts $target "mkdir -p ~/aitutor/deploy"
scp @sshOpts $archive "${target}:~/aitutor-upload.tgz"
# Secrets go separately, straight into the deploy folder, readable only by you.
scp @sshOpts (Join-Path $root "deploy\.env") (Join-Path $root "deploy\web.env") (Join-Path $root "deploy\agent.env") "${target}:~/aitutor/deploy/"
ssh @sshOpts $target "chmod 600 ~/aitutor/deploy/*.env ~/aitutor/deploy/.env && tar -xzf ~/aitutor-upload.tgz -C ~/aitutor && rm ~/aitutor-upload.tgz"

if ($SetupOnly) {
  Write-Host "==> Running one-time server setup"
  ssh @sshOpts -t $target "bash ~/aitutor/deploy/oracle/setup-server.sh"
  Write-Host "Setup done. Now run this script again without -SetupOnly to deploy." -ForegroundColor Green
  exit 0
}

Write-Host "==> Building and starting on the server"
ssh @sshOpts -t $target "bash ~/aitutor/deploy/oracle/deploy.sh"
Remove-Item $archive -Force -Confirm:$false
