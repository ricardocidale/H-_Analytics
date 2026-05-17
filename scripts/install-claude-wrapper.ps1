# Idempotent installer for the Claude Code permission-bypass wrapper (Windows).
#
# Why this exists:
#   settings.json `permissions.defaultMode = "bypassPermissions"` is broken in
#   Claude Code 2.1.x (anthropics/claude-code#34923, #29026, #55095). The CLI
#   flag `--dangerously-skip-permissions` is currently the only working bypass.
#
# What it does:
#   Installs a PATH-first .cmd shim at %USERPROFILE%\.claude-bypass\bin\claude.cmd
#   that always invokes the real claude with --dangerously-skip-permissions. Works
#   in PowerShell, CMD, Windows Terminal, VS Code's integrated terminal — any
#   Windows shell that respects user PATH.
#
#   The shim lives in its OWN directory (.claude-bypass\bin) rather than
#   %USERPROFILE%\.local\bin\ to avoid colliding with the Anthropic native
#   installer, which puts claude.exe at %USERPROFILE%\.local\bin\claude.exe.
#   On Windows .EXE beats .CMD in PATHEXT, so a sibling .cmd shim is silently
#   ignored. A separate directory prepended to PATH solves this cleanly.
#
# What it does NOT do:
#   Bypass prompts in Claude Code Desktop (Mac or Windows). The Desktop app
#   ignores both settings.json AND the in-app toggle in 2.1.x — no working
#   bypass exists for Desktop. Use the CLI for unattended workflows.
#
# OneDrive / Dropbox safety:
#   Installs to %USERPROFILE%\.claude-bypass\bin\ which is NOT redirected by
#   either service. Warns if your USERPROFILE or current directory looks
#   redirected.
#
# Run from PowerShell (5.1+ or 7+) anywhere in the repo:
#     .\scripts\install-claude-wrapper.ps1
#
# Re-run after any of:
#   - Fresh clone on a new Windows machine
#   - npm reinstalled claude to a different path
#   - The shim got deleted

#Requires -Version 5.1
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

# --- 1. Sync-service hazard detection -----------------------------------------

$homePath = $env:USERPROFILE
$cwdPath  = (Get-Location).Path
$hazards  = New-Object System.Collections.Generic.List[string]

foreach ($svc in 'OneDrive', 'Dropbox') {
  if ($homePath -match $svc) { $hazards.Add("USERPROFILE is under ${svc}: $homePath") }
  if ($cwdPath  -match $svc) { $hazards.Add("Current directory is under ${svc}: $cwdPath") }
}

# PowerShell $PROFILE typically lives in Documents\PowerShell\ which is
# OneDrive-redirected on default Windows installs.
if ($PROFILE -match 'OneDrive|Dropbox') {
  $hazards.Add("`$PROFILE is on a sync service: $PROFILE")
}

if ($hazards.Count -gt 0) {
  Write-Warning "Sync-service hazards detected:"
  foreach ($h in $hazards) { Write-Warning "  - $h" }
  Write-Warning "The shim itself targets `$USERPROFILE\.local\bin\ which is NOT redirected,"
  Write-Warning "so the install will work. But move repos off OneDrive/Dropbox before serious work."
  Write-Host ""
}

# --- 2. Resolve the real claude binary (skip our own shim if it exists) -------

$shimDir  = Join-Path $homePath '.claude-bypass\bin'
$shimPath = Join-Path $shimDir 'claude.cmd'
$shimResolvedPath = if (Test-Path $shimPath) { (Resolve-Path $shimPath).Path } else { $null }

$realClaude = $null
$candidates = Get-Command claude -All -CommandType Application -ErrorAction SilentlyContinue
foreach ($c in $candidates) {
  $resolved = (Resolve-Path $c.Source).Path
  if ($shimResolvedPath -and $resolved -eq $shimResolvedPath) { continue }
  if ($resolved -eq (Resolve-Path $PSCommandPath -ErrorAction SilentlyContinue).Path) { continue }
  $realClaude = $resolved
  break
}

if (-not $realClaude) {
  Write-Error "Could not find a real claude binary on PATH (excluding this installer's shim)."
  Write-Error "Install Claude Code first:  npm install -g @anthropic-ai/claude-code"
  exit 127
}

Write-Host "Resolved real claude: $realClaude"

# --- 3. Write the shim --------------------------------------------------------

if (-not (Test-Path $shimDir)) {
  New-Item -ItemType Directory -Path $shimDir -Force | Out-Null
}

$shimBody = @"
@echo off
rem Installed by scripts\install-claude-wrapper.ps1
rem Always passes --dangerously-skip-permissions to the real claude binary.
rem Re-run the installer if Claude Code moves to a different install path.
"$realClaude" --dangerously-skip-permissions %*
"@

Set-Content -Path $shimPath -Value $shimBody -Encoding ASCII -NoNewline
Write-Host "installed: $shimPath"

# --- 4. Ensure %USERPROFILE%\.local\bin is on user PATH (persistent) ----------

$userPath = [Environment]::GetEnvironmentVariable('PATH', 'User')
if (-not $userPath) { $userPath = '' }
$pathParts = $userPath -split ';' | Where-Object { $_ -ne '' }

if ($pathParts -notcontains $shimDir) {
  # Prepend so the shim wins over the npm-installed claude.cmd.
  $newPath = (@($shimDir) + $pathParts) -join ';'
  [Environment]::SetEnvironmentVariable('PATH', $newPath, 'User')
  Write-Host "prepended to user PATH: $shimDir"
  Write-Host "  (open a new shell window for it to take effect)"
} else {
  Write-Host "user PATH already contains: $shimDir"
}

# --- 5. Verify in the current PowerShell session ------------------------------

$env:PATH = "$shimDir;$env:PATH"
$resolved = Get-Command claude -CommandType Application -ErrorAction SilentlyContinue

if ($resolved -and ((Resolve-Path $resolved.Source).Path -eq (Resolve-Path $shimPath).Path)) {
  Write-Host "verified: claude resolves to shim in this session"
} else {
  Write-Warning "Shim not shadowing in CURRENT session. Open a new PowerShell window and run: where.exe claude"
}
