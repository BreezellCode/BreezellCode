# Removes the Breezell IME from Windows. The models and what it learned stay: Breezell's plugin
# uses them too, and the settings page removes them.
#   -Part user      as the user: the input method off the user's list, the host and its settings
#   -Part machine   as administrator: the text service unregistered and its DLLs gone
#   -Part all       both
param([ValidateSet('all', 'machine', 'user')][string]$Part = 'all')
$ErrorActionPreference = 'Continue'
$clsid = '{124D7B5B-968F-4E0E-BA91-98F4F77D1EB9}'
$profiles = @('0404:{CD0ED061-C951-4941-BB08-98818CE24EB3}', '0804:{AC5C0798-CC51-4140-AF5D-4328BF117D6B}', '0411:{3865AF80-C7D2-4F3C-AA5A-406A26BE98DA}', '0412:{CD2C7BCC-59D5-4D3D-8A25-1DD58B93DD4E}')

if ($Part -ne 'machine') {
	Add-Type -Namespace BreezellIME -Name Input -MemberDefinition @'
[DllImport("input.dll", CharSet = CharSet.Unicode)] public static extern bool InstallLayoutOrTip(string psz, uint dwFlags);
'@
	foreach ($p in $profiles) {
		$lang, $guid = $p.Split(':')
		[void][BreezellIME.Input]::InstallLayoutOrTip("${lang}:$clsid$guid", 1)
	}
	# The registered path goes first, so no text service starts the host again.
	Remove-Item -Path 'HKCU:\Software\BreezellIME' -Recurse -Force -ErrorAction SilentlyContinue
	Get-CimInstance Win32_Process -Filter "Name LIKE 'Breezell%'" | Where-Object { $_.CommandLine -like '*host.cjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
	$user = Join-Path $env:LOCALAPPDATA 'BreezellIME'
	foreach ($name in 'host.cjs', 'installed-by.txt', 'tip') {
		Remove-Item -Recurse -Force (Join-Path $user $name) -ErrorAction SilentlyContinue
	}
}

if ($Part -ne 'user') {
	$program = Join-Path $env:ProgramFiles 'BreezellIME'
	& "$env:SystemRoot\System32\regsvr32.exe" /u /s (Join-Path $program 'BreezellIME64.dll')
	& "$env:SystemRoot\SysWOW64\regsvr32.exe" /u /s (Join-Path $program 'BreezellIME32.dll')
	# Files still loaded by running programs stay until the next restart of those programs.
	Remove-Item -Recurse -Force $program -ErrorAction SilentlyContinue
}
Write-Host "Breezell IME: part $Part removed."
