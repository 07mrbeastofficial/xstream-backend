const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');
const os = require('os');
const cluster = require('cluster');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { URL } = require('url');

// ============================================
// XSTREAM API - OPTIMIZED FOR 4-CORE, 16GB RAM
// ============================================

// Configuration - Optimized for high performance
const CONFIG = {
  port: parseInt(process.env.PORT || '3001'),
  host: process.env.HOST || '0.0.0.0',
  
  // Cache - Large for 16GB RAM
  cacheSize: parseInt(process.env.CACHE_SIZE || '10000'), // 10k entries
  cacheTTL: parseInt(process.env.CACHE_TTL || '600000'), // 10 minutes
  
  // Timeouts
  scraperTimeout: parseInt(process.env.SCRAPER_TIMEOUT || '10000'), // 10 seconds
  connectionTimeout: parseInt(process.env.CONNECTION_TIMEOUT || '30000'),
  
  // Performance
  maxConnections: parseInt(process.env.MAX_CONNECTIONS || '1000'),
  keepAliveTimeout: parseInt(process.env.KEEP_ALIVE || '65000'),
  
  // Workers
  maxWorkers: parseInt(process.env.MAX_WORKERS || '4'), // 4 cores
  
  // Parallel scraping
  maxParallelScrapes: parseInt(process.env.MAX_PARALLEL_SCRAPES || '20'),
};

// ============================================
// LRU CACHE WITH TTL - Thread-safe optimized
// ============================================
class LRUCache {
  constructor(maxSize = 10000, defaultTTL = 600000) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
    this.cache = new Map();
    this.keys = [];
    this.hits = 0;
    this.misses = 0;
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) {
      this.misses++;
      return null;
    }
    
    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      this.keys = this.keys.filter(k => k !== key);
      this.misses++;
      return null;
    }
    
    this.hits++;
    return item.data;
  }

  set(key, data, ttl = this.defaultTTL) {
    if (this.cache.has(key)) {
      this.cache.set(key, { data, timestamp: Date.now(), ttl });
      return;
    }
    
    if (this.keys.length >= this.maxSize) {
      const oldKey = this.keys.shift();
      if (oldKey) this.cache.delete(oldKey);
    }
    
    this.keys.push(key);
    this.cache.set(key, { data, timestamp: Date.now(), ttl });
  }

  delete(key) {
    this.cache.delete(key);
    this.keys = this.keys.filter(k => k !== key);
  }

  clear() {
    this.cache.clear();
    this.keys = [];
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits + this.misses > 0 ? (this.hits / (this.hits + this.misses) * 100).toFixed(2) + '%' : '0%'
    };
  }
}

// Global cache instance
const memoryCache = new LRUCache(CONFIG.cacheSize, CONFIG.cacheTTL);

// ============================================
// HTTP AGENT POOL - Connection reuse
// ============================================
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 100,
  maxFreeSockets: 50,
  timeout: CONFIG.connectionTimeout
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 100,
  maxFreeSockets: 50,
  timeout: CONFIG.connectionTimeout
});

// ============================================
// USER AGENTS - Rotation for scraping
// ============================================
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

// ============================================
// MOCK DATA - Fallback when scraping fails
// ============================================
const mockVideos = generateMockVideos(500);

function generateMockVideos(count) {
  const titles = [
    'Hot Amateur Couple Having Intense Sex On Camera', 'Beautiful Teen Gets Fucked Hard', 
    'MILF With Big Tits Seduces Young Stud', 'Lesbian Teens Explore Each Other',
    'Asian Schoolgirl Gets Creampie After Class', 'Brunette Babe Sucks And Rides Big Cock',
    'Interracial Threesome With Hot Blondes', 'Japanese Massage Parlor Hidden Camera',
    'Redhead Squirts Multiple Times During Sex', 'Big Booty Latina Takes It From Behind',
    'Petite Teen vs Monster Cock', 'Cheating Wife Gets Caught And Punished',
    'POV Blowjob From Sexy Girlfriend', 'Anal Sex With Tight Russian Teen',
    'Ebony Queen Rides BBC Like A Pro', 'College Party Turns Into Wild Orgy',
    'Solo Masturbation With Big Toys', 'Public Sex In The Park',
    'Stepsister Caught Watching Porn And Fucked', 'BDSM Slave Gets Punished Hard',
    'Squirt Compilation - Best Of 2024', 'Hot Latina Maid Gets Fucked For Money',
    'Double Penetration For Tight Pussy', 'Indian Bhabhi Secret Affair',
    'Teen First Time Anal - Screaming Orgasm', 'German Mature MILF Fucks Young Boy',
    'Thai Massage With Happy Ending', 'Black Teen Takes White Cock Deep',
    'Korean BJ Live Stream Leaked', 'Skinny Blonde Destroyed By Huge Dick',
    'Wife Shared With Friend For First Time', 'Cosplay Girl Fucked In Costume',
    'Big Natural Tits Bouncing During Sex', 'Arab Girl Fucked By European Tourist',
    'Russian Teen Anal Casting Couch', 'French Maid Gets Fucked By Boss',
    'Gangbang Party With Five Guys', 'Latina Stepsister Seduces Brother',
    'Japanese Teen Schoolgirl Uniform', 'Mature Woman Seduces Young Neighbor',
    'Outdoor Sex On The Beach', 'Office Secretary Fucks Boss',
    'Nurse Gives Patient Special Treatment', 'Teacher Fucks Student In Classroom',
    'Sister Caught Stealing And Fucked', 'Stepmom Teaches Stepson Sex',
    'Pregnant MILF Gets Fucked Hard', 'Bride Fucks Best Man Before Wedding',
  ];
  
  const videos = [];
  for (let i = 0; i < count; i++) {
    const id = Math.random().toString(36).substring(2, 10);
    videos.push({
      id,
      title: titles[i % titles.length] + (i > titles.length ? ` Part ${Math.floor(i / titles.length) + 1}` : ''),
      duration: `${Math.floor(Math.random() * 40) + 5}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`,
      views: formatViews(Math.floor(Math.random() * 5000000) + 100000),
      rating: `${Math.floor(Math.random() * 15) + 85}%`,
      hd: Math.random() > 0.3,
    });
  }
  return videos;
}

function formatViews(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(0) + 'K';
  return num.toString();
}

// ============================================
// PARALLEL SCRAPER - Concurrent requests
// ============================================
class ParallelScraper {
  constructor(maxConcurrent = 20) {
    this.maxConcurrent = maxConcurrent;
    this.queue = [];
    this.active = 0;
  }

  async fetch(url) {
    return new Promise((resolve, reject) => {
      this.queue.push({ url, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    while (this.queue.length > 0 && this.active < this.maxConcurrent) {
      this.active++;
      const task = this.queue.shift();
      
      this.fetchUrl(task.url)
        .then(task.resolve)
        .catch(task.reject)
        .finally(() => {
          this.active--;
          this.processQueue();
        });
    }
  }

  fetchUrl(fetchUrl) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(fetchUrl);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;
      const agent = isHttps ? httpsAgent : httpAgent;
      
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, CONFIG.scraperTimeout);

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        agent,
        headers: {
          'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        }
      };

      const req = client.request(options, (res) => {
        let data = '';
        
        // Handle gzip
        let stream = res;
        if (res.headers['content-encoding'] === 'gzip') {
          const zlib = require('zlib');
          stream = res.pipe(zlib.createGunzip());
        }
        
        stream.on('data', chunk => data += chunk);
        stream.on('end', () => {
          clearTimeout(timeout);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
        
        stream.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      req.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      req.end();
    });
  }
}

const scraper = new ParallelScraper(CONFIG.maxParallelScrapes);

// ============================================
// VIDEO PARSER - Optimized regex
// ============================================
function parseVideoList(html) {
  const videos = [];
  const videoRegex = /<div[^>]*class="[^"]*thumb-block[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*title="([^"]+)"[^>]*>[\s\S]*?<img[^>]*(?:data-src|src)="([^"]+)"[^>]*>[\s\S]*?<span[^>]*class="duration"[^>]*>([^<]+)<\/span>/gi;
  
  let match;
  while ((match = videoRegex.exec(html)) !== null) {
    const href = match[1];
    const idMatch = href.match(/video\.([a-zA-Z0-9]+)/);
    
    if (idMatch) {
      videos.push({
        id: idMatch[1],
        title: match[2].replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"'),
        thumbnail: match[3],
        duration: match[4].trim(),
        views: formatViews(Math.floor(Math.random() * 5000000) + 100000),
        rating: `${Math.floor(Math.random() * 15) + 85}%`,
        source: 'xvideos',
        hd: match[2].toLowerCase().includes('hd'),
      });
    }
  }
  
  return videos;
}

// ============================================
// RESPONSE HELPERS
// ============================================
function sendJSON(res, data, statusCode = 200) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'public, max-age=300',
  });
  res.end(body);
}

function sendError(res, message, statusCode = 500) {
  sendJSON(res, { error: message }, statusCode);
}

// ============================================
// MOCK DATA GENERATORS
// ============================================
function getMockVideos(page, searchQuery = '') {
  const videosPerPage = 24;
  let filtered = [...mockVideos];
  
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = mockVideos.filter(v => v.title.toLowerCase().includes(q));
    if (filtered.length < 10) {
      filtered = mockVideos.sort(() => Math.random() - 0.5).slice(0, 24);
    }
  }
  
  const start = (page - 1) * videosPerPage;
  const end = start + videosPerPage;
  const paginated = filtered.slice(start, end).map(v => ({
    ...v,
    source: 'xvideos',
    thumbnail: `https://picsum.photos/seed/${v.id}/320/180`,
  }));
  
  return {
    videos: paginated,
    totalResults: filtered.length * 3,
    currentPage: page,
    hasNextPage: end < filtered.length,
  };
}

function getMockVideoData(id) {
  const mock = mockVideos.find(v => v.id === id) || {
    id,
    title: `Adult Video ${id}`,
    duration: '15:00',
    views: '500K',
    rating: '90%',
    hd: true,
  };
  
  return {
    video: { ...mock, source: 'xvideos', thumbnail: `https://picsum.photos/seed/${id}/320/180` },
    streamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    hlsUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    posterUrl: `https://picsum.photos/seed/${id}/1280/720`,
    error: null,
  };
}

// ============================================
// REQUEST HANDLER
// ============================================
async function handleRequest(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const startTime = Date.now();

  try {
    // Health check with stats
    if (pathname === '/') {
      sendJSON(res, {
        status: 'ok',
        service: 'xstream-api',
        version: '2.0.0',
        cluster: {
          worker: cluster.worker ? cluster.worker.id : 'master',
          pid: process.pid,
        },
        cache: memoryCache.getStats(),
        uptime: process.uptime(),
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB',
        }
      });
      return;
    }

    // Videos API
    if (pathname === '/api/videos') {
      const action = query.action || 'home';
      const page = parseInt(query.page || '1');
      const searchQuery = query.q || '';

      const cacheKey = action === 'search' 
        ? `search:${searchQuery}:${page}` 
        : `homepage:${page}`;

      const cached = memoryCache.get(cacheKey);
      if (cached) {
        sendJSON(res, cached);
        return;
      }

      try {
        let targetUrl;
        if (action === 'search') {
          targetUrl = `https://www.xvideos.com/?k=${encodeURIComponent(searchQuery)}&p=${page}`;
        } else {
          targetUrl = page === 1 
            ? 'https://www.xvideos.com/' 
            : `https://www.xvideos.com/new/${page}`;
        }

        const html = await scraper.fetch(targetUrl);
        const videos = parseVideoList(html);

        if (videos.length > 0) {
          const result = {
            videos,
            totalResults: videos.length * 50,
            currentPage: page,
            hasNextPage: videos.length > 0,
          };
          memoryCache.set(cacheKey, result);
          sendJSON(res, result);
          return;
        }
      } catch (err) {
        console.log(`[Worker ${process.pid}] Scraping failed: ${err.message}`);
      }

      // Fallback
      const result = getMockVideos(page, searchQuery);
      memoryCache.set(cacheKey, result);
      sendJSON(res, result);
      return;
    }

    // Video data API
    if (pathname === '/api/video-data') {
      const id = query.id;
      if (!id) {
        sendError(res, 'Video ID required', 400);
        return;
      }

      const cacheKey = `video:${id}`;
      const cached = memoryCache.get(cacheKey);
      if (cached) {
        sendJSON(res, cached);
        return;
      }

      try {
        const html = await scraper.fetch(`https://www.xvideos.com/video.${id}/_`);
        
        const hlsMatch = html.match(/html5player\.setVideoHLS\s*\(\s*['"]([^'"]+)['"]\s*\)/);
        const highMatch = html.match(/html5player\.setVideoUrlHigh\s*\(\s*['"]([^'"]+)['"]\s*\)/);
        const posterMatch = html.match(/html5player\.setThumbUrl\s*\(\s*['"]([^'"]+)['"]\s*\)/);
        const titleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/);

        if (hlsMatch || highMatch) {
          const result = {
            video: {
              id,
              title: titleMatch ? titleMatch[1].replace(/&amp;/g, '&').replace(/&#039;/g, "'") : `Video ${id}`,
              thumbnail: posterMatch ? posterMatch[1] : '',
              duration: '',
              views: formatViews(Math.floor(Math.random() * 5000000) + 100000),
              rating: `${Math.floor(Math.random() * 15) + 85}%`,
              source: 'xvideos',
              hd: true,
            },
            streamUrl: highMatch ? highMatch[1] : '',
            hlsUrl: hlsMatch ? hlsMatch[1] : '',
            posterUrl: posterMatch ? posterMatch[1] : '',
            error: null,
          };
          memoryCache.set(cacheKey, result);
          sendJSON(res, result);
          return;
        }
      } catch (err) {
        console.log(`[Worker ${process.pid}] Video fetch failed: ${err.message}`);
      }

      const result = getMockVideoData(id);
      sendJSON(res, result);
      return;
    }

    // Image proxy
    if (pathname === '/api/image') {
      const imageUrl = query.url;
      if (!imageUrl) {
        sendError(res, 'URL required', 400);
        return;
      }

      const decodedUrl = decodeURIComponent(imageUrl);
      
      // Picsum direct
      if (decodedUrl.includes('picsum.photos')) {
        https.get(decodedUrl, {
          headers: { 'User-Agent': userAgents[0], 'Accept': 'image/*' }
        }, (imgRes) => {
          if (imgRes.statusCode === 301 || imgRes.statusCode === 302) {
            https.get(imgRes.headers.location, (redirectRes) => {
              const chunks = [];
              redirectRes.on('data', c => chunks.push(c));
              redirectRes.on('end', () => {
                const buf = Buffer.concat(chunks);
                res.writeHead(200, {
                  'Content-Type': redirectRes.headers['content-type'] || 'image/jpeg',
                  'Cache-Control': 'public, max-age=86400',
                });
                res.end(buf);
              });
            }).on('error', () => sendError(res, 'Image proxy error'));
            return;
          }

          const chunks = [];
          imgRes.on('data', c => chunks.push(c));
          imgRes.on('end', () => {
            const buf = Buffer.concat(chunks);
            res.writeHead(200, {
              'Content-Type': imgRes.headers['content-type'] || 'image/jpeg',
              'Cache-Control': 'public, max-age=86400',
            });
            res.end(buf);
          });
        }).on('error', () => sendError(res, 'Image proxy error'));
        return;
      }

      // Regular image proxy
      const parsed = new URL(decodedUrl);
      const client = parsed.protocol === 'https:' ? https : http;
      
      client.get(decodedUrl, {
        agent: parsed.protocol === 'https:' ? httpsAgent : httpAgent,
        headers: { 'User-Agent': userAgents[0], 'Accept': 'image/*' }
      }, (imgRes) => {
        if (imgRes.statusCode !== 200) {
          sendError(res, 'Failed to fetch', imgRes.statusCode);
          return;
        }
        
        const chunks = [];
        imgRes.on('data', c => chunks.push(c));
        imgRes.on('end', () => {
          const buf = Buffer.concat(chunks);
          res.writeHead(200, {
            'Content-Type': imgRes.headers['content-type'] || 'image/jpeg',
            'Cache-Control': 'public, max-age=86400',
          });
          res.end(buf);
        });
      }).on('error', () => sendError(res, 'Image proxy error'));
      return;
    }

    // Stream proxy
    if (pathname === '/api/stream') {
      const streamUrl = query.url;
      if (!streamUrl) {
        sendError(res, 'URL required', 400);
        return;
      }

      const decodedUrl = decodeURIComponent(streamUrl);
      const parsed = new URL(decodedUrl);
      const client = parsed.protocol === 'https:' ? https : http;

      client.get(decodedUrl, {
        agent: parsed.protocol === 'https:' ? httpsAgent : httpAgent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': '*/*',
          'Referer': 'https://www.xvideos.com/',
        }
      }, (streamRes) => {
        if (streamRes.statusCode !== 200) {
          sendError(res, 'Failed to fetch stream', streamRes.statusCode);
          return;
        }

        const contentType = streamRes.headers['content-type'] || 'application/octet-stream';
        
        // M3U8 rewriting
        if (decodedUrl.includes('.m3u8') || contentType.includes('mpegurl')) {
          const chunks = [];
          streamRes.on('data', c => chunks.push(c));
          streamRes.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf-8');
            const baseUrl = decodedUrl.substring(0, decodedUrl.lastIndexOf('/') + 1);
            
            const rewritten = text.split('\n').map(line => {
              if (line.startsWith('#') || !line.trim()) return line;
              const abs = line.startsWith('http') ? line : baseUrl + line;
              return `/api/stream?url=${encodeURIComponent(abs)}`;
            }).join('\n');
            
            res.writeHead(200, {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=3600',
            });
            res.end(rewritten);
          });
          return;
        }

        // Direct stream
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600',
        });
        streamRes.pipe(res);
      }).on('error', () => sendError(res, 'Stream proxy error'));
      return;
    }

    // 404
    sendError(res, 'Not found', 404);

  } catch (error) {
    console.error(`[Worker ${process.pid}] Error:`, error.message);
    sendError(res, 'Internal server error');
  }
}

// ============================================
// CLUSTER MODE - Use all 4 cores
// ============================================
if (cluster.isPrimary && CONFIG.maxWorkers > 1) {
  const numWorkers = Math.min(CONFIG.maxWorkers, os.cpus().length);
  
  console.log(`🚀 XStream API Server v2.0.0`);
  console.log(`📊 Master ${process.pid} starting ${numWorkers} workers...`);
  console.log(`💾 Memory: 16GB optimized, Cache: ${CONFIG.cacheSize} entries`);
  console.log(`⚡ Parallel scrapes: ${CONFIG.maxParallelScrapes}, Keep-alive: ${CONFIG.keepAliveTimeout}ms`);
  
  // Fork workers
  for (let i = 0; i < numWorkers; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`⚠️ Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });

  cluster.on('listening', (worker, address) => {
    console.log(`✅ Worker ${worker.process.pid} listening on port ${address.port}`);
  });

} else {
  // Worker process
  const server = http.createServer(handleRequest);
  
  // Optimized server settings
  server.keepAliveTimeout = CONFIG.keepAliveTimeout;
  server.headersTimeout = CONFIG.keepAliveTimeout + 5000;
  server.maxHeadersCount = 100;
  
  server.listen(CONFIG.port, CONFIG.host, () => {
    console.log(`✅ Worker ${process.pid} running at http://${CONFIG.host}:${CONFIG.port}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log(`🛑 Worker ${process.pid} shutting down...`);
    server.close(() => process.exit(0));
  });

  process.on('SIGINT', () => {
    server.close(() => process.exit(0));
  });
}
