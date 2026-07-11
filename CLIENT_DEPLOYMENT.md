# ENT Clinic - Client Machine Deployment Guide
## Complete Setup with Auto-Start on Windows Restart

---

## 📋 **Table of Contents**
1. [Prerequisites](#prerequisites)
2. [Copy to Client Machine](#copy-to-client-machine)
3. [Configure Environment](#configure-environment)
4. [Initialize Database](#initialize-database)
5. [Install Dependencies](#install-dependencies)
6. [Setup PM2 with Auto-Start](#setup-pm2-with-auto-start)
7. [Verify & Test](#verify--test)
8. [Daily Usage](#daily-usage)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### **Required Software on Client Machine**

#### **1. Install Node.js LTS**
- Download: https://nodejs.org/ (LTS version, e.g., v18 or v20)
- Run installer with default options
- ✅ Check **"Add to PATH"** during installation
- Restart PowerShell after installation

**Verify installation:**
```powershell
node --version      # Should show v18.x.x or v20.x.x
npm --version       # Should show 8.x.x or higher
```

#### **2. Install MySQL Server**
- Download: https://dev.mysql.com/downloads/mysql/
- During setup:
  - Choose "Development Default" or "Server Only"
  - Set port to 3306
  - Note the root password you set
  - ✅ Configure MySQL as Windows Service

**Verify MySQL is running:**
```powershell
Get-Service MySQL80      # Should show "Running"
Start-Service MySQL80    # Start if not running
```

#### **3. Run PowerShell as Administrator**
- Right-click PowerShell → "Run as administrator"
- All commands in this guide require admin privileges

---

## Copy to Client Machine

### **Prepare Pendrive**

1. On your development machine:
```powershell
# Navigate to project
cd C:\tools\workplace\ENT-PROJECT

# Create clean copy without node_modules
$exclude = @('node_modules', 'dist', '.angular')

robocopy "ent-backend" "D:\ENT-PROJECT\ent-backend" /S /XD $exclude
robocopy "ent-dashboard" "D:\ENT-PROJECT\ent-dashboard" /S /XD $exclude
robocopy "." "D:\ENT-PROJECT" "*.md"
```

Or use 7-Zip to compress without `node_modules`.

### **On Client Machine**

```powershell
# Copy from pendrive (D: is your pendrive letter)
Copy-Item -Path "D:\ENT-PROJECT" -Destination "C:\Apps\ENT-PROJECT" -Recurse

# Navigate to project
cd C:\Apps\ENT-PROJECT

# Verify structure
Get-ChildItem
# Should show: ent-backend, ent-dashboard, *.md files
```

---

## Configure Environment

### **Update Database Configuration**

Open backend environment file:
```powershell
notepad C:\Apps\ENT-PROJECT\ent-backend\.env
```

**Edit and save with your credentials:**
```env
PORT=3000
NODE_ENV=production
DB_HOST=localhost
DB_USER=ent_user
DB_PASSWORD=YourSecurePassword123!
DB_NAME=ent_clinic_db
ADMIN_PASSWORD=ChangeThisAdminLoginPassword123!
```

**Save and close (Ctrl+S, then close window)**

---

## Initialize Database

### **Create Database & User**

```powershell
# Open MySQL command line (enter root password when prompted)
mysql -u root -p
```

**In MySQL prompt, run these commands:**
```sql
CREATE DATABASE ent_clinic_db;
USE ent_clinic_db;
CREATE USER 'ent_user'@'localhost' IDENTIFIED BY 'YourSecurePassword123!';
GRANT ALL PRIVILEGES ON ent_clinic_db.* TO 'ent_user'@'localhost';
FLUSH PRIVILEGES;
exit;
```

### **Run Database Initialization Script**

```powershell
cd C:\Apps\ENT-PROJECT\ent-backend

# Initialize tables
node init-db.js

# Seed sample data (optional)
node seed.js

# Output should show:
# ✓ Tables created successfully
# ✓ Sample data inserted (if you ran seed.js)
```

---

## Install Dependencies

### **Install Angular Frontend Dependencies**

```powershell
cd C:\Apps\ENT-PROJECT\ent-dashboard

npm install
# Takes 2-3 minutes

npm run build
# Creates production bundle in dist/ folder
# Takes 1-2 minutes
```

**Expected output at end:**
```
✓ Builds at: dist/ent-dashboard/
✓ Build complete
```

### **Install Backend Dependencies**

```powershell
cd C:\Apps\ENT-PROJECT\ent-backend

npm install
# Takes 1-2 minutes

# Create logs directory
mkdir logs -ErrorAction SilentlyContinue

cd C:\Apps\ENT-PROJECT
```

---

## Setup PM2 with Auto-Start

### **⭐ CRITICAL: Run as Administrator**

**Right-click PowerShell and select "Run as administrator"**

### **Step 1: Install PM2 Globally**

```powershell
npm install -g pm2

# Verify installation
pm2 --version
```

### **Step 2: Configure PM2 for Auto-Start**

```powershell
cd C:\Apps\ENT-PROJECT\ent-backend

# Setup PM2 to start on Windows boot
pm2 startup windows -u Administrator

# Start the application
npm run pm2:start

# Save the PM2 startup configuration
pm2 save

# Verify setup
pm2 list
pm2 status
```

**Important: You'll see output like:**
```
[PM2] Saving current process list...
[PM2] Successfully saved in C:\...
```

### **Step 3: Verify Auto-Start Setup**

```powershell
# Check saved configuration
pm2 show ent-backend

# Check startup tasks
Get-ScheduledTask | Where-Object {$_.TaskName -eq "PM2"}
```

### **Step 4: Test Auto-Start (Restart PC)**

```powershell
# Method 1: Graceful restart
Restart-Computer

# Method 2: Manual restart via Start menu
```

**After restart:**
```powershell
# Open PowerShell (no need for admin this time)
pm2 list
# Should show ent-backend is running

# Test application
Invoke-WebRequest -Uri "http://localhost:3000/api/health"
# Should return: "status": "OK"
```

---

## Verify & Test

### **Test 1: Frontend Loads**

Open browser and go to:
```
http://localhost:3000
```

**Expected:** ENT Clinic login page appears with login form

### **Test 2: API Health Check**

```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/health"

# Output should be:
# StatusCode        : 200
# Status            : OK
```

### **Test 3: Database Connection**

```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/test-db"

# Output should show:
# "message": "Database connected successfully!"
```

### **Test 4: API Endpoints**

```powershell
# Test authentication endpoint
Invoke-WebRequest -Uri "http://localhost:3000/api/auth" -Method POST

# Test patient API
Invoke-WebRequest -Uri "http://localhost:3000/api/patients"

# Test master data
Invoke-WebRequest -Uri "http://localhost:3000/api/master"
```

### **Test 5: Check Process is Running via PM2**

```powershell
pm2 list
pm2 status
pm2 info ent-backend
```

---

## Daily Usage

### **Start Application**

```powershell
cd C:\Apps\ENT-PROJECT\ent-backend
npm run pm2:start

# Or directly with PM2
pm2 start ecosystem.config.js --env production
```

### **Stop Application**

```powershell
cd C:\Apps\ENT-PROJECT\ent-backend
npm run pm2:stop

# Or
pm2 stop ent-backend
```

### **Restart Application**

```powershell
cd C:\Apps\ENT-PROJECT\ent-backend
npm run pm2:restart

# Or
pm2 restart ent-backend
```

### **View Real-Time Logs**

```powershell
cd C:\Apps\ENT-PROJECT\ent-backend

npm run pm2:logs
# Ctrl+C to exit

# Or directly
pm2 logs ent-backend
```

### **Monitor Resource Usage**

```powershell
cd C:\Apps\ENT-PROJECT\ent-backend
pm2 monit
# Ctrl+C to exit
```

---

## Auto-Start Behavior

### **What Happens on Windows Restart**

1. **Windows starts**
2. **PM2 startup task runs** (scheduled in Windows)
3. **Node.js process launches** (ent-backend)
4. **Express server starts** on port 3000
5. **Angular frontend** becomes accessible at `http://localhost:3000`
6. **No manual intervention needed** ✓

### **Disable Auto-Start (if needed)**

```powershell
pm2 unstartup windows -u Administrator
pm2 delete ecosystem.config.js
```

### **Re-Enable Auto-Start**

```powershell
cd C:\Apps\ENT-PROJECT\ent-backend
pm2 startup windows -u Administrator
npm run pm2:start
pm2 save
```

---

## Troubleshooting

### **App Won't Auto-Start After Restart**

```powershell
# Check PM2 startup task
Get-ScheduledTask -TaskName "PM2" | Get-ScheduledTaskInfo

# Reinstall startup
pm2 unstartup windows -u Administrator
pm2 startup windows -u Administrator
pm2 save
```

### **Port 3000 Already in Use**

```powershell
# Find what's using port 3000
netstat -ano | findstr :3000

# Kill the process (replace 1234 with actual PID)
taskkill /PID 1234 /F

# Or change port in .env and ecosystem.config.js
```

### **Database Connection Error**

```powershell
# Check MySQL service
Get-Service MySQL80

# Start MySQL if not running
Start-Service MySQL80

# Verify credentials
type C:\Apps\ENT-PROJECT\ent-backend\.env

# Test connection
mysql -u ent_user -p ent_clinic_db -e "SELECT 1"
```

### **Application Crashes**

```powershell
cd C:\Apps\ENT-PROJECT\ent-backend

# View crash logs
pm2 logs ent-backend

# Check error file
type logs\error.log

# Restart with debug
pm2 restart ecosystem.config.js
pm2 logs ent-backend --lines 50
```

### **npm or PM2 Commands Not Found**

```powershell
# Restart PowerShell (especially after Node.js install)
# OR explicitly use full path
C:\Program Files\nodejs\npm.exe --version
C:\Program Files\nodejs\npm.exe install -g pm2
```

### **Permission Denied Errors**

```powershell
# Run PowerShell as Administrator
# Right-click PowerShell → "Run as administrator"

# Then try command again
pm2 startup windows -u Administrator
```

---

## Quick Setup Checklist

- [ ] Node.js v18+ installed and in PATH
- [ ] MySQL installed and service running
- [ ] Database `ent_clinic_db` created
- [ ] Database user `ent_user` created with password
- [ ] Project copied to `C:\Apps\ENT-PROJECT`
- [ ] `.env` file updated with correct DB credentials
- [ ] `node init-db.js` executed successfully
- [ ] `npm install` completed in both folders
- [ ] `npm run build` completed in ent-dashboard
- [ ] PM2 installed globally: `npm install -g pm2`
- [ ] PM2 startup configured: `pm2 startup windows -u Administrator`
- [ ] Application started: `npm run pm2:start`
- [ ] `pm2 save` executed
- [ ] Health check passed: `http://localhost:3000/api/health`
- [ ] Frontend loads: `http://localhost:3000`
- [ ] PC restarted and app auto-started
- [ ] All API endpoints responding

---

## Important Notes

### **Auto-Start Requirements**

- ✅ PM2 must be installed globally: `npm install -g pm2`
- ✅ `pm2 startup windows` must be run with admin privileges
- ✅ `pm2 save` must be executed after starting the app
- ✅ Windows Scheduled Task will be created automatically

### **File Permissions**

- Ensure `C:\Apps\ENT-PROJECT\ent-backend\logs\` is writable
- PM2 needs write access to store process information
- Run setup as Administrator to ensure proper permissions

### **Database Backup**

Before deploying to production, backup your database:
```powershell
$backupPath = "C:\Backups\ent_clinic_db_$(Get-Date -Format 'yyyy-MM-dd_HH-mm-ss').sql"
mysqldump -u ent_user -p ent_clinic_db | Out-File $backupPath
```

### **Production Security**

- [ ] Change default database password
- [ ] Update `.env` with strong credentials
- [ ] Restrict MySQL user to localhost only
- [ ] Enable Windows Firewall (allow only necessary ports)
- [ ] Regular database backups scheduled
- [ ] Monitor application logs regularly

---

## Support Commands

### **Quick Status Check**

```powershell
# All in one check
pm2 list; pm2 info ent-backend; Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing
```

### **Full System Restart**

```powershell
pm2 delete ecosystem.config.js
pm2 kill
npm install -g pm2
cd C:\Apps\ENT-PROJECT\ent-backend
npm run pm2:start
pm2 save
```

### **Backup Before Update**

```powershell
$timestamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
mysqldump -u ent_user -p ent_clinic_db | Out-File "C:\Backups\ent_clinic_db_$timestamp.sql"
Copy-Item -Path "C:\Apps\ENT-PROJECT" -Destination "C:\Backups\ENT-PROJECT_$timestamp" -Recurse
```

---

## Next Steps

1. **Follow all steps in order** - Don't skip any
2. **Test each step** - Verify before moving to next
3. **Document any errors** - Note error messages for support
4. **Schedule backups** - Setup automated database backups
5. **Monitor logs** - Check `pm2 logs` regularly in production

---

## Contact & Support

If you encounter issues:
1. Check the **Troubleshooting** section above
2. Review logs: `pm2 logs ent-backend`
3. Verify `.env` configuration
4. Ensure MySQL is running
5. Test health endpoint: `http://localhost:3000/api/health`

---

**Last Updated**: June 5, 2026  
**Version**: 1.0.0  
**Platform**: Windows Server 2016+ | Windows 10/11 Pro  
**Node.js**: v16+ (Recommended: v18 LTS or v20 LTS)  
**MySQL**: v5.7+
