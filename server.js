const express = require('express');
const path = require('path');
const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const scrapeAllPaginatedArticles = require('./scraper');

const app = express();
const PORT = 3000;

// Needed to parse plain text for /analyze
app.use(express.text({ limit: '2mb' }));

// 🔍 DetectGPT integration
function detectWithDetectGPT(text) {
    return new Promise((resolve, reject) => {
        const python = spawn('python', ['DetectGPT/detect_wrapper.py']); // Adjust path if needed

        let output = '';
        let error = '';

        python.stdout.on('data', data => {
            output += data.toString();
        });

        python.stderr.on('data', data => {
            error += data.toString();
        });

        python.on('close', code => {
            if (code === 0) {
                try {
                    resolve(JSON.parse(output));
                } catch {
                    reject(new Error('Failed to parse DetectGPT output.'));
                }
            } else {
                reject(new Error(`DetectGPT failed: ${error}`));
            }
        });

        python.stdin.write(text);
        python.stdin.end();
    });
}

// 🕷️ Scrape article links
app.get('/scrape', async (req, res) => {
    const pageCount = parseInt(req.query.pages) || 383;

    try {
        console.log(`🕷️ Scraping up to ${pageCount} pages from Aftonbladet...`);
        const results = await scrapeAllPaginatedArticles(pageCount);

        const links = results.map(item => `https://www.aftonbladet.se/nyheter/a/${item.id}`).join('\n');
        res.set('Content-Type', 'text/plain');
        res.send(links);
    } catch (err) {
        console.error('❌ Scraping error:', err);
        res.status(500).send('Scraping failed.');
    }
});

// 📰 Scrape individual article content
app.get('/scrape2', async (req, res) => {
    const articleUrl = req.query.url;

    if (!articleUrl || !articleUrl.includes('/a/')) {
        return res.status(400).send('Please provide a valid Aftonbladet article URL using ?url=...');
    }

    const articleIDMatch = articleUrl.match(/\/a\/([a-zA-Z0-9]{6})/);
    if (!articleIDMatch) {
        return res.status(400).send('Invalid URL format – couldn’t extract article ID.');
    }

    const articleID = articleIDMatch[1];
    const wrapperClass = `article-wrapper-${articleID}`;

    let browser;
    try {
       browser = await puppeteer.launch({
    headless: true,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-features=FirstPartySets',
    ],
});


        const page = await browser.newPage();
        await page.goto(articleUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        const content = await page.evaluate(wrapperClass => {
            const wrapper = document.querySelector(`article.${wrapperClass}`);
            if (!wrapper) return '❌ Could not find article wrapper.';

            const headers = Array.from(wrapper.querySelectorAll('h1')).map(el => el.innerText.trim());
            const paragraphs = Array.from(wrapper.querySelectorAll('p')).map(el => el.innerText.trim());

            return [...headers, '', ...paragraphs].join('\n');
        }, wrapperClass);

        res.set('Content-Type', 'text/plain');
        res.send(content);

    } catch (err) {
        console.error('❌ Scrape2 error:', err);
        res.status(500).send('Failed to extract article content.');
    } finally {
        if (browser) await browser.close();
    }
});

// 🤖 AI detection endpoint using DetectGPT
app.post('/analyze', async (req, res) => {
    const text = req.body;
    console.log(`🧠 Analyze route hit. Length: ${text?.length}, Type: ${typeof text}`);

    if (!text || text.length < 100) {
        console.warn('⚠️ Text too short or missing.');
        return res.status(400).send('Text too short or missing.');
    }

    try {
        const result = await detectWithDetectGPT(text);
        console.log('🧠 DetectGPT returned:', result);
        res.json(result);
    } catch (err) {
        console.error('❌ Detection error:', err.message);
        res.status(500).send('AI detection failed.');
    }
});


// 🧠 Optional: GET fallback for /analyze (browser-friendly)
app.get('/analyze', (req, res) => {
    res.send(`
        <h2>🚫 This endpoint only supports POST requests.</h2>
        <p>To use it, send a POST request with raw text in the body:</p>
        <code>curl -X POST http://localhost:3000/analyze -H "Content-Type: text/plain" --data "your article here"</code>
    `);
});


// 🚀 Start the server
app.listen(PORT, () => {
    console.log(`🚀 Server is running at http://localhost:${PORT}`);
});
