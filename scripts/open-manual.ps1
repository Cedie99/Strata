<#
.SYNOPSIS
  Opens the Strata user manual pages in Microsoft Edge.

.DESCRIPTION
  Reads the page list from docs/manual/README.md (the "Pages" table), so pages added to the manual
  later are opened too without changing this script. All pages open as tabs in one new Edge window,
  "Start here" first.

.PARAMETER Page
  Open only the pages whose name contains this text, e.g. -Page sales or -Page "finance".

.PARAMETER List
  Print the pages and their links instead of opening them.

.EXAMPLE
  npm run manual
  .\scripts\open-manual.ps1 -Page purchasing
  .\scripts\open-manual.ps1 -List
#>
param(
  [string]$Page = "",
  [switch]$List
)

$ErrorActionPreference = "Stop"
$index = Join-Path $PSScriptRoot "..\docs\manual\README.md"
if (-not (Test-Path $index)) { throw "Manual index not found: $index" }

# Rows look like: | Sales | `sales.html` | https://claude.ai/artifact/... | ... |
$pages = foreach ($line in Get-Content $index -Encoding UTF8) {
  if ($line -match '^\|\s*([^|]+?)\s*\|[^|]*\|\s*(https://claude\.ai/artifact/[A-Za-z0-9]+)\s*\|') {
    [pscustomobject]@{ Name = ($Matches[1] -replace '\s*\(.*\)$', ''); Url = $Matches[2] }
  }
}
if (-not $pages) { throw "No manual pages found in $index" }
if ($Page) {
  $pages = @($pages | Where-Object { $_.Name -like "*$Page*" })
  if (-not $pages) { throw "No manual page matches '$Page'. Run with -List to see them." }
}

if ($List) {
  $pages | Format-Table -AutoSize
  return
}

# Edge is installed on every Windows 10/11 PC; fall back to the default browser if it is missing.
$edge = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($edge) {
  Start-Process -FilePath $edge -ArgumentList (@("--new-window") + @($pages.Url))
  Write-Host "Opened $(@($pages).Count) manual page(s) in Microsoft Edge."
} else {
  Write-Warning "Microsoft Edge was not found; opening in the default browser instead."
  foreach ($p in $pages) { Start-Process $p.Url }
}
