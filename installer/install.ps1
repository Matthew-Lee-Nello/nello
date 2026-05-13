# nello-claw installer - Windows. One paste, one UAC prompt, done.
#
# Usage (in PowerShell):
#   irm https://labs.nello.gg/i/win | iex
#
# Bundle: looks in $HOME\Downloads\nello-claw-bundle.json by default.

$ErrorActionPreference = "Stop"

# Theme
$Accent = "$([char]0x1B)[38;2;255;166;0m"
$White  = "$([char]0x1B)[38;2;255;255;255m"
$Red    = "$([char]0x1B)[38;2;255;80;80m"
$Dim    = "$([char]0x1B)[2m"
$Reset  = "$([char]0x1B)[0m"

function Say($m)  { Write-Host "  ${Accent}=>${Reset} ${White}$m${Reset}" }
function Ok($m)   { Write-Host "  ${Accent}OK${Reset} $m" }
function Warn($m) { Write-Host "  ${Accent}!${Reset} $m" }
function Fail($m) { Write-Host "  ${Red}X${Reset} $m"; exit 1 }

# Install into the folder the user is currently in (override via NC_INSTALL_PATH env var).
$InstallPath = if ($env:NC_INSTALL_PATH) { $env:NC_INSTALL_PATH } else { (Get-Location).Path }
$TemplateRef = if ($env:NC_TEMPLATE_REF) { $env:NC_TEMPLATE_REF } else { "main" }
$TemplateRepo = "https://github.com/Matthew-Lee-Nello/nello-claw.git"
$LogFile = Join-Path $InstallPath "install.log"

Write-Host ""
Write-Host "${Accent}nello-claw installer${Reset}"
Write-Host "${Dim}install path: $InstallPath${Reset}"
Write-Host ""

# Refuse to install into a folder that already has unrelated files
if ((Test-Path $InstallPath) -and -not (Test-Path (Join-Path $InstallPath ".git"))) {
  $existing = Get-ChildItem -Path $InstallPath -Force | Where-Object { $_.Name -notmatch '^\.' -and $_.Name -ne 'bundle.json' -and $_.Name -ne 'install.log' }
  if ($existing.Count -gt 0) {
    Fail "Folder $InstallPath already has files. Make a fresh empty folder, cd into it, then rerun."
  }
}

# Reject preexisting bundle.json / install.log if they are reparse points (junctions/symlinks).
# Without this, an attacker who can pre-place such a link turns Start-Transcript and
# Copy-Item below into an overwrite primitive on whatever the link points at.
foreach ($_NC_NAME in @('install.log', 'bundle.json')) {
  $_NC_TARGET = Join-Path $InstallPath $_NC_NAME
  if (Test-Path $_NC_TARGET) {
    $_NC_ITEM = Get-Item $_NC_TARGET -Force
    if ($_NC_ITEM.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
      Fail "Refusing to install: $_NC_TARGET is a symlink/junction. Remove it and rerun."
    }
  }
}

New-Item -ItemType Directory -Force -Path $InstallPath | Out-Null
Start-Transcript -Path $LogFile -Force | Out-Null

# 1. Check winget (Windows 10 1709+ / 11 ships it)
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  Fail "winget missing. Update Windows or install App Installer from Microsoft Store, then retry."
}

# 2. Auto-install Node 20+ if missing or too old
$nodeMajor = 0
if (Get-Command node -ErrorAction SilentlyContinue) {
  $nodeMajor = [int](node -e "console.log(parseInt(process.versions.node.split('.')[0],10))")
}
if ($nodeMajor -lt 20) {
  Say "installing Node.js (UAC prompt)"
  winget install --silent --accept-source-agreements --accept-package-agreements OpenJS.NodeJS.LTS
  $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
}
Ok "node $(node --version)"

# 3. Auto-install git
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Say "installing git"
  winget install --silent --accept-source-agreements --accept-package-agreements Git.Git
  $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
}
Ok "git $((git --version) -split ' ' | Select-Object -Index 2)"

# 4. Auto-install pnpm + claude
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Say "installing pnpm"
  npm install -g pnpm 2>$null | Out-Null
}
Ok "pnpm $(pnpm --version)"

# Obsidian.app install delegated to template/bootstrap.js so all entry paths hit
# the same code (bash one-liner / PowerShell / Claude Code paste-in / manual clone).
$ObsidianExe = "$env:LOCALAPPDATA\Obsidian\Obsidian.exe"

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  Say "installing Claude Code CLI"
  npm install -g @anthropic-ai/claude-code 2>$null | Out-Null
}
if (Get-Command claude -ErrorAction SilentlyContinue) { Ok "claude installed" }

# 5. Locate bundle
$BundlePath = if ($env:NC_BUNDLE) { $env:NC_BUNDLE } else { "" }
if (-not $BundlePath) {
  $candidates = @(
    (Join-Path $HOME "Downloads\nello-claw-bundle.json"),
    (Join-Path $HOME "Downloads\bundle.json")
  )
  foreach ($c in $candidates) { if (Test-Path $c) { $BundlePath = $c; break } }
}
if (-not $BundlePath -or -not (Test-Path $BundlePath)) {
  Fail "bundle.json not found in Downloads. Complete the wizard at labs.nello.gg first."
}
Ok "bundle: $BundlePath"

# 6. Clone or update
if (Test-Path (Join-Path $InstallPath ".git")) {
  Say "updating template"
  git -C "$InstallPath" fetch --quiet origin $TemplateRef
  git -C "$InstallPath" reset --hard "origin/$TemplateRef" --quiet
} else {
  Say "cloning template"
  if (Test-Path $InstallPath) {
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) "nello-claw-clone-$([guid]::NewGuid())"
    git clone --depth 1 --branch $TemplateRef $TemplateRepo $tmp --quiet
    Copy-Item -Path "$tmp\*" -Destination $InstallPath -Recurse -Force
    Remove-Item -Recurse -Force $tmp
  } else {
    git clone --depth 1 --branch $TemplateRef $TemplateRepo $InstallPath --quiet
  }
}
Ok "template ready"

# 7. Copy bundle (defence-in-depth: re-check destination is not a reparse point)
$_NC_BUNDLE_DEST = Join-Path $InstallPath "bundle.json"
if (Test-Path $_NC_BUNDLE_DEST) {
  $_NC_BUNDLE_ITEM = Get-Item $_NC_BUNDLE_DEST -Force
  if ($_NC_BUNDLE_ITEM.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
    Fail "Refusing to write bundle: $_NC_BUNDLE_DEST became a symlink/junction."
  }
}
Copy-Item $BundlePath $_NC_BUNDLE_DEST -Force

# 8. Install deps + build
Set-Location $InstallPath
Say "installing dependencies (1-2 min)"
pnpm install --silent
Say "building"
pnpm -r --filter '!@nc/web' build | Out-Null
Ok "build complete"

# 9. Run bootstrap
$env:NC_INSTALL_PATH = $InstallPath
node (Join-Path $InstallPath "template\bootstrap.js")

# 10. Drop Start Menu + Desktop shortcut (Chrome --app, falls back to Edge)
$startMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\nello-claw.lnk"
$desktop = Join-Path $HOME "Desktop\nello-claw.lnk"

$chromePath = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chromePath)) { $chromePath = "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe" }
if (-not (Test-Path $chromePath)) { $chromePath = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe" }
if (-not (Test-Path $chromePath)) { $chromePath = $null }

# Use bundled .ico from cloned repo for the shortcut icon
$icoPath = Join-Path $InstallPath "installer\icon.ico"
if (-not (Test-Path $icoPath)) { $icoPath = $null }

# Read DASHBOARD_PORT from this install's .env so the shortcut points at the
# right port. Hard-coding 3000 sent users to the wrong dashboard when they
# picked a different port.
$ShortcutPort = "3000"
$envFileForShortcut = Join-Path $InstallPath ".env"
if (Test-Path $envFileForShortcut) {
  $portLineForShortcut = Get-Content $envFileForShortcut | Select-String -Pattern '^DASHBOARD_PORT='
  if ($portLineForShortcut) { $ShortcutPort = (($portLineForShortcut -split '=', 2)[1]).Trim('"') }
}
$ShortcutUrl = "http://localhost:$ShortcutPort"

foreach ($shortcutPath in @($startMenu, $desktop)) {
  $WshShell = New-Object -ComObject WScript.Shell
  $shortcut = $WshShell.CreateShortcut($shortcutPath)
  if ($chromePath) {
    $shortcut.TargetPath = $chromePath
    $shortcut.Arguments = "--app=$ShortcutUrl"
  } else {
    $shortcut.TargetPath = $ShortcutUrl
  }
  if ($icoPath) {
    $shortcut.IconLocation = "$icoPath,0"
  } elseif ($chromePath) {
    $shortcut.IconLocation = "$chromePath,0"
  }
  $shortcut.Description = "nello-claw - your AI Chief Operations Officer"
  $shortcut.Save()
}
Ok "shortcuts created (Start Menu + Desktop)"

# 11. Wait for daemon health, then open the dashboard
$DashboardPort = "3000"
$envFile = Join-Path $InstallPath ".env"
if (Test-Path $envFile) {
  $portLine = Get-Content $envFile | Select-String -Pattern '^DASHBOARD_PORT='
  if ($portLine) { $DashboardPort = (($portLine -split '=', 2)[1]).Trim('"') }
}
$DashboardUrl = "http://localhost:$DashboardPort"

Say "waiting for dashboard to come up"
$Healthy = $false
for ($i = 0; $i -lt 30; $i++) {
  try {
    $resp = Invoke-WebRequest -Uri "$DashboardUrl/api/monitoring/health" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    if ($resp.StatusCode -eq 200) { $Healthy = $true; break }
  } catch {}
  Start-Sleep -Seconds 1
}

function Open-Dashboard {
  if ($script:chromePath) {
    Start-Process -FilePath $script:chromePath -ArgumentList "--app=$script:DashboardUrl" -ErrorAction SilentlyContinue
  } else {
    Start-Process $script:DashboardUrl -ErrorAction SilentlyContinue
  }
  if ((Test-Path $script:ObsidianExe) -and (Test-Path (Join-Path $script:InstallPath "vault"))) {
    $vaultUri = "obsidian://open?path=" + [uri]::EscapeDataString((Join-Path $script:InstallPath "vault"))
    try { Start-Process $vaultUri } catch { Start-Process -FilePath $script:ObsidianExe -ErrorAction SilentlyContinue }
  }
}

# Always open the dashboard + Obsidian vault. Even if the daemon hasn't finished
# starting in 30s, opening the page now means the user sees it the moment it's
# ready. Previous behaviour of leaving the user staring at a terminal made it
# look like the install had silently failed.
if ($Healthy) {
  Ok "dashboard is up at $DashboardUrl"
  Open-Dashboard
} else {
  Warn "dashboard didn't respond on /api/monitoring/health within 30s."
  Warn "opening it anyway - the daemon may still be starting in the background."
  Open-Dashboard
  Write-Host ""
  Write-Host "  ${Dim}Last 30 lines of $InstallPath\store\server.log (so you can see why):${Reset}"
  $logFile = Join-Path $InstallPath "store\server.log"
  if (Test-Path $logFile) {
    Get-Content $logFile -Tail 30 | ForEach-Object { Write-Host "  $_" }
  } else {
    Write-Host "  (no server.log found yet - daemon may not have started)"
  }
  Write-Host ""
  Write-Host "  ${Accent}If the dashboard tab is blank or shows 'can't connect':${Reset}"
  Write-Host "  1. Run ${Accent}/install-doctor${Reset} in Claude Code from this folder"
  Write-Host "  2. Or restart the task: ${Dim}schtasks /Run /TN com.nello-claw.server${Reset}"
}

Stop-Transcript | Out-Null

Write-Host ""
Write-Host "${Accent}nello-claw is installed.${Reset}"
Write-Host "  Dashboard:  $DashboardUrl ${Dim}(already opening in your browser)${Reset}"
Write-Host "  Vault:      $InstallPath\vault ${Dim}(already opening in Obsidian)${Reset}"
Write-Host "  ${Dim}Now send any message to your Telegram bot - that links your phone to your assistant.${Reset}"
Write-Host ""
Write-Host "${Dim}Stuck? Type ${Reset}${Accent}/install-doctor${Reset}${Dim} in Claude Code from this folder for a full audit.${Reset}"
Write-Host ""
