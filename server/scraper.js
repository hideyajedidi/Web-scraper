const { firefox } = require('playwright');
const path = require('path');
const { randomDelay, getRandomViewport, humanScroll } = require('./stealth-utils');

// Persistent profile directory — cookies & sessions survive across runs
const PROFILE_DIR = path.join(__dirname, '.firefox-profile');

// Firefox-specific user agent (using Chrome UAs on Firefox is a detection flag)
const FIREFOX_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0';

async function scrapeGoogleMaps(query, location, limit = 20, onProgress) {
    const browser = await firefox.launchPersistentContext(PROFILE_DIR, {
        headless: false,
        viewport: getRandomViewport(),
        userAgent: FIREFOX_UA,
        locale: 'en-US',
        firefoxUserPrefs: {
            'dom.webdriver.enabled': false,
            'useAutomationExtension': false,
        }
    });

    const page = await browser.newPage();

    // Patch navigator.webdriver to be undefined (anti-detection)
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    let results = [];
    try {
        const fullQuery = `${query} in ${location}`;
        const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(fullQuery)}`;

        console.log(`Searching Maps: ${searchUrl}`);
        await page.goto(searchUrl);
        await randomDelay(3000, 6000); // Longer initial wait

        // If Google asks for consent/cookies, try to accept
        try {
            const acceptBtn = page.locator('button:has-text("Accept all"), button:has-text("Tout accepter"), button:has-text("I agree")').first();
            if (await acceptBtn.isVisible({ timeout: 3000 })) {
                await acceptBtn.click();
                await randomDelay(2000, 3000);
            }
        } catch (e) { /* No consent screen */ }

        try {
            await page.waitForSelector('div[role="feed"]', { timeout: 15000 });
        } catch (e) {
            console.log("Feed not found — may need manual CAPTCHA. Waiting 30s...");
            // Give user time to solve CAPTCHA manually if it appears
            await randomDelay(30000, 30000);
            try {
                await page.waitForSelector('div[role="feed"]', { timeout: 15000 });
            } catch (e2) {
                throw new Error("Could not load Google Maps results. Please solve the CAPTCHA in the Firefox window and try again.");
            }
        }

        let previousCount = 0;
        let scrollAttempts = 0;

        while (results.length < limit && scrollAttempts < 15) {
            const items = await page.locator('div[role="article"]').all();

            for (const item of items) {
                if (results.length >= limit) break;

                const nameElement = item.locator('div.fontHeadlineSmall');
                const name = await nameElement.innerText().catch(() => '');
                if (!name || results.find(r => r.name === name)) continue;

                const textContent = await item.innerText();
                const phoneRegex = /\+?[\s\d]{10,}/;
                const phoneMatch = textContent.match(phoneRegex);
                const phone = phoneMatch ? phoneMatch[0].trim() : 'N/A';

                // Robust website discovery
                let website = 'N/A';
                const siteLink = item.locator('a[data-item-id="authority"]');
                if (await siteLink.count() > 0) {
                    website = await siteLink.getAttribute('href');
                }

                const result = {
                    name,
                    phone,
                    website,
                    email: 'Pending...',
                    linkedin: 'Pending...',
                    linkedin_bio: 'N/A'
                };

                results.push(result);
                if (onProgress) onProgress(result);
            }

            if (results.length >= limit) break;

            const feed = page.locator('div[role="feed"]').first();
            await page.evaluate((el) => { if (el) el.scrollTop += (300 + Math.random() * 400); }, await feed.elementHandle());
            await randomDelay(2000, 4000);

            const currentCount = (await page.locator('div[role="article"]').all()).length;
            if (currentCount === previousCount) scrollAttempts++;
            else scrollAttempts = 0;
            previousCount = currentCount;
        }

        console.log(`\nCollected ${results.length} leads from Maps. Starting deep research (1 at a time)...\n`);

        // ====== DEEP RESEARCH — Sequential, same context, same cookies ======
        // Reuse a SINGLE page for all research (no new contexts = no new fingerprints)
        const researchPage = await browser.newPage();
        await researchPage.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        for (let i = 0; i < results.length; i++) {
            const item = results[i];
            console.log(`[${i + 1}/${results.length}] Researching: ${item.name}`);

            try {
                // 1. Find Website if missing
                if (item.website === 'N/A') {
                    await researchPage.goto(`https://www.google.com/search?q=${encodeURIComponent(item.name + ' official website')}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
                    await randomDelay(2000, 5000);
                    const firstResult = researchPage.locator('#search a').first();
                    item.website = await firstResult.getAttribute('href').catch(() => 'N/A');
                }

                // 2. Extract Email from Website
                if (item.website !== 'N/A' && !item.website.includes('google.com')) {
                    item.email = await extractEmailFromWebsite(item.website, researchPage);
                } else {
                    item.email = 'N/A';
                }

                // Human-like pause between website visit and LinkedIn search
                await randomDelay(3000, 6000);

                // 3. Find LinkedIn
                await researchPage.goto(`https://www.google.com/search?q=${encodeURIComponent('site:linkedin.com/company ' + item.name)}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
                await randomDelay(2500, 5000);
                const linkedinResult = researchPage.locator('#search a[href*="linkedin.com/company"]').first();
                if (await linkedinResult.count() > 0) {
                    item.linkedin = await linkedinResult.getAttribute('href');
                    const snippet = researchPage.locator('#search div.VwiC3b').first();
                    item.linkedin_bio = await snippet.innerText().catch(() => 'N/A');
                } else {
                    item.linkedin = 'N/A';
                }

                if (onProgress) onProgress(item);

            } catch (e) {
                console.error(`  Research error for ${item.name}:`, e.message);
                if (item.email === 'Pending...') item.email = 'N/A';
                if (item.linkedin === 'Pending...') item.linkedin = 'N/A';
                if (onProgress) onProgress(item);
            }

            // Random pause between leads (3-8 seconds) — looks human
            if (i < results.length - 1) {
                const pause = 3000 + Math.random() * 5000;
                console.log(`  Pausing ${(pause / 1000).toFixed(1)}s before next lead...`);
                await randomDelay(pause, pause + 500);
            }

            // Every ~10 leads, take a longer break (15-25s) to avoid rate limits
            if ((i + 1) % 10 === 0 && i < results.length - 1) {
                const longPause = 15000 + Math.random() * 10000;
                console.log(`\n  ☕ Long break: ${(longPause / 1000).toFixed(0)}s after ${i + 1} leads...\n`);
                await randomDelay(longPause, longPause + 1000);
            }
        }

        await researchPage.close();
        return results;
    } catch (error) {
        console.error('Scraping failed:', error);
        throw error;
    } finally {
        await page.close();
        // DON'T close browser context — keep the profile/cookies alive for next run
        await browser.close();
    }
}

async function extractEmailFromWebsite(url, researchPage) {
    // Navigate in the same page instead of opening a new one
    try {
        await researchPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await randomDelay(1500, 3000);
        await humanScroll(researchPage);

        const content = await researchPage.content();
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const emails = content.match(emailRegex);

        // Filter out common false positives
        const filtered = emails
            ? Array.from(new Set(emails)).filter(e =>
                !e.includes('example.com') &&
                !e.includes('sentry.io') &&
                !e.includes('webpack') &&
                !e.endsWith('.png') &&
                !e.endsWith('.jpg')
            )
            : [];

        return filtered.length > 0 ? filtered[0] : 'Not Found';
    } catch (e) {
        return 'N/A';
    }
}

module.exports = { scrapeGoogleMaps };
