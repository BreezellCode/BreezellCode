# Publishes a newer build of the text service without administrator rights: programs running the
# text service (version 3 or later) swap to it between keys, within a few seconds; nothing restarts.
#   publish-tip.ps1 -Version <n> -From <folder with BreezellIME64.dll and BreezellIME32.dll>
# The DLLs must be built with TIP_VERSION <n> (cl /DTIP_VERSION=<n>, or the #define).
param(
	[Parameter(Mandatory = $true)][int]$Version,
	[Parameter(Mandatory = $true)][string]$From
)
$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:LOCALAPPDATA "BreezellIME\tip\$Version"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
foreach ($name in 'BreezellIME64.dll', 'BreezellIME32.dll') {
	$source = Get-ChildItem -Path $From -Recurse -Filter $name | Select-Object -First 1
	if (-not $source) { throw "$name not found under $From" }
	Copy-Item $source.FullName (Join-Path $dir $name) -Force
}
# Not New-Item -Force on a key that exists: that empties it (HostExe and HostScript would go).
if (-not (Test-Path 'HKCU:\Software\BreezellIME')) { New-Item -Path 'HKCU:\Software\BreezellIME' | Out-Null }
Set-ItemProperty -Path 'HKCU:\Software\BreezellIME' -Name TipVersion -Value $Version -Type DWord
# Older published builds go (a program may still hold one loaded: it stays until that program ends).
Get-ChildItem (Join-Path $env:LOCALAPPDATA 'BreezellIME\tip') -Directory | Where-Object { [int]$_.Name -lt $Version - 1 } | ForEach-Object { Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
Write-Host "Published text service build $Version to $dir"
