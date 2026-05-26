const cluster = require('cluster');
const os = require('os');
const http = require('http');
const https = require('https');
const url = require('url');

// Configuration
const CONFIG = {
    port: parseInt(process.env.PORT || '3001'),
    host: process.env.HOST || '0.0.0.0',
    cacheSize: 2000, // Doubled cache size since you have 16GB RAM
    cacheTTL: 300000, // 5 minutes
    scraperTimeout: 20000,
};

// ==========================================
// MASTER PROCESS: Handles CPU Clustering
// ==========================================
const isPrimary = cluster.isPrimary || cluster.isMaster; // Support for all Node versions

if (isPrimary) {
    const numCPUs = os.cpus().length;

    console.log(`🚀 XStream Master Process started (PID: ${process.pid})`);
    console.log(`💻 Detected ${numCPUs} CPU cores. Booting up workers for maximum parallelism...`);

    // Fork workers for each CPU core
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    // Auto-heal: If a worker dies, restart it immediately
    cluster.on('exit', (worker, code, signal) => {
        console.log(`⚠️ Worker ${worker.process.pid} died (Code: ${code}, Signal: ${signal}). Restarting...`);
        cluster.fork();
    });

} else {
    // ==========================================
    // WORKER PROCESS: Handles Actual Requests
    // ==========================================

    // High-performance Keep-Alive Agents to eliminate SSL handshake latency
    const httpAgent = new http.Agent({ keepAlive: true, maxSockets: Infinity });
    const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: Infinity });

    // In-memory cache (Each worker has its own isolated cache in RAM)
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

    // User agents to bypass basic blocks
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    ];

    // Fetch HTML from URL with timeout and redirection handling
    function fetchHtml(fetchUrl) {
        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(fetchUrl);
            const isHttps = parsedUrl.protocol === 'https:';
            const client = isHttps ? https : http;

            const timeout = setTimeout(() => {
                reject(new Error('Request timeout'));
            }, CONFIG.scraperTimeout);

            const options = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (isHttps ? 443 : 80),
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'GET',
                agent: isHttps ? httpsAgent : httpAgent, // Use persistent connections
                headers: {
                    'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Cache-Control': 'no-cache',
                    'Referer': 'https://www.xvideos.com/',
                }
            };

            const req = client.request(options, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
                    clearTimeout(timeout);
                    return resolve(fetchHtml(url.resolve(fetchUrl, res.headers.location)));
                }

                let data = '';
                res.setEncoding('utf8');
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    clearTimeout(timeout);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(data);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode} on ${fetchUrl}`));
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

            // Safely extract the ID without assuming URL structure
            let videoId = '';
            const idMatchNum = href.match(/\/video([0-9]+)\//);
            const idMatchAlpha = href.match(/video\.([a-zA-Z0-9_-]+)/);

            if (idMatchNum) videoId = idMatchNum[1];
            else if (idMatchAlpha) videoId = idMatchAlpha[1];

            if (videoId) {
                let thumbUrl = match[3];
                if (thumbUrl.startsWith('//')) thumbUrl = 'https:' + thumbUrl;

                videos.push({
                    id: videoId,
                    title: match[2].replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"'),
                    thumbnail: thumbUrl,
                    duration: match[4].trim(),
                    views: Math.floor(Math.random() * 900000 + 100000).toLocaleString(),
                    rating: `${Math.floor(Math.random() * 15) + 85}%`,
                    source: 'xvideos',
                    hd: match[2].toLowerCase().includes('hd') || html.includes('hd-mark'),
                });
            }
        }

        // Shuffle array for randomness on the frontend
        for (let i = videos.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [videos[i], videos[j]] = [videos[j], videos[i]];
        }

        return videos;
    }

    // HTTP Server for this specific Worker
    const server = http.createServer(async (req, res) => {
        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname;
        const query = parsedUrl.query;

        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        try {
            if (pathname === '/') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: 'ok',
                    service: 'xstream-api-clustered',
                    version: '4.0.0',
                    worker_pid: process.pid
                }));
                return;
            }

            if (pathname === '/api/videos') {
                const action = query.action || 'home';
                const requestedPage = parseInt(query.page || '1');
                const searchQuery = query.q || '';

                if (action === 'home') {
                    try {
                        const randomPage = Math.floor(Math.random() * 200) + 1;
                        const targetUrl = `https://www.xvideos.com/new/${randomPage}`;

                        const html = await fetchHtml(targetUrl);
                        const videos = parseVideoList(html);

                        if (videos.length > 0) {
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({
                                videos,
                                totalResults: 10000,
                                currentPage: requestedPage,
                                hasNextPage: true,
                            }));
                            return;
                        } else {
                            throw new Error('No videos parsed from homepage HTML');
                        }
                    } catch (err) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Failed to fetch videos.' }));
                        return;
                    }
                }

                if (action === 'search') {
                    if (!searchQuery) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Search query required' }));
                        return;
                    }

                    const cacheKey = `search:${searchQuery}:${requestedPage}`;
                    const cached = getCache(cacheKey);
                    if (cached) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(cached));
                        return;
                    }

                    try {
                        const searchUrl = `https://www.xvideos.com/?k=${encodeURIComponent(searchQuery)}&p=${requestedPage}`;
                        const html = await fetchHtml(searchUrl);
                        const videos = parseVideoList(html);

                        if (videos.length > 0) {
                            const result = {
                                videos,
                                totalResults: videos.length * 50,
                                currentPage: requestedPage,
                                hasNextPage: videos.length > 0,
                            };
                            setCache(cacheKey, result);
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify(result));
                            return;
                        } else {
                            throw new Error('No results found');
                        }
                    } catch (err) {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'No videos found.' }));
                        return;
                    }
                }
            }

            // Bulletproof Video Data Extraction
            if (pathname === '/api/video-data') {
                const id = query.id;

                if (!id) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Video ID required' }));
                    return;
                }

                const cacheKey = `vid:${id}`;
                const cached = getCache(cacheKey);
                if (cached) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(cached));
                    return;
                }

                try {
                    const cleanId = id.replace(/[^0-9a-zA-Z_-]/g, '');
                    const isNumeric = /^[0-9]+$/.test(cleanId);
                    const videoPath = isNumeric ? `video${cleanId}` : `video.${cleanId}`;
                    const videoUrl = `https://www.xvideos.com/${videoPath}/_`;

                    const html = await fetchHtml(videoUrl);

                    const hlsMatch = html.match(/setVideoHLS\s*\(\s*['"]([^'"]+)['"]\s*\)/i);
                    const highMatch = html.match(/setVideoUrlHigh\s*\(\s*['"]([^'"]+)['"]\s*\)/i);
                    const lowMatch = html.match(/setVideoUrlLow\s*\(\s*['"]([^'"]+)['"]\s*\)/i);
                    const fbHlsMatch = html.match(/(https:\/\/[^'"]+\.m3u8[^'"]*)/i);
                    const fbMp4Match = html.match(/(https:\/\/[^'"]+\.mp4[^'"]*)/i);

                    const posterMatch = html.match(/setThumbUrl(?:169)?\s*\(\s*['"]([^'"]+)['"]\s*\)/i);
                    const titleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i) || html.match(/setVideoTitle\s*\(\s*['"]([^'"]+)['"]\s*\)/i);

                    let bestStream = '';
                    if (highMatch && highMatch[1]) bestStream = highMatch[1];
                    else if (fbMp4Match && fbMp4Match[1]) bestStream = fbMp4Match[1];
                    else if (lowMatch && lowMatch[1]) bestStream = lowMatch[1];

                    let bestHls = '';
                    if (hlsMatch && hlsMatch[1]) bestHls = hlsMatch[1];
                    else if (fbHlsMatch && fbHlsMatch[1]) bestHls = fbHlsMatch[1];
                    else bestHls = bestStream;

                    if (!bestStream && !bestHls) {
                        throw new Error("No video URLs found.");
                    }

                    const result = {
                        video: {
                            id,
                            title: titleMatch ? titleMatch[1].replace(/&amp;/g, '&').replace(/&#039;/g, "'") : `Video ${id}`,
                            thumbnail: posterMatch ? posterMatch[1] : '',
                            duration: '',
                            views: Math.floor(Math.random() * 2000000 + 100000).toLocaleString(),
                            rating: `${Math.floor(Math.random() * 15) + 85}%`,
                            source: 'xvideos',
                            hd: !!highMatch,
                        },
                        streamUrl: bestStream,
                        hlsUrl: bestHls,
                        posterUrl: posterMatch ? posterMatch[1] : '',
                        error: null,
                    };

                    setCache(cacheKey, result);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                    return;

                } catch (err) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Video stream not found', streamUrl: '', hlsUrl: '' }));
                    return;
                }
            }

            // High-Speed Proxy for thumbnails
            if (pathname === '/api/image') {
                const imageUrl = query.url;
                if (!imageUrl) return res.end('URL required');

                const decodedImageUrl = decodeURIComponent(imageUrl);
                const parsedImageUrl = new URL(decodedImageUrl);
                const isHttps = parsedImageUrl.protocol === 'https:';
                const client = isHttps ? https : http;

                client.get(decodedImageUrl, {
                    agent: isHttps ? httpsAgent : httpAgent,
                    headers: {
                        'User-Agent': userAgents[0],
                        'Referer': 'https://www.xvideos.com/',
                    }
                }, (imgRes) => {
                    res.writeHead(200, {
                        'Content-Type': imgRes.headers['content-type'] || 'image/jpeg',
                        'Cache-Control': 'public, max-age=86400',
                    });
                    imgRes.pipe(res);
                }).on('error', () => {
                    res.writeHead(500);
                    res.end('Image proxy error');
                });
                return;
            }

            // High-Speed Proxy for video streaming
            if (pathname === '/api/stream') {
                const streamUrl = query.url;
                if (!streamUrl) return res.end('URL required');

                const decodedUrl = decodeURIComponent(streamUrl);
                const parsedStreamUrl = new URL(decodedUrl);
                const isHttps = parsedStreamUrl.protocol === 'https:';
                const client = isHttps ? https : http;

                const fetchHeaders = {
                    'User-Agent': userAgents[0],
                    'Accept': '*/*',
                    'Referer': 'https://www.xvideos.com/',
                };

                if (req.headers.range) {
                    fetchHeaders['Range'] = req.headers.range;
                }

                client.get(decodedUrl, {
                    agent: isHttps ? httpsAgent : httpAgent,
                    headers: fetchHeaders
                }, (streamRes) => {
                    const contentType = streamRes.headers['content-type'] || 'application/octet-stream';

                    if (decodedUrl.includes('.m3u8') || contentType.includes('mpegurl')) {
                        let body = '';
                        streamRes.on('data', chunk => body += chunk);
                        streamRes.on('end', () => {
                            const baseUrl = decodedUrl.substring(0, decodedUrl.lastIndexOf('/') + 1);
                            const rewritten = body.split('\n').map(line => {
                                if (line.startsWith('#') || !line.trim()) return line;
                                const absoluteUrl = line.startsWith('http') ? line : baseUrl + line;
                                return `/api/stream?url=${encodeURIComponent(absoluteUrl)}`;
                            }).join('\n');

                            res.writeHead(200, {
                                'Content-Type': contentType,
                                'Access-Control-Allow-Origin': '*',
                            });
                            res.end(rewritten);
                        });
                        return;
                    }

                    const responseHeaders = {
                        'Content-Type': contentType,
                        'Access-Control-Allow-Origin': '*',
                        'Accept-Ranges': 'bytes'
                    };

                    if (streamRes.headers['content-length']) responseHeaders['Content-Length'] = streamRes.headers['content-length'];
                    if (streamRes.headers['content-range']) responseHeaders['Content-Range'] = streamRes.headers['content-range'];

                    res.writeHead(streamRes.statusCode || 200, responseHeaders);
                    streamRes.pipe(res);
                }).on('error', () => {
                    res.writeHead(500);
                    res.end('Stream proxy error');
                });
                return;
            }

            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Route not found' }));

        } catch (error) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Internal server error' }));
        }
    });

    server.listen(CONFIG.port, CONFIG.host, () => {
        console.log(`✅ Worker ${process.pid} is online and ready.`);
    });
}
