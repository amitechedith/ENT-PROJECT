# ENT Clinic Management: Windows Run Guide

This document explains how to run this project on a Windows machine and how to share it with a client without exposing the full codebase.

## Project Structure

- `ent-dashboard`: Angular front-end
- `ent-backend`: Node.js + Express back-end

## Recommended Best Practice

If you do not want to expose your code to the client, use this approach:

1. Keep the full source code in your private machine/repository.
2. Run the application on a machine or server controlled by you.
3. Let the client access the application through a browser.
4. If the client must run it on their own Windows machine, share only deployment artifacts, not the full repo.

Important:

- Front-end code is always visible in browser in built/minified form.
- Back-end code can only remain private if it stays on a machine you control.
- If you give the client the back-end source and they run it locally, they can access that code.

## License-Free Tools

All of the following are free to use:

- Node.js LTS
- MySQL Community Server
- Git
- PM2
- `serve`

## Prerequisites on Windows

Install these first:

- Node.js LTS
- MySQL Community Server
- Git

Verify installation:

```bash
node -v
npm -v
mysql --version
git --version
```

## Copy Project to Windows

Place the project in a folder like:

```bash
C:\Apps\Angular
```

You should have:

```bash
C:\Apps\Angular\ent-dashboard
C:\Apps\Angular\ent-backend
```

## Back-End Setup

Open Command Prompt or PowerShell:

```bash
cd C:\Apps\Angular\ent-backend
npm install
```

Create `.env` inside `ent-backend`:

```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=ent_clinic_db
```

Use a fresh password for client deployment. Do not reuse your own local credentials.

## SQL Setup

Create DB `ent-backend` using the backend setup scripts:

```bash
node init-db.js
node seed.js
```

## Start Back-End

Development:

```bash
npm run dev
```

Simple run:

```bash
npm start
```

Back-end URL:

```bash
http://localhost:3000
```

## Front-End Setup

Open a second terminal:

```bash
cd C:\Apps\Angular\ent-dashboard
npm install
npm start
```

Front-end URL:

```bash
http://localhost:4200
```

The front-end is configured to call:

```bash
http://localhost:3000/api
```

## How to Run the Full App

1. Start MySQL.
2. Start the back-end from `ent-backend`.
3. Start the front-end from `ent-dashboard`.
4. Open `http://localhost:4200` in browser.

## Node.js Delivery Without Exposing Source

Use `nexe` tool for Node.js code.

Example flow from `ent-backend`:

```bash
npm install
npm install -g nexe
##on windows
nexe server.js -o ent-backend.exe

## on mac
nexe server.js --build --python python3 -o ent-backend


```

This creates a Windows executable such as:

```bash
ent-backend.exe
```

## Angular Production Build

For Angular, build in production mode from `ent-dashboard`:

```bash
cd C:\Apps\Angular\ent-dashboard
npm install
ng build --configuration production
```

In [angular.json](/Users/amitpanchal/CODE_BASE/Angular/ent-dashboard/angular.json), set:

```json
"sourceMap": false
```

## Best Practice to Avoid Exposing Code

### Most secure option

Host both front-end and back-end on your own machine/server.

- Client uses browser only
- Full source remains private

### If client must run it locally

Share only:

- front-end production build
- back-end deployment package
- database setup files
- `.env.example`
- operator instructions

Do not share:

- full repo
- `.git`
- local `.env`
- private credentials
- development notes

## Important Limitation

You cannot fully hide Angular front-end code from a client using the browser. Even after production build, browser assets can be inspected.

You can keep the back-end private only if:

- it runs on your server
- or on a machine the client cannot access at source level

## Suggested Delivery Models

### Model 1: Best practice

You host everything.

- client gets URL access
- source code stays with you

### Model 2: Partial protection

You deploy on client Windows machine yourself.

- share build/runtime only
- avoid sharing full repo

### Model 3: Not recommended

Share the full project folder.

- easiest to run
- exposes all source code

## Optional: Run Automatically with PM2

Install PM2:

```bash
npm install -g pm2
```

Start back-end:

```bash
cd C:\Apps\Angular\ent-backend
pm2 start server.js --name ent-backend
```

If serving front-end build:

```bash
pm2 start "serve -s dist\\ent-dashboard -l 4200" --name ent-frontend
```

Save process list:

```bash
pm2 save
```

On Windows, Task Scheduler is also a good free option if you want services to auto-start after login or reboot.

## Suggested Folder Structure for Deployment

```bash
C:\ENT-Clinic\
  backend\
  frontend\
  logs\
  .env
```

## Suggested `.env.example`

```env
PORT=3000
DB_HOST=localhost
DB_USER=ent_user
DB_PASSWORD=change_me
DB_NAME=ent_clinic_db
```

## Quick Client Operator Steps

If someone only needs to run the app:

1. Install Node.js and MySQL.
2. Set up `.env`.
3. Run database setup.
4. Start the back-end.
5. Start the front-end or serve the build.
6. Open `http://localhost:4200`.

## Final Recommendation

For this project, the safest practical approach is:

1. Keep the source code only with you.
2. Deploy the app yourself.
3. Give the client browser access only.

If local client deployment is unavoidable, share only production-ready artifacts, not the full repository.
