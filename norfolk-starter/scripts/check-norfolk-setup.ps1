Write-Host "Checking Norfolk Claude setup..."

$claudeRoot = Join-Path $HOME ".claude"
$skillsRoot = Join-Path $claudeRoot "skills"
$settingsFile = Join-Path $claudeRoot "settings.json"

Write-Host ""
Write-Host "Claude root: $claudeRoot"

if (Test-Path $settingsFile) {
  Write-Host "[OK] settings.json found"
} else {
  Write-Host "[MISSING] settings.json not found"
}

$skills = @(
  "nai-help",
  "nai-update",
  "nai-plan",
  "nai-feature",
  "nai-frontend",
  "nai-review",
  "nai-architecture",
  "nai-agent-native-audit",
  "nai-agent-native-architecture",
  "nai-finance",
  "nai-debug",
  "nai-research"
)

foreach ($skill in $skills) {
  $path = Join-Path $skillsRoot $skill
  if (Test-Path $path) {
    Write-Host "[OK] $skill"
  } else {
    Write-Host "[MISSING] $skill"
  }
}

Write-Host ""
Write-Host "Next checks to run inside Claude Code:"
Write-Host "  /doctor"
Write-Host "  /plugins"
Write-Host "  /nai-update"
