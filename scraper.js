const puppeteer = require('puppeteer');
const path = require('path');

function base62ToBase10(str) {
    const charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    return str.split('').reduce((acc, char) => acc * 62 + charset.indexOf(char), 0);
}

async function scrapeArticleIDsFromPage(page, pageId) {
    const url = `https://www.aftonbladet.se/nyheter?pageId=${pageId}`;
    console.log(`🔍 Visiting: ${url}`);
    await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 60000
    });

    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 1000)));

    const ids = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href]'));
        const idSet = new Set();
        links.forEach(link => {
            const href = link.href;
            const match = href.match(/\/a\/([a-zA-Z0-9]{6})\//);
            if (match) {
                idSet.add(match[1]);
            }
        });
        return Array.from(idSet);
    });

    return ids;
}

async function scrapeAllPaginatedArticles(maxPages = 100) {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--disable-features=FirstPartySets'],
        userDataDir: path.join(__dirname, 'tmp-profile'),
    });

    const page = await browser.newPage();

    const seen = new Set();
    const results = [];

    for (let pageId = 1; pageId <= maxPages; pageId++) {
        const ids = await scrapeArticleIDsFromPage(page, pageId);

        if (ids.length === 0) {
            console.log(`🛑 No articles found on page ${pageId}, stopping.`);
            break;
        }

        let newCount = 0;
        ids.forEach(id => {
            if (!seen.has(id)) {
                seen.add(id);
                results.push({ id, base10: base62ToBase10(id) });
                newCount++;
            }
        });

        console.log(`✅ Page ${pageId}: ${newCount} new IDs found (${results.length} total)`);

        if (newCount === 0) {
            console.log(`🛑 No new IDs found on page ${pageId}, ending early.`);
            break;
        }
    }

    await browser.close();
    return results;
}

module.exports = scrapeAllPaginatedArticles;
