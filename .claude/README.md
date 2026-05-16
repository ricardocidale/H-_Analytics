# Claude Code Context: H-Analytics

This repo follows the Norfolk Agent-Native Project Standard.

## Project

- Name: H-Analytics
- Path: F:\Projects\H-Analytics
- Remote: git@github.com:Norfolk-Group/H-Analytics.git
- Priority: highest

## Local rules

- Active repo path must remain under F:\Projects.
- Do not execute this repo from OneDrive.
- Repo-local .claude is the source of truth for project-specific agent instructions.
- Global C:\Users\ricar\.claude is runtime only.
- PowerShell is the default Windows command environment.

## Safe starting commands

`powershell
Get-Location
Get-ChildItem
if (Test-Path package.json) { npm test }
if (Test-Path pyproject.toml) { python -m pytest }
`

## Approval required

Ask before running commands that delete files, move .git, rewrite history, force-push, change remotes, alter global Claude runtime config, or touch OneDrive paths.

## Agent folders

- .claude\agents - repo-specific agent definitions
- .claude\commands - approved project command wrappers
- .claude\skills - repo-local skills and reusable workflows
- .claude\mcp - MCP setup notes and server references
