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
	# Only what is on the user's list: removing a profile of a language not on it adds that language.
	$listed = (Get-WinUserLanguageList).InputMethodTips
	foreach ($p in $profiles) {
		$lang, $guid = $p.Split(':')
		$tip = "${lang}:$clsid$guid"
		if ($listed -contains $tip) { [void][BreezellIME.Input]::InstallLayoutOrTip($tip, 1) }
	}
	# Windows' default input method, if it is this one, goes back to the first of the user's list.
	$default = (Get-WinDefaultInputMethodOverride -ErrorAction SilentlyContinue).InputMethodTip
	if ($default -like "*$clsid*") { Set-WinDefaultInputMethodOverride }
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
	# Waited for: the files go next. (regsvr32 is a windowed program: PowerShell would not wait by itself.)
	Start-Process -FilePath "$env:SystemRoot\System32\regsvr32.exe" -ArgumentList '/u', '/s', "`"$(Join-Path $program 'BreezellIME64.dll')`"" -Wait -WindowStyle Hidden
	Start-Process -FilePath "$env:SystemRoot\SysWOW64\regsvr32.exe" -ArgumentList '/u', '/s', "`"$(Join-Path $program 'BreezellIME32.dll')`"" -Wait -WindowStyle Hidden
	# Files still loaded by running programs stay until the next restart of those programs.
	Remove-Item -Recurse -Force $program -ErrorAction SilentlyContinue
}
Write-Host "Breezell IME: part $Part removed."
