# TOS Tracker watchdog (continuous, self-healing).
# Launched hidden at logon by the Startup shortcut "TOS-Tracker-Backend.lnk".
# Every 3 minutes it ensures the Node backend (port 4000) and the ngrok tunnel
# (static domain) are running, relaunching whichever has stopped. Idempotent:
# if both are already up it just sleeps. Replaces the old logon-only launcher.
$ErrorActionPreference = 'SilentlyContinue'

# Single-instance guard so repeated logons don't stack multiple loops.
# An abandoned mutex (previous instance was force-killed) still counts as acquired,
# so catch that case and continue instead of crashing at startup.
$mutex = New-Object System.Threading.Mutex($false, 'Global\TOSTrackerWatchdog')
$owned = $false
try { $owned = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $owned = $true }
if (-not $owned) { exit }

$root      = Split-Path $PSScriptRoot -Parent
$serverDir = Join-Path $root 'server'
$nodeExe   = 'C:\Program Files\nodejs\node.exe'
$ngrokDom  = 'unread-staleness-cesspool.ngrok-free.dev'
$log       = Join-Path $serverDir 'watchdog.log'
# PostgreSQL (runs as this user via pg_ctl — the Windows service needs admin).
$pgCtl     = 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe'
$pgData    = 'C:\Program Files\PostgreSQL\18\data'
$pgLog     = Join-Path $serverDir 'postgres.log'

function Log($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $m" | Add-Content -Path $log }

Log 'Watchdog started.'
while ($true) {
    # --- PostgreSQL on port 5433 (the backend's database; start it FIRST) ---
    if (-not (Get-NetTCPConnection -State Listen -LocalPort 5433 -ErrorAction SilentlyContinue)) {
        if (Test-Path $pgCtl) {
            & $pgCtl start -D $pgData -l $pgLog -w -t 40 | Out-Null
            Log 'PostgreSQL was down -> started.'
        }
    }

    # --- Node backend on port 4000 ---
    if (-not (Get-NetTCPConnection -State Listen -LocalPort 4000 -ErrorAction SilentlyContinue)) {
        Start-Process -FilePath $nodeExe -ArgumentList 'dist\index.js' `
            -WorkingDirectory $serverDir `
            -RedirectStandardOutput (Join-Path $serverDir 'runtime.log') `
            -RedirectStandardError  (Join-Path $serverDir 'runtime-err.log') `
            -WindowStyle Hidden
        Log 'Node backend was down -> relaunched.'
    }

    # --- ngrok tunnel -> port 4000 on the static domain ---
    if (-not (Get-Process -Name 'ngrok' -ErrorAction SilentlyContinue)) {
        Start-Process -FilePath 'ngrok' -ArgumentList "http 4000 --domain=$ngrokDom" -WindowStyle Hidden
        Log 'ngrok tunnel was down -> relaunched.'
    }

    Start-Sleep -Seconds 180
}
