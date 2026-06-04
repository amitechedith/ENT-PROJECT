# ENT Clinic - Production Deployment Guide (Windows)

## 📋 Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Initial Setup](#initial-setup)
4. [Build & Deployment](#build--deployment)
5. [Verification](#verification)
6. [Troubleshooting](#troubleshooting)
7. [Maintenance](#maintenance)

---

## Architecture Overview

### Production Stack
```
┌─────────────────────────────────────────┐
│        Client Browser                   │
│    Requests to http://localhost:3000    │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│        Express Server (Node.js)         │
│         Port 3000 (PM2 Managed)         │
│                                         │
│  ├─ Static Files (Angular SPA)          │
│  ├─ /api/auth                           │
│  ├─ /api/master                         │
│  ├─ /api/patients                       │
│  └─ /api/health & /api/test-db          │
└────────────────┬────────────────────────┘
                 │
                 ▼
        ┌─────────────────┐
        │  MySQL Database │
        │                 │
        │ (ent_clinic_db) │
        └─────────────────┘
```

### How It Works
- **Single Express Server**: Serves both API and Static SPA
- **API Routes**: All API endpoints under `/api/*` prefix
- **SPA Routing**: All non-API routes serve `index.html` for Angular routing
- **Process Management**: PM2 ensures automatic restart on crashes
- **Static Caching**: Angular static assets cached for 1 day

---

## Prerequisites

### System Requirements
- **OS**: Windows Server 2016+ or Windows 10+
- **Node.js**: v16+ (recommend v18 LTS or v20 LTS)
- **npm**: v8+
- **MySQL**: v5.7+ (must be running)

### Install Node.js & npm
1. Download from https://nodejs.org/ (LTS version recommended)
2. Run installer and select:
   - ✅ Add to PATH
   - ✅ npm package manager
3. Verify installation:
   ```powershell
   node --version
   npm --version
   ```

### Ensure MySQL is Running
```powershell
# Check MySQL service status
Get-Service MySQL80  # or MySQL57, depending on your version

# Start MySQL if not running
Start-Service MySQL80
```

---

## Initial Setup

### Step 1: Clone/Navigate to Project
```powershell
cd C:\your\project\path\ENT-PROJECT
```

### Step 2: Verify Project Structure
```
ENT-PROJECT/
├── ent-backend/          # Express API server
│   ├── server.js
│   ├── package.json
│   ├── ecosystem.config.js
│   └── ...
├── ent-dashboard/        # Angular SPA
│   ├── src/
│   ├── angular.json
│   ├── package.json
│   └── ...
├── DEPLOYMENT.md         # This file
└── BUILD_AND_DEPLOY.md   # Quick reference
```

### Step 3: Configure Environment Variables

**Backend Configuration** (`ent-backend/.env`)
```env
PORT=3000
NODE_ENV=production
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=Jarvis@1212
DB_NAME=ent_clinic_db
```

**Frontend Configuration** (automatically created)
- Production: `ent-dashboard/src/environments/environment.prod.ts`
- Uses `apiUrl: '/api'` (relative to server)

### Step 4: Install PM2 Globally
```powershell
npm install -g pm2

# Verify PM2 installation
pm2 --version

# Create Windows startup service (optional, requires admin)
pm2 install pm2-windows-startup
pm2 startup windows
```

---

## Build & Deployment

### Automated Build & Deployment Script
The easiest way to build and deploy:

```powershell
cd C:\your\project\path\ENT-PROJECT

# Full build and deployment
.\ent-backend\build-and-deploy.ps1

# Skip Angular rebuild (useful for backend-only changes)
.\ent-backend\build-and-deploy.ps1 -SkipBuild

# Skip PM2 deployment (useful for testing)
.\ent-backend\build-and-deploy.ps1 -SkipDeploy
```

### Manual Step-by-Step Deployment

#### Step 1: Build Angular Production Bundle
```powershell
cd ent-dashboard

# Install dependencies (if needed)
npm install

# Build for production
npm run build

# Output location: ent-dashboard/dist/ent-dashboard/
cd ..
```

#### Step 2: Install Backend Dependencies
```powershell
cd ent-backend

# Install npm packages
npm install

# Create logs directory
mkdir logs -ErrorAction SilentlyContinue

cd ..
```

#### Step 3: Start with PM2
```powershell
cd ent-backend

# Start application
npm run pm2:start

# Verify it's running
pm2 status

# View logs
pm2 logs ent-backend

cd ..
```

---

## Verification

### Health Checks
```powershell
# API Health Check
Invoke-WebRequest -Uri "http://localhost:3000/api/health"

# Database Connection Test
Invoke-WebRequest -Uri "http://localhost:3000/api/test-db"

# Application Status
pm2 status
```

### Access the Application
- **Frontend**: http://localhost:3000 → Angular SPA loads
- **API Endpoints**:
  - http://localhost:3000/api/auth
  - http://localhost:3000/api/master
  - http://localhost:3000/api/patients
  - http://localhost:3000/api/health

### Check Logs
```powershell
cd ent-backend

# View real-time logs
pm2 logs ent-backend

# View logs file directly
Get-Content logs/out.log -Tail 50
Get-Content logs/error.log -Tail 50
```

---

## Troubleshooting

### Application Won't Start
```powershell
cd ent-backend

# Stop existing instance
pm2 stop ecosystem.config.js
pm2 delete ecosystem.config.js

# Check logs for errors
pm2 logs ent-backend

# Try starting directly to see console errors
node server.js

# Check environment variables
Get-Content .env
```

### Port Already in Use
```powershell
# Find process using port 3000
netstat -ano | Select-String ":3000"

# Kill process (replace PID with actual process ID)
Stop-Process -Id <PID> -Force

# Or change port in .env and ecosystem.config.js
```

### Database Connection Failed
```powershell
# Check MySQL is running
Get-Service MySQL80 | Select-Object Status

# Start MySQL if needed
Start-Service MySQL80

# Verify credentials in .env match MySQL setup
# Check database exists
mysql -u root -p
# In MySQL: show databases; use ent_clinic_db; show tables;
```

### Angular Frontend Not Loading
```powershell
# Check if dist folder exists
Test-Path ent-dashboard\dist\ent-dashboard\index.html

# If missing, rebuild
cd ent-dashboard
npm run build
cd ..

# Verify static serving in server.js
# Check NODE_ENV is set to production
$env:NODE_ENV  # Should show: production
```

### PM2 Service Issues
```powershell
# Reinstall PM2
npm uninstall -g pm2
npm install -g pm2

# Clear PM2 cache
pm2 flush
pm2 reset

# Restart PM2 daemon
pm2 kill
pm2 start ecosystem.config.js --env production
```

---

## Maintenance

### Regular Tasks

#### Monitor Application Health
```powershell
cd ent-backend

# Real-time monitoring dashboard
pm2 monit

# List all processes
pm2 list

# View detailed process info
pm2 info ent-backend
```

#### Restart Application
```powershell
cd ent-backend

# Graceful restart
npm run pm2:restart

# Or manually
pm2 restart ecosystem.config.js
```

#### Stop Application
```powershell
cd ent-backend

npm run pm2:stop
# or
pm2 stop ecosystem.config.js
```

#### Update Application
```powershell
# Pull latest code (if using Git)
git pull origin main

# Rebuild and deploy
.\ent-backend\build-and-deploy.ps1
```

#### View Application Logs
```powershell
cd ent-backend

# Real-time logs
pm2 logs ent-backend

# Last 100 lines
pm2 logs ent-backend --lines 100

# Archive logs and create backups
pm2 logrotate -u Administrator
```

### Performance Optimization

#### Memory Management
Update `ecosystem.config.js`:
```javascript
max_memory_restart: '1G'  // Restart if exceeds 1GB
```

#### Enable Clustering (Optional)
For multi-core servers, update `ecosystem.config.js`:
```javascript
instances: 'max',        // Use all CPU cores
exec_mode: 'cluster'     // Enable cluster mode
```

#### Database Connection Pooling
Ensure `db.config.js` has proper pool settings:
```javascript
connectionLimit: 10
waitForConnections: true
enableKeepAlive: true
```

### Backup Strategy
```powershell
# Backup database daily
$backupPath = "C:\backups\ent_clinic_db_$(Get-Date -Format 'yyyy-MM-dd').sql"
mysqldump -u root -p ent_clinic_db | Out-File $backupPath

# Backup application code
$archivePath = "C:\backups\ENT-PROJECT_$(Get-Date -Format 'yyyy-MM-dd').zip"
Compress-Archive -Path "C:\your\project\path\ENT-PROJECT" -DestinationPath $archivePath
```

### Automated Startup on Server Reboot
```powershell
# As Administrator:
cd ent-backend
pm2 startup windows -u Administrator
pm2 save
```

This ensures the application automatically starts when the server reboots.

---

## Additional Resources

### Useful Links
- [PM2 Documentation](https://pm2.keymetrics.io/docs)
- [Express.js Guide](https://expressjs.com/)
- [Angular Production Build](https://angular.io/guide/build)
- [Node.js Best Practices](https://nodejs.org/en/docs/guides/nodejs-best-practices/)

### Quick Command Reference
See [BUILD_AND_DEPLOY.md](BUILD_AND_DEPLOY.md) for quick commands.

### Support
For issues or questions:
1. Check troubleshooting section above
2. Review PM2 logs: `pm2 logs`
3. Check application logs: `ent-backend/logs/`
4. Verify MySQL connection: `mysql -u root -p`

---

**Last Updated**: June 5, 2026  
**Version**: 1.0.0  
**Tested On**: Windows Server 2019+, Windows 10/11 Pro
