# XStream Backend API Server

A lightweight, standalone video streaming API server with automatic fallback to mock data when scraping fails.

## Features

- Video listing and search
- HLS stream proxying
- Image proxying with caching
- In-memory caching (5 minute TTL)
- Automatic fallback to mock data when source sites are unavailable
- CORS enabled for cross-origin requests

## Requirements

- **Node.js 18+** (tested with Node.js 18.x, 20.x)
- **RAM**: Minimum 512MB, Recommended 1GB+
- **CPU**: Any modern CPU works fine
- **OS**: Ubuntu 20.04/22.04/24.04, Debian, CentOS, or any Linux with Node.js support

## Quick Start (Ubuntu 24/7 Machine)

### Step 1: Update System and Install Node.js

```bash
# Update package lists
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x (LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x
```

### Step 2: Upload and Extract Backend

```bash
# Create directory for the backend
sudo mkdir -p /opt/xstream-api

# Upload the xstream-backend.zip to your server (use scp, sftp, or your preferred method)
# Example using scp from your local machine:
# scp xstream-backend.zip user@your-server-ip:/tmp/

# Extract to the directory
sudo unzip -o /tmp/xstream-backend.zip -d /opt/xstream-api/

# Set permissions
sudo chown -R $USER:$USER /opt/xstream-api
cd /opt/xstream-api
```

### Step 3: Configure Environment (Optional)

```bash
# Create .env file
cat > /opt/xstream-api/.env << 'EOF'
PORT=3001
HOST=0.0.0.0
CACHE_SIZE=1000
CACHE_TTL=300000
SCRAPER_TIMEOUT=15000
EOF
```

### Step 4: Start the Server

```bash
# Start directly (for testing)
cd /opt/xstream-api
node index.js
```

You should see:
```
🚀 XStream API Server started
📊 Cache: 1000 entries, 300000ms TTL
⏱️  Scraper timeout: 15000ms
✅ Server running at http://0.0.0.0:3001
```

## Running as a Background Service (Ubuntu)

Since your system doesn't support `systemctl`, use one of these methods:

### Method 1: Using PM2 (Recommended)

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start the server with PM2
cd /opt/xstream-api
pm2 start index.js --name xstream-api

# Save PM2 configuration
pm2 save

# Configure PM2 to start on boot
pm2 startup
# Run the command it outputs

# Check status
pm2 status

# View logs
pm2 logs xstream-api

# Restart/stop
pm2 restart xstream-api
pm2 stop xstream-api
```

### Method 2: Using nohup (Simple)

```bash
# Start in background
cd /opt/xstream-api
nohup node index.js > /var/log/xstream-api.log 2>&1 &

# Check if running
ps aux | grep "node index.js"

# View logs
tail -f /var/log/xstream-api.log

# To stop, find the PID and kill
ps aux | grep "node index.js"
kill <PID>
```

### Method 3: Using screen

```bash
# Install screen if not available
sudo apt install -y screen

# Create a new screen session
screen -S xstream-api

# Start the server
cd /opt/xstream-api
node index.js

# Detach from screen: Press Ctrl+A then D

# Reattach later
screen -r xstream-api
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check |
| `/api/videos?action=home&page=1` | GET | Get video list |
| `/api/videos?action=search&q=query&page=1` | GET | Search videos |
| `/api/video-data?id=VIDEO_ID` | GET | Get video stream data |
| `/api/image?url=IMAGE_URL` | GET | Proxy images |
| `/api/stream?url=STREAM_URL` | GET | Proxy video streams |

## Testing the API

```bash
# Health check
curl http://localhost:3001/

# Get videos
curl "http://localhost:3001/api/videos?action=home&page=1"

# Search videos
curl "http://localhost:3001/api/videos?action=search&q=teen&page=1"

# Get video data
curl "http://localhost:3001/api/video-data?id=abc123"
```

## Frontend Configuration

In your frontend, set the API URL to your backend server:

```typescript
// For local development
const API_URL = 'http://localhost:3001';

// For production
const API_URL = 'http://your-server-ip:3001';
```

## Firewall Configuration

If you're using a firewall, allow port 3001:

```bash
# Using ufw
sudo ufw allow 3001/tcp

# Or using iptables
sudo iptables -A INPUT -p tcp --dport 3001 -j ACCEPT
```

## Performance Tuning

For high-traffic deployments, consider:

1. **Increase cache size** in `.env`:
   ```
   CACHE_SIZE=5000
   CACHE_TTL=600000
   ```

2. **Use a reverse proxy** (nginx recommended):

   ```nginx
   # /etc/nginx/sites-available/xstream-api
   server {
       listen 80;
       server_name your-domain.com;

       location / {
           proxy_pass http://127.0.0.1:3001;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           proxy_buffering off;
       }
   }
   ```

3. **Enable gzip compression** in nginx for better performance.

## Troubleshooting

### Server won't start
- Check if port 3001 is already in use: `lsof -i :3001`
- Check Node.js version: `node --version` (must be 18+)

### No videos returned
- The scraper might be timing out; mock data should kick in automatically
- Check logs for error messages

### High memory usage
- Reduce `CACHE_SIZE` in `.env`
- Restart the server periodically with PM2: `pm2 restart xstream-api`

## Logs

When using PM2:
```bash
pm2 logs xstream-api
```

When using nohup:
```bash
tail -f /var/log/xstream-api.log
```

## License

MIT License - Use freely for any purpose.

## Support

For issues, check the logs first, then verify:
1. Node.js version is 18+
2. Port 3001 is available
3. Network connectivity to external sites (if using real scraping)
