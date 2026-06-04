module.exports = {
  apps: [
    {
      name: 'ent-backend',
      script: './server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      // Auto-restart settings
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      
      // Logging
      output: './logs/out.log',
      error: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Windows-specific settings
      interpreter: 'node',
      
      // Kill timeout before forcing kill
      kill_timeout: 5000,
      
      // Graceful shutdown
      wait_ready: true,
      listen_timeout: 3000,
      shutdown_with_message: true
    }
  ],
  
  deploy: {
    production: {
      user: 'node',
      host: 'localhost',
      ref: 'origin/main',
      repo: 'git@github.com:yourrepo.git',
      path: 'C:\\apps\\ent-backend',
      'post-deploy': 'npm install && npm run seed && pm2 restart ecosystem.config.js --env production'
    }
  }
};
