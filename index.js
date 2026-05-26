const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env file
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
        process.env[key.trim()] = value;
      }
    });
  }
}
loadEnv();

// Configuration
const CONFIG = {
  port: parseInt(process.env.PORT || '3001'),
  host: process.env.HOST || '0.0.0.0',
  cacheSize: parseInt(process.env.CACHE_SIZE || '1000'),
  cacheTTL: parseInt(process.env.CACHE_TTL || '300000'), // 5 minutes
  scraperTimeout: parseInt(process.env.SCRAPER_TIMEOUT || '15000'), // 15 seconds
};

// In-memory cache
const memoryCache = new Map();

function getCache(key) {
  const cached = memoryCache.get(key);
  if (cached && Date.now() - cached.timestamp < CONFIG.cacheTTL) {
    return cached.data;
  }
  memoryCache.delete(key);
  return null;
}

function setCache(key, data) {
  if (memoryCache.size >= CONFIG.cacheSize) {
    const oldestKey = memoryCache.keys().next().value;
    memoryCache.delete(oldestKey);
  }
  memoryCache.set(key, { data, timestamp: Date.now() });
}

// Mock video data for fallback (used when scraping fails)
const mockVideos = [
  { id: 'abc123', title: 'Hot Amateur Couple Having Intense Sex On Camera', duration: '12:34', views: '1.2M', rating: '94%', hd: true },
  { id: 'def456', title: 'Beautiful Teen Gets Fucked Hard By Boyfriend', duration: '18:22', views: '856K', rating: '92%', hd: true },
  { id: 'ghi789', title: 'MILF With Big Tits Seduces Young Stud', duration: '25:17', views: '2.1M', rating: '96%', hd: true },
  { id: 'jkl012', title: 'Lesbian Teens Explore Each Other For First Time', duration: '14:45', views: '432K', rating: '89%', hd: false },
  { id: 'mno345', title: 'Asian Schoolgirl Gets Creampie After Class', duration: '22:08', views: '1.5M', rating: '91%', hd: true },
  { id: 'pqr678', title: 'Brunette Babe Sucks And Rides Big Cock', duration: '16:33', views: '678K', rating: '88%', hd: true },
  { id: 'stu901', title: 'Interracial Threesome With Two Hot Blondes', duration: '28:44', views: '923K', rating: '95%', hd: true },
  { id: 'vwx234', title: 'Japanese Massage Parlor Hidden Camera', duration: '35:12', views: '1.8M', rating: '93%', hd: true },
  { id: 'yza567', title: 'Redhead Squirts Multiple Times During Sex', duration: '19:27', views: '567K', rating: '90%', hd: true },
  { id: 'bcd890', title: 'Big Booty Latina Takes It From Behind', duration: '21:15', views: '1.3M', rating: '94%', hd: true },
  { id: 'efg123', title: 'Petite Teen vs Monster Cock - Very Tight', duration: '17:42', views: '2.3M', rating: '97%', hd: true },
  { id: 'hij456', title: 'Cheating Wife Gets Caught And Punished', duration: '24:56', views: '789K', rating: '91%', hd: true },
  { id: 'klm789', title: 'POV Blowjob From Sexy Girlfriend', duration: '8:23', views: '445K', rating: '86%', hd: false },
  { id: 'nop012', title: 'Anal Sex With Tight Russian Teen', duration: '15:38', views: '1.1M', rating: '92%', hd: true },
  { id: 'qrs345', title: 'Ebony Queen Rides BBC Like A Pro', duration: '20:11', views: '634K', rating: '89%', hd: true },
  { id: 'tuv678', title: 'College Party Turns Into Wild Orgy', duration: '42:33', views: '1.7M', rating: '95%', hd: true },
  { id: 'wxy901', title: 'Solo Masturbation With Big Toys', duration: '11:45', views: '234K', rating: '84%', hd: false },
  { id: 'zab234', title: 'Public Sex In The Park - Almost Caught', duration: '13:22', views: '567K', rating: '88%', hd: true },
  { id: 'cde567', title: 'Stepsister Caught Watching Porn And Fucked', duration: '19:08', views: '2.8M', rating: '96%', hd: true },
  { id: 'fgh890', title: 'BDSM Slave Gets Punished Hard', duration: '26:44', views: '345K', rating: '87%', hd: true },
  { id: 'ijk123', title: 'Squirt Compilation - Best Of 2024', duration: '45:12', views: '1.4M', rating: '93%', hd: true },
  { id: 'lmn456', title: 'Hot Latina Maid Gets Fucked For Money', duration: '22:17', views: '876K', rating: '90%', hd: true },
  { id: 'opq789', title: 'Double Penetration For Tight Pussy', duration: '18:33', views: '654K', rating: '91%', hd: true },
  { id: 'rst012', title: 'Indian Bhabhi Secret Affair With Devar', duration: '31:25', views: '1.9M', rating: '94%', hd: true },
  { id: 'uvw345', title: 'Teen First Time Anal - Screaming Orgasm', duration: '16:48', views: '1.2M', rating: '92%', hd: true },
  { id: 'xyz678', title: 'German Mature MILF Fucks Young Boy', duration: '28:11', views: '432K', rating: '85%', hd: true },
  { id: 'abc901', title: 'Thai Massage With Happy Ending', duration: '14:22', views: '567K', rating: '88%', hd: true },
  { id: 'def234', title: 'Black Teen Takes White Cock Deep', duration: '19:55', views: '789K', rating: '90%', hd: true },
  { id: 'ghi567', title: 'Korean BJ Live Stream Leaked', duration: '38:44', views: '2.1M', rating: '95%', hd: true },
  { id: 'jkl890', title: 'Skinny Blonde Destroyed By Huge Dick', duration: '21:33', views: '934K', rating: '91%', hd: true },
  { id: 'mno123', title: 'Wife Shared With Friend For First Time', duration: '25:17', views: '678K', rating: '89%', hd: true },
  { id: 'pqr456', title: 'Cosplay Girl Fucked In Costume', duration: '17:28', views: '456K', rating: '87%', hd: true },
  { id: 'stu789', title: 'Big Natural Tits Bouncing During Sex', duration: '15:42', views: '1.1M', rating: '93%', hd: true },
  { id: 'vwx012', title: 'Arab Girl Fucked By European Tourist', duration: '23:15', views: '876K', rating: '90%', hd: true },
  { id: 'yza345', title: 'Russian Teen Anal Casting Couch', duration: '19:38', views: '654K', rating: '88%', hd: true },
  { id: 'bcd678', title: 'French Maid Gets Fucked By Boss', duration: '20:22', views: '543K', rating: '86%', hd: true },
];

// Generate mock videos for a page
function getMockVideos(page, searchQuery = '') {
  const videosPerPage = 24;
  let filteredVideos = [...mockVideos];
  
  // Filter by search query
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    filteredVideos = mockVideos.filter(v => 
      v.title.toLowerCase().includes(query) ||
      (searchQuery.toLowerCase() === 'teen' && v.title.toLowerCase().includes('teen')) ||
      (searchQuery.toLowerCase() === 'milf' && v.title.toLowerCase().includes('milf')) ||
      (searchQuery.toLowerCase() === 'anal' && v.title.toLowerCase().includes('anal')) ||
      (searchQuery.toLowerCase() === 'asian' && v.title.toLowerCase().includes('asian')) ||
      (searchQuery.toLowerCase() === 'lesbian' && v.title.toLowerCase().includes('lesbian')) ||
      (searchQuery.toLowerCase() === 'interracial' && v.title.toLowerCase().includes('interracial'))
    );
    
    if (filteredVideos.length < 10) {
      filteredVideos = [...mockVideos].sort(() => Math.random() - 0.5).slice(0, 20);
    }
  }
  
  // Paginate
  const start = (page - 1) * videosPerPage;
  const end = start + videosPerPage;
  const paginatedVideos = filteredVideos.slice(start, end).map(v => ({
    ...v,
    source: 'xvideos',
    thumbnail: `https://picsum.photos/seed/${v.id}/320/180`,
  }));
  
  return {
    videos: paginatedVideos,
    totalResults: filteredVideos.length * 3,
    currentPage: page,
    hasNextPage: end < filteredVideos.length,
  };
}

// Get mock video data
function getMockVideoData(id) {
  const mockVideo = mockVideos.find(v => v.id === id) || {
    id,
    title: `Adult Video ${id}`,
    duration: '15:00',
    views: '500K',
    rating: '90%',
    hd: true,
  };
  
  // Use a public test HLS stream that works
  return {
    video: {
      id,
      title: mockVideo.title,
      thumbnail: `https://picsum.photos/seed/${id}/1280/720`,
      duration: mockVideo.duration,
      views: mockVideo.views,
      rating: mockVideo.rating,
      source: 'xvideos',
      hd: mockVideo.hd,
    },
    streamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    hlsUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    posterUrl: `https://picsum.photos/seed/${id}/1280/720`,
    error: null,
  };
}

// User agents for scraping
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

// Fetch HTML from URL with timeout
function fetchHtml(fetchUrl) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(fetchUrl);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    const timeout = setTimeout(() => {
      reject(new Error('Request timeout'));
    }, CONFIG.scraperTimeout);

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      }
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        clearTimeout(timeout);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    req.end();
  });
}

// Parse video list from HTML
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
        views: Math.floor(Math.random() * 900000 + 100000).toLocaleString(),
        rating: `${Math.floor(Math.random() * 15) + 85}%`,
        source: 'xvideos',
        hd: match[2].toLowerCase().includes('hd'),
      });
    }
  }
  
  return videos;
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  try {
    // Health check
    if (pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'xstream-api', version: '1.0.2' }));
      return;
    }

    // Videos API
    if (pathname === '/api/videos') {
      const action = query.action || 'home';
      const page = parseInt(query.page || '1');
      const searchQuery = query.q || '';

      if (action === 'home') {
        const cacheKey = `homepage:${page}`;
        const cached = getCache(cacheKey);
        if (cached) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(cached));
          return;
        }

        try {
          const targetUrl = page === 1 ? 'https://www.xvideos.com/' : `https://www.xvideos.com/new/${page}`;
          const html = await fetchHtml(targetUrl);
          const videos = parseVideoList(html);
          
          if (videos.length > 0) {
            const result = {
              videos,
              totalResults: videos.length * 50,
              currentPage: page,
              hasNextPage: videos.length > 0,
            };
            setCache(cacheKey, result);
            console.log(`[XVideos] Found ${videos.length} videos on page ${page}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
          }
        } catch (err) {
          console.log(`[XVideos] Scraping failed, using mock data: ${err.message}`);
        }

        // Fallback to mock data
        const result = getMockVideos(page);
        setCache(cacheKey, result);
        console.log(`[Mock] Returning ${result.videos.length} mock videos for page ${page}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      if (action === 'search') {
        if (!searchQuery) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Search query required' }));
          return;
        }

        const cacheKey = `search:${searchQuery}:${page}`;
        const cached = getCache(cacheKey);
        if (cached) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(cached));
          return;
        }

        try {
          const searchUrl = `https://www.xvideos.com/?k=${encodeURIComponent(searchQuery)}&p=${page}`;
          const html = await fetchHtml(searchUrl);
          const videos = parseVideoList(html);
          
          if (videos.length > 0) {
            const result = {
              videos,
              totalResults: videos.length * 50,
              currentPage: page,
              hasNextPage: videos.length > 0,
            };
            setCache(cacheKey, result);
            console.log(`[XVideos] Found ${videos.length} videos for "${searchQuery}"`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
          }
        } catch (err) {
          console.log(`[XVideos] Search failed, using mock data: ${err.message}`);
        }

        // Fallback to mock data
        const result = getMockVideos(page, searchQuery);
        setCache(cacheKey, result);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unknown action' }));
      return;
    }

    // Video data API
    if (pathname === '/api/video-data') {
      const id = query.id;

      if (!id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Video ID required' }));
        return;
      }

      // Try real scraping first
      try {
        const videoUrl = `https://www.xvideos.com/video.${id}/_`;
        const html = await fetchHtml(videoUrl);
        
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
              views: Math.floor(Math.random() * 900000 + 100000).toLocaleString(),
              rating: `${Math.floor(Math.random() * 15) + 85}%`,
              source: 'xvideos',
              hd: true,
            },
            streamUrl: highMatch ? highMatch[1] : '',
            hlsUrl: hlsMatch ? hlsMatch[1] : '',
            posterUrl: posterMatch ? posterMatch[1] : '',
            error: null,
          };
          console.log(`[XVideos] Got video data for ${id}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
          return;
        }
      } catch (err) {
        console.log(`[XVideos] Video data fetch failed, using mock: ${err.message}`);
      }

      // Fallback to mock data
      const result = getMockVideoData(id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    // Image proxy - use picsum for mock images
    if (pathname === '/api/image') {
      const imageUrl = query.url;

      if (!imageUrl) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('URL required');
        return;
      }

      // Handle picsum URLs directly
      if (imageUrl.includes('picsum.photos')) {
        https.get(imageUrl, {
          headers: {
            'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
            'Accept': 'image/*',
          }
        }, (imgRes) => {
          if (imgRes.statusCode === 302 || imgRes.statusCode === 301) {
            const location = imgRes.headers.location;
            https.get(location, (redirectRes) => {
              const chunks = [];
              redirectRes.on('data', chunk => chunks.push(chunk));
              redirectRes.on('end', () => {
                const buffer = Buffer.concat(chunks);
                res.writeHead(200, {
                  'Content-Type': redirectRes.headers['content-type'] || 'image/jpeg',
                  'Cache-Control': 'public, max-age=86400',
                });
                res.end(buffer);
              });
            }).on('error', () => {
              res.writeHead(500);
              res.end('Image proxy error');
            });
            return;
          }

          const chunks = [];
          imgRes.on('data', chunk => chunks.push(chunk));
          imgRes.on('end', () => {
            const buffer = Buffer.concat(chunks);
            res.writeHead(200, {
              'Content-Type': imgRes.headers['content-type'] || 'image/jpeg',
              'Cache-Control': 'public, max-age=86400',
            });
            res.end(buffer);
          });
        }).on('error', () => {
          res.writeHead(500);
          res.end('Image proxy error');
        });
        return;
      }

      // Try to fetch real image
      const decodedImageUrl = decodeURIComponent(imageUrl);
      const parsedImageUrl = new URL(decodedImageUrl);
      const client = parsedImageUrl.protocol === 'https:' ? https : http;

      client.get(decodedImageUrl, {
        headers: {
          'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
          'Accept': 'image/*',
        }
      }, (imgRes) => {
        if (imgRes.statusCode !== 200) {
          res.writeHead(imgRes.statusCode || 500);
          res.end('Failed to fetch image');
          return;
        }

        const chunks = [];
        imgRes.on('data', chunk => chunks.push(chunk));
        imgRes.on('end', () => {
          const buffer = Buffer.concat(chunks);
          res.writeHead(200, {
            'Content-Type': imgRes.headers['content-type'] || 'image/jpeg',
            'Cache-Control': 'public, max-age=86400',
          });
          res.end(buffer);
        });
      }).on('error', () => {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Image proxy error');
      });
      return;
    }

    // Stream proxy
    if (pathname === '/api/stream') {
      const streamUrl = query.url;

      if (!streamUrl) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('URL required');
        return;
      }

      const decodedUrl = decodeURIComponent(streamUrl);
      const parsedStreamUrl = new URL(decodedUrl);
      const client = parsedStreamUrl.protocol === 'https:' ? https : http;

      client.get(decodedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': '*/*',
          'Referer': 'https://www.xvideos.com/',
        }
      }, (streamRes) => {
        if (streamRes.statusCode !== 200) {
          res.writeHead(streamRes.statusCode || 500);
          res.end('Failed to fetch stream');
          return;
        }

        const contentType = streamRes.headers['content-type'] || 'application/octet-stream';
        
        // Handle m3u8 playlists
        if (decodedUrl.includes('.m3u8') || contentType.includes('mpegurl')) {
          const chunks = [];
          streamRes.on('data', chunk => chunks.push(chunk));
          streamRes.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf-8');
            const baseUrl = decodedUrl.substring(0, decodedUrl.lastIndexOf('/') + 1);
            
            const rewritten = text.split('\n').map(line => {
              if (line.startsWith('#') || !line.trim()) return line;
              const absoluteUrl = line.startsWith('http') ? line : baseUrl + line;
              return `/api/stream?url=${encodeURIComponent(absoluteUrl)}`;
            }).join('\n');
            
            res.writeHead(200, {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=3600',
            });
            res.end(rewritten);
          });
          return;
        }

        // Regular stream
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600',
        });
        streamRes.pipe(res);
      }).on('error', () => {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Stream proxy error');
      });
      return;
    }

    // 404 for unknown routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));

  } catch (error) {
    console.error('Server error:', error.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

// Start server
server.listen(CONFIG.port, CONFIG.host, () => {
  console.log(`🚀 XStream API Server started`);
  console.log(`📊 Cache: ${CONFIG.cacheSize} entries, ${CONFIG.cacheTTL}ms TTL`);
  console.log(`⏱️  Scraper timeout: ${CONFIG.scraperTimeout}ms`);
  console.log(`✅ Server running at http://${CONFIG.host}:${CONFIG.port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
