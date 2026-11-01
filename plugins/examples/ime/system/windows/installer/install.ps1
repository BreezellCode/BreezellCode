# Installs the Breezell IME. Two parts, because they run as different people:
#   -Part machine   as administrator: the text service DLLs in Program Files, registered with Windows
#   -Part user      as the user: the engine host in %LOCALAPPDATA%\BreezellIME, the settings, and
#                   the input method in the user's list (the default one unless -Default $false)
#   -Part all       both (run as administrator, for an administrator who is the user)
#   install.ps1 -Part user -BreezellExe <path to Breezell.exe> [-Data <model folder>] [-Lang 0404|0804|0411|0412] [-Default $false]
# A failure goes to %TEMP%\BreezellIME-install.log, which the plugin shows (an elevated run has no other way to say why).
param(
	[ValidateSet('all', 'machine', 'user')][string]$Part = 'all',
	[string]$BreezellExe = '',
	[string]$Data = '',
	[ValidateSet('0404', '0804', '0411', '0412')][string]$Lang = '0404',
	[bool]$Default = $true
)
$ErrorActionPreference = 'Stop'
trap {
	Set-Content -Path (Join-Path $env:TEMP 'BreezellIME-install.log') -Value "$_" -ErrorAction SilentlyContinue
	exit 1
}
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$clsid = '{124D7B5B-968F-4E0E-BA91-98F4F77D1EB9}'
$profiles = @{
	'0404' = '{CD0ED061-C951-4941-BB08-98818CE24EB3}'
	'0804' = '{AC5C0798-CC51-4140-AF5D-4328BF117D6B}'
	'0411' = '{3865AF80-C7D2-4F3C-AA5A-406A26BE98DA}'
	'0412' = '{CD2C7BCC-59D5-4D3D-8A25-1DD58B93DD4E}'
}

if ($Part -ne 'user') {
	$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
	if (-not $admin) { throw 'This part needs an administrator.' }
	$program = Join-Path $env:ProgramFiles 'BreezellIME'
	New-Item -ItemType Directory -Force -Path $program | Out-Null
	# A loaded DLL cannot be overwritten: the old one moves aside (and goes at the next install).
	foreach ($name in 'BreezellIME64.dll', 'BreezellIME32.dll') {
		$target = Join-Path $program $name
		if (Test-Path $target) {
			Get-ChildItem $program -Filter "$name.old*" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
			try { Remove-Item $target -Force } catch { Rename-Item $target "$name.old$(Get-Random)" }
		}
		Copy-Item (Join-Path $here $name) $target -Force
	}
	& "$env:SystemRoot\System32\regsvr32.exe" /s (Join-Path $program 'BreezellIME64.dll')
	if ($LASTEXITCODE -ne 0) { throw "regsvr32 (64-bit) failed: $LASTEXITCODE" }
	& "$env:SystemRoot\SysWOW64\regsvr32.exe" /s (Join-Path $program 'BreezellIME32.dll')
	if ($LASTEXITCODE -ne 0) { throw "regsvr32 (32-bit) failed: $LASTEXITCODE" }
}

if ($Part -ne 'machine') {
	if (-not (Test-Path $BreezellExe)) { throw "Breezell's executable not found: pass -BreezellExe" }
	$user = Join-Path $env:LOCALAPPDATA 'BreezellIME'
	New-Item -ItemType Directory -Force -Path $user | Out-Null
	# The new host first: a text service starts the host again within moments of its going.
	Copy-Item (Join-Path $here 'host.cjs') (Join-Path $user 'host.cjs') -Force
	Get-CimInstance Win32_Process -Filter "Name LIKE 'Breezell%'" | Where-Object { $_.CommandLine -like '*host.cjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
	# Not New-Item -Force on a key that exists: that empties it (TipVersion would go).
	if (-not (Test-Path 'HKCU:\Software\BreezellIME')) { New-Item -Path 'HKCU:\Software\BreezellIME' | Out-Null }
	Set-ItemProperty -Path 'HKCU:\Software\BreezellIME' -Name HostExe -Value $BreezellExe
	Set-ItemProperty -Path 'HKCU:\Software\BreezellIME' -Name HostScript -Value (Join-Path $user 'host.cjs')

	# The models: where -Data says, else %LOCALAPPDATA%\BreezellIME\data (the host's and the plugin's default too).
	if (-not $Data) { $Data = Join-Path $user 'data' }
	$config = Join-Path $env:APPDATA 'BreezellIME\config.json'
	if (-not (Test-Path $config)) {
		New-Item -ItemType Directory -Force -Path (Split-Path $config) | Out-Null
		$json = @{ zhLayout = 'pinyin'; dataPath = $Data; pageSize = 7; wubiSmartOrder = $false; learning = $true; fullWidthPunctuation = $true } | ConvertTo-Json
		[IO.File]::WriteAllText($config, $json, (New-Object System.Text.UTF8Encoding $false))
	}

	Add-Type -Namespace BreezellIME -Name Input -MemberDefinition @'
[DllImport("input.dll", CharSet = CharSet.Unicode)] public static extern bool InstallLayoutOrTip(string psz, uint dwFlags);
[DllImport("input.dll", CharSet = CharSet.Unicode)] public static extern bool SetDefaultLayoutOrTip(string psz, uint dwFlags);
'@
	$tip = "${Lang}:$clsid$($profiles[$Lang])"
	if (-not [BreezellIME.Input]::InstallLayoutOrTip($tip, 0)) { Write-Warning "Could not add $tip to the input methods" }
	if ($Default -and -not [BreezellIME.Input]::SetDefaultLayoutOrTip($tip, 0)) { Write-Warning 'Could not make it the default' }
}
Write-Host "Breezell IME: part $Part installed."
