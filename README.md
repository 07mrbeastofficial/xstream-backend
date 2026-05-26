# XStream Backend API Server v2.0

🚀 **OPTIMIZED for 4-core, 16GB RAM servers**

A high-performance video streaming API server with clustering, parallel scraping, and connection pooling.

## Performance Features

### Multi-Core Clustering
- Automatically spawns worker processes for each CPU core
- **4 workers on 4-core CPU** = 4x request handling capacity
- Auto-restart crashed workers

### Parallel Scraping
- Up to 20 concurrent HTTP requests
- Connection pooling (keep-alive) for faster requests
- Smart queue management

### Memory Optimized
- **10,000 entry LRU cache** for 16GB RAM
- 10-minute cache TTL
- Hit rate tracking and stats

### Connection Management
- Keep-alive connections (65s timeout)
- 100 max sockets per agent
- 50 free sockets in pool

## Quick Start (Ubuntu)

### Install Node.js 20
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Upload and Run
```bash
# Upload xstream-backend.zip to your server
unzip xstream-backend.zip -d /opt/xstream-api
cd /opt/xstream-api
node index.js
```

### Expected Output
```
🚀 XStream API Server v2.0.0
📊 Master 12345 starting 4 workers...
💾 Memory: 16GB optimized, Cache: 10000 entries
⚡ Parallel scrapes: 20, Keep-alive: 65000ms
✅ Worker 12346 running at http://0.0.0.0:3001
✅ Worker 12347 running at http://0.0.0.0:3001
✅ Worker 12348 running at http://0.0.0.0:3001
✅ Worker 12349 running at http://0.0.0.0:3001
```

## Production Deployment with PM2

```bash
# Install PM2
sudo npm install -g pm2

# Start with PM2 (auto-detects cores)
pm2 start index.js --name xstream-api -i max

# Save config
pm2 save

# Auto-start on boot
pm2 startup
# Run the command it outputs

# Monitor
pm2 monit

# Logs
pm2 logs xstream-api
```

## Configuration (.env)

```bash
# Server
PORT=3001
HOST=0.0.0.0

# Cache (optimized for 16GB RAM)
CACHE_SIZE=10000
CACHE_TTL=600000

# Workers (match your CPU cores)
MAX_WORKERS=4

# Parallel scraping
MAX_PARALLEL_SCRAPES=20
SCRAPER_TIMEOUT=10000

# Connection pooling
MAX_CONNECTIONS=1000
KEEP_ALIVE=65000
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Health check with worker stats |
| `GET /api/videos?action=home&page=1` | List videos |
| `GET /api/videos?action=search&q=query` | Search |
| `GET /api/video-data?id=ID` | Get stream URL |
| `GET /api/image?url=URL` | Image proxy |
| `GET /api/stream?url=URL` | Stream proxy |

## Health Check Response

```json
{
  "status": "ok",
  "service": "xstream-api",
  "version": "2.0.0",
  "cluster": {
    "worker": 1,
    "pid": 12346
  },
  "cache": {
    "size": 1234,
    "maxSize": 10000,
    "hits": 50000,
    "misses": 1200,
    "hitRate": "97.64%"
  },
  "uptime": 3600,
  "memory": {
    "used": "245MB",
    "total": "512MB"
  }
}
```

## Performance Tuning

### For 8-core CPU
```bash
MAX_WORKERS=8
MAX_PARALLEL_SCRAPES=40
CACHE_SIZE=20000
```

### For Heavy Traffic
```bash
MAX_CONNECTIONS=2000
MAX_PARALLEL_SCRAPES=50
CACHE_SIZE=20000
CACHE_TTL=900000
```

### For Low Memory (4GB)
```bash
MAX_WORKERS=2
CACHE_SIZE=5000
MAX_PARALLEL_SCRAPES=10
```

## Nginx Reverse Proxy (Recommended)

```nginx
upstream xstream_backend {
    least_conn;
    server 127.0.0.1:3001;
    keepalive 64;
}

server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://xstream_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;
    }
}
```

## Troubleshooting

### High Memory Usage
- Reduce `CACHE_SIZE`
- Check for memory leaks: `pm2 monit`

### Slow Responses
- Increase `MAX_PARALLEL_SCRRAPES`
- Check cache hit rate on `/` endpoint
- Verify network connectivity

### Worker Crashes
- Check logs: `pm2 logs xstream-api --err`
- Reduce `MAX_WORKERS` if CPU is overloaded

## Architecture

```
                    ┌─────────────────┐
                    │   Nginx/Proxy   │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
    ┌────▼────┐        ┌────▼────┐        ┌────▼────┐
    │ Worker 1│        │ Worker 2│        │ Worker 3│  ...
    │ (Core 1)│        │ (Core 2)│        │ (Core 3)│
    └────┬────┘        └────┬────┘        └────┬────┘
         │                   │                   │
    ┌────▼────────────────────▼────────────────────▼────┐
    │              Shared LRU Cache (10k entries)        │
    └────────────────────────────────────────────────────┘
                              │
    ┌─────────────────────────▼─────────────────────────┐
    │         Parallel Scraper (20 concurrent)          │
    │              Connection Pool                      │
    └───────────────────────────────────────────────────┘
```

## License

MIT
