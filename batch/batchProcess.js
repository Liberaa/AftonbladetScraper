const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const ID_FILE = path.join(__dirname, 'scrape.txt');
const OUTPUT_FILE = path.join(__dirname, 'ai_results.json');

async function getArticleURLs() {
    const content = fs.readFileSync(ID_FILE, 'utf-8');
    const urls = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && line.includes('/a/'));
    console.log(`📁 Found ${urls.length} valid article URLs.`);
    return urls;
}

async function getArticleContent(url) {
    const scrapeUrl = `${BASE_URL}/scrape2?url=${encodeURIComponent(url)}`;
    console.log(`🔗 Fetching article from: ${scrapeUrl}`);

    try {
        const res = await axios.get(scrapeUrl, { timeout: 900000 }); // 15 min timeout
        const text = res.data;
        console.log(`📝 Fetched ${text.length} characters`);
        return text;
    } catch (err) {
        console.error(`❌ Error scraping ${url}: ${err.message}`);
        return null;
    }
}

async function analyzeContent(text) {
    if (typeof text !== 'string' || text.trim().length < 50) {
        console.warn(`⚠️ Skipping analysis: input is not a valid string (length = ${text?.length || 'N/A'})`);
        return null;
    }

    console.log(`🤖 Analyzing content (${text.length} chars)...`);

    try {
        const res = await axios.post(`${BASE_URL}/analyze`, text, {
            headers: { 'Content-Type': 'text/plain' },
            timeout: 900000,
        });

        if (res.data?.score !== undefined) {
            console.log(`✅ Analysis complete: Score = ${res.data.score}, AI = ${res.data.ai_generated}`);
        } else {
            console.warn('⚠️ No score returned from DetectGPT.');
        }

        return res.data;
    } catch (err) {
        console.error(`❌ DetectGPT error: ${err.message}`);
        return null;
    }
}


(async () => {
    const urls = await getArticleURLs();
    console.log(`🔍 Starting batch analysis of ${urls.length} articles...`);

    const results = [];

    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        console.log(`\n📄 (${i + 1}/${urls.length}) Processing: ${url}`);

        const content = await getArticleContent(url);

        if (!content) {
            console.warn(`⚠️ Skipping due to missing content.`);
            continue;
        }

        if (content.startsWith('❌')) {
            console.warn(`⚠️ Skipping due to scrape failure: ${content}`);
            continue;
        }

        if (content.length < 100) {
            console.warn(`⚠️ Skipping due to short content (${content.length} chars)`);
            continue;
        }

        const analysis = await analyzeContent(content);

        if (!analysis || analysis.error) {
            console.warn(`⚠️ Skipping due to DetectGPT error or invalid result`);
            continue;
        }

        results.push({
            url,
            score: analysis.score,
            ai_generated: analysis.ai_generated,
        });

        // Save progress regularly
        if ((i + 1) % 25 === 0 || i === urls.length - 1) {
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
            console.log(`💾 Saved progress at ${i + 1} articles.`);
        }
    }

    console.log(`\n✅ Done! Processed ${results.length} articles.`);
    console.log(`📂 Results saved to: ${OUTPUT_FILE}`);
})();
