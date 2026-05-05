module.exports = {
  apps: [
    {
      name: process.env.APP_NAME || 'nodepanel',
      cwd: __dirname,
      script: 'server/src/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};

