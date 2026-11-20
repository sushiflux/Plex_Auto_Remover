param(
    [ValidateSet('start', 'stop', 'restart', 'status', 'logs')]
    [string]$Action = 'start'
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$LogDir = Join-Path $Root 'intern\dev-logs'
$PidFile = Join-Path $LogDir 'pids.json'
$BackendPort = 5281
$FrontendPort = 5280

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Stop-DevProcesses {
    if (Test-Path $PidFile) {
        $pids = Get-Content $PidFile | ConvertFrom-Json
        foreach ($id in @($pids.backend, $pids.frontend)) {
            if ($id -and (Get-Process -Id $id -ErrorAction SilentlyContinue)) {
                taskkill /PID $id /T /F | Out-Null
            }
        }
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
        Write-Host "Dev-Prozesse gestoppt."
    } else {
        Write-Host "Keine laufenden Dev-Prozesse gefunden."
    }
}

function Start-DevProcesses {
    if (Test-Path $PidFile) {
        Stop-DevProcesses
    }

    $backendOut = Join-Path $LogDir 'backend.log'
    $backendErr = Join-Path $LogDir 'backend.err.log'
    $frontendOut = Join-Path $LogDir 'frontend.log'
    $frontendErr = Join-Path $LogDir 'frontend.err.log'

    $env:ASPNETCORE_ENVIRONMENT = 'Development'
    $backend = Start-Process -FilePath 'dotnet' `
        -ArgumentList @('run', '--project', (Join-Path $Root 'backend\PlexAutoRemover.csproj'), '--urls', "http://127.0.0.1:$BackendPort") `
        -WorkingDirectory (Join-Path $Root 'backend') `
        -RedirectStandardOutput $backendOut `
        -RedirectStandardError $backendErr `
        -WindowStyle Hidden -PassThru

    $frontend = Start-Process -FilePath 'npm.cmd' `
        -ArgumentList @('run', 'dev') `
        -WorkingDirectory (Join-Path $Root 'frontend') `
        -RedirectStandardOutput $frontendOut `
        -RedirectStandardError $frontendErr `
        -WindowStyle Hidden -PassThru

    @{ backend = $backend.Id; frontend = $frontend.Id } | ConvertTo-Json | Set-Content $PidFile
    Write-Host "Plex Auto Remover Dev gestartet:"
    Write-Host "  Frontend: http://127.0.0.1:$FrontendPort"
    Write-Host "  Backend:  http://127.0.0.1:$BackendPort"
}

switch ($Action) {
    'start' { Start-DevProcesses }
    'stop' { Stop-DevProcesses }
    'restart' { Stop-DevProcesses; Start-DevProcesses }
    'status' {
        if (Test-Path $PidFile) {
            $pids = Get-Content $PidFile | ConvertFrom-Json
            $b = Get-Process -Id $pids.backend -ErrorAction SilentlyContinue
            $f = Get-Process -Id $pids.frontend -ErrorAction SilentlyContinue
            Write-Host "Backend ($($pids.backend)): $(if ($b) { 'läuft' } else { 'gestoppt' })"
            Write-Host "Frontend ($($pids.frontend)): $(if ($f) { 'läuft' } else { 'gestoppt' })"
        } else {
            Write-Host "Dev-Umgebung ist gestoppt."
        }
    }
    'logs' {
        foreach ($file in @('backend.log', 'backend.err.log', 'frontend.log', 'frontend.err.log')) {
            $p = Join-Path $LogDir $file
            if (Test-Path $p) {
                Write-Host "=== $file ==="
                Get-Content $p -Tail 25
            }
        }
    }
}
