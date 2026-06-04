# ENT Clinic - Quick Build & Deploy Reference

## 🚀 One-Command Deployment (Recommended)

### From Project Root
```powershell
cd C:\your\project\path\ENT-PROJECT
.\ent-backend\build-and-deploy.ps1
```

This script:
1. ✅ Builds Angular production bundle
2. ✅ Installs/updates dependencies
3. ✅ Starts/restarts PM2 process
4. ✅ Verifies deployment with health check

---

## 📝 Manual Build & Deploy Steps

### Step 1: Build Angular Frontend
```powershell
cd ent-dashboard
npm install
npm run build
cd ..
```
**Output**: `ent-dashboard/dist/ent-dashboard/`

### Step 2: Setup Backend
```powershell
cd ent-backend
npm install
mkdir logs
cd ..
```

### Step 3: Start with PM2
```powershell
cd ent-backend
npm install -g pm2
npm run pm2:start
cd ..
```

### Step 4: Verify
```powershell
# Check health
Invoke-WebRequest -Uri "http://localhost:3000/api/health"

# View status
cd ent-backend
pm2 status
cd ..
```

---

## ⚡ Quick Commands

### PM2 Management
```powershell
cd ent-backend

# Start
npm run pm2:start

# Stop
npm run pm2:stop

# Restart
npm run pm2:restart

# View logs
npm run pm2:logs

# View status
pm2 status
```

### Manual Start (Without PM2)
```powershell
cd ent-backend
set NODE_ENV=production
npm start
```

### Backend Development Mode
```powershell
cd ent-backend
npm run dev
```

### Frontend-Only Rebuild
```powershell
cd ent-dashboard
npm run build
cd ..
```

### Test Database Connection
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/test-db"
```

---

## 🔄 Deployment Scenarios

### Fresh Deployment
```powershell
.\ent-backend\build-and-deploy.ps1
```

### Update Frontend Only
```powershell
cd ent-dashboard
npm run build
cd ..
# Application auto-detects changes
```

### Update Backend Only
```powershell
cd ent-backend
npm install
npm run pm2:restart
cd ..
```

### Backend Changes (Dev Mode)
```powershell
cd ent-backend
npm run dev  # Auto-restarts on file changes
```

### Troubleshoot
```powershell
cd ent-backend
npm run pm2:logs  # View error logs
pm2 flush         # Clear logs
pm2 delete all    # Remove all processes
```

---

## 🌐 Application URLs

| URL | Purpose |
|-----|---------|
| `http://localhost:3000` | Angular Dashboard |
| `http://localhost:3000/api` | API Info |
| `http://localhost:3000/api/health` | Health Check |
| `http://localhost:3000/api/test-db` | Database Test |
| `http://localhost:3000/api/auth/login` | User Login |
| `http://localhost:3000/api/patients` | Patient API |
| `http://localhost:3000/api/master` | Master Data API |

---

## 🐛 Common Issues

### Port 3000 Already in Use
```powershell
# Find and kill process
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Or change port in ent-backend/.env and ecosystem.config.js
```

### Angular Build Fails
```powershell
cd ent-dashboard
npm cache clean --force
rm -r node_modules
npm install
npm run build
```

### Database Connection Error
```powershell
# Verify MySQL is running
Get-Service MySQL80

# Start MySQL if needed
Start-Service MySQL80

# Check credentials in ent-backend/.env
```

### PM2 Won't Start
```powershell
npm install -g pm2
pm2 kill
pm2 start ecosystem.config.js --env production
```

---

## 📊 Monitor Application

```powershell
cd ent-backend

# Real-time dashboard
pm2 monit

# Process list
pm2 list

# Tail logs
pm2 logs ent-backend

# Process info
pm2 info ent-backend
```

---

## 💾 Backup Before Deploy

```powershell
# Backup database
mysqldump -u root -p ent_clinic_db > backup_$(Get-Date -Format 'yyyy-MM-dd_HH-mm-ss').sql

# Backup application
Compress-Archive -Path "ent-backend", "ent-dashboard" -DestinationPath "backup_$(Get-Date -Format 'yyyy-MM-dd_HH-mm-ss').zip"
```

---

## 🔐 Production Checklist

- [ ] `.env` configured with production database
- [ ] `NODE_ENV=production` set in ecosystem.config.js
- [ ] MySQL service running and accessible
- [ ] PM2 installed globally: `npm install -g pm2`
- [ ] Angular built: `ent-dashboard/dist/` exists
- [ ] Health check passes: `http://localhost:3000/api/health`
- [ ] All API endpoints responding
- [ ] Logs directory writable: `ent-backend/logs/`
- [ ] Backup completed

---

## 📞 Need Help?

1. Check logs: `pm2 logs ent-backend`
2. View detailed guide: [DEPLOYMENT.md](DEPLOYMENT.md)
3. Verify setup: `pm2 status`
4. Test endpoints: `Invoke-WebRequest -Uri "http://localhost:3000/api/health"`

---

**Last Updated**: June 5, 2026 | **Version**: 1.0.0
