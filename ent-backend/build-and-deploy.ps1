# ENT Clinic - Windows Build & Deployment Script
# This script builds the Angular dashboard and deploys with PM2

param(
    [string]$Environment = "production",
    [switch]$SkipBuild = $false,
    [switch]$SkipDeploy = $false
)

# Color output functions
function Write-Success {
    Write-Host $args -ForegroundColor Green
}

function Write-Info {
    Write-Host $args -ForegroundColor Cyan
}

function Write-ErrorMsg {
    Write-Host $args -ForegroundColor Red
}

function Write-Warning {
    Write-Host $args -ForegroundColor Yellow
}

# Error handling
$ErrorActionPreference = "Stop"
trap {
    Write-ErrorMsg "ERROR Script failed: $_"
    exit 1
}

Write-Info "========================================================================="
Write-Info "       ENT Clinic - Build & Deployment Script                          "
Write-Info "            Windows Production Setup                                   "
Write-Info "========================================================================="
Write-Info ""

# Step 1: Verify project structure
Write-Info "Verifying project structure..."
if (-not (Test-Path "ent-dashboard")) {
    Write-ErrorMsg "ERROR Angular dashboard not found at ./ent-dashboard"
    exit 1
}

if (-not (Test-Path "ent-backend")) {
    Write-ErrorMsg "ERROR Backend not found at ./ent-backend"
    exit 1
}

Write-Success "OK Project structure verified"

# Step 2: Build Angular dashboard
if (-not $SkipBuild) {
    Write-Info ""
    Write-Info "Building Angular dashboard (production)..."
    
    Push-Location ent-dashboard
    
    if (-not (Test-Path "node_modules")) {
        Write-Info "   Installing Angular dependencies..."
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-ErrorMsg "ERROR npm install failed"
            exit 1
        }
    }
    
    Write-Info "   Building Angular production bundle..."
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-ErrorMsg "ERROR Angular build failed"
        exit 1
    }
    
    Pop-Location
    Write-Success "OK Angular build completed successfully"
}
else {
    Write-Warning "SKIP Skipped Angular build"
}

# Step 3: Backend setup
Write-Info "Preparing backend..."

Push-Location ent-backend

if (-not (Test-Path "node_modules")) {
    Write-Info "   Installing backend dependencies..."
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-ErrorMsg "ERROR npm install failed"
        exit 1
    }
}

# Create logs directory if it doesn't exist
if (-not (Test-Path "logs")) {
    New-Item -ItemType Directory -Path "logs" -ErrorAction SilentlyContinue | Out-Null
    Write-Info "   Created logs directory"
}

Write-Success "OK
Write-Success "✓ Backend ready"

# Step 4: Deploy with PM2
if (-not $SkipDeploy) {
    Write-Info "Deploying with PM2..."
    
    # Check if PM2 is installed globally
    Write-Info "   Checking for PM2 installation..."
    $pm2Check = npm list -g pm2 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "   PM2 not found. Installing globally..."
        npm install -g pm2
        if ($LASTEXITCODE -ne 0) {
            Write-ErrorMsg "ERROR Failed to install PM2"
            exit 1
        }
    }
    
    # Stop existing instance if running
    Write-Info "   Checking for existing PM2 processes..."
    $pm2Status = pm2 list 2>&1
    if ($pm2Status -like "*ent-backend*") {
        Write-Info "   Stopping existing instance..."
        pm2 stop ecosystem.config.js 2>$null
        pm2 delete ecosystem.config.js 2>$null
        Start-Sleep -Seconds 2
    }
    
    # Start with PM2
    Write-Info "   Starting application with PM2..."
    npm run pm2:start
    if ($LASTEXITCODE -ne 0) {
        Write-ErrorMsg "ERROR PM2 start failed"
        exit 1
    }
    
    # Wait for app to be ready
    Start-Sleep -Seconds 3
    
    # Show PM2 status
    Write-Info ""
    pm2 status
    
    Write-Success "OK Application deployed with PM2"
}
else {
    Write-Warning "SKIP
    Write-WaChecking deployment status..."

try {
    $uri = "http://localhost:3000/api/health"
    $healthCheck = Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    if ($healthCheck.StatusCode -eq 200) {
        Write-Success "OK Health check passed"
        Write-Success "OK Application is running on http://localhost:3000"
    }
}
catch {
    Write-Warning "WARN Health check timed out - application may still be starting"
}

Write-Info ""
Write-Success "========================================================================="
Write-Success "OK Build & deployment completed successfully!"
Write-Success "========================================================================="
Write-Info ""
Write-Info "Useful commands:"
Write-Info "   View logs      : pm2 logs"
Write-Info "   Monitor        : pm2 monit"
Write-Info "   Restart        : npm run pm2:restart (from ent-backend)"
Write-Info "   Stop           : npm run pm2:stop (from ent-backend)"
$appUrl = "http://localhost:3000"
Write-Info "   Application URL: $appUrl"
Write-Info ""
