# GhostOperator launcher for Windows PowerShell: bootstraps dependencies, then runs backend + frontend.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"
$VenvPython = Join-Path $Backend ".venv\Scripts\python.exe"

function Find-Python {
    $candidates = @()
    if (Get-Command py -ErrorAction SilentlyContinue) { $candidates += , @("py", "-3") }
    if (Get-Command python -ErrorAction SilentlyContinue) { $candidates += , @("python") }
    Get-ChildItem "$env:LOCALAPPDATA\Programs\Python\Python3*\python.exe" -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending | ForEach-Object { $candidates += , @($_.FullName) }
    foreach ($c in $candidates) {
        $exe = $c[0]; $exeArgs = @($c | Select-Object -Skip 1)
        try {
            $ok = & $exe @exeArgs -c "import sys; print(int(sys.version_info >= (3, 11)))" 2>$null
            if ($ok -eq "1") { return , $c }
        } catch { }
    }
    throw "Python 3.11+ not found. Install it from https://www.python.org/downloads/ and re-run."
}

Write-Host "`n  GhostOperator // AetherBrowser`n" -ForegroundColor Green

$EnvFile = Join-Path $Root ".env"
if (-not (Test-Path $EnvFile)) {
    Copy-Item (Join-Path $Root ".env.example") $EnvFile
    Write-Host "[setup] Created .env from .env.example. Add your GEMINI_API_KEY for live missions." -ForegroundColor Yellow
}

if (-not (Test-Path $VenvPython)) {
    $py = Find-Python
    Write-Host "[setup] Creating Python virtual environment..." -ForegroundColor Cyan
    $pyArgs = @($py | Select-Object -Skip 1)
    & $py[0] @pyArgs -m venv (Join-Path $Backend ".venv")
}

$Stamp = Join-Path $Backend ".venv\.deps-installed"
$Req = Join-Path $Backend "requirements.txt"
if (-not (Test-Path $Stamp) -or (Get-Item $Req).LastWriteTime -gt (Get-Item $Stamp).LastWriteTime) {
    Write-Host "[setup] Installing backend dependencies..." -ForegroundColor Cyan
    & $VenvPython -m pip install --upgrade pip
    & $VenvPython -m pip install -r $Req
    if ($LASTEXITCODE -ne 0) { throw "pip install failed" }
    Write-Host "[setup] Installing Playwright Chromium..." -ForegroundColor Cyan
    & $VenvPython -m playwright install chromium
    if ($LASTEXITCODE -ne 0) { throw "playwright install failed" }
    Set-Content -Path $Stamp -Value (Get-Date -Format o) -Encoding utf8
}

if (-not (Test-Path (Join-Path $Frontend "node_modules"))) {
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "Node.js 18+ is required (https://nodejs.org)." }
    Write-Host "[setup] Installing frontend dependencies..." -ForegroundColor Cyan
    Push-Location $Frontend
    npm install
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -ne 0) { throw "npm install failed" }
}

Write-Host "[run] Backend  -> http://localhost:8000" -ForegroundColor Green
$backendProc = Start-Process -FilePath $VenvPython -ArgumentList "main.py" -WorkingDirectory $Backend -PassThru -NoNewWindow
Write-Host "[run] Frontend -> http://localhost:5173" -ForegroundColor Green
$npmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $npmCmd) { $npmCmd = "npm" }
$frontendProc = Start-Process -FilePath $npmCmd -ArgumentList "run", "dev" -WorkingDirectory $Frontend -PassThru -NoNewWindow

Start-Sleep -Seconds 4
Start-Process "http://localhost:5173"
Write-Host "`nPress Ctrl+C to stop both services.`n" -ForegroundColor DarkGray

try {
    while (-not $backendProc.HasExited -and -not $frontendProc.HasExited) { Start-Sleep -Milliseconds 500 }
} finally {
    foreach ($p in @($frontendProc, $backendProc)) {
        if ($p -and -not $p.HasExited) { & taskkill /PID $p.Id /T /F | Out-Null }
    }
    Write-Host "GhostOperator stopped." -ForegroundColor DarkGray
}
