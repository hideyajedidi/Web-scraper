const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/119.0.0.0",
];

const randomDelay = (min = 1000, max = 3000) => {
    const delay = Math.floor(Math.random() * (max - min + 1) + min);
    return new Promise(resolve => setTimeout(resolve, delay));
};

const getRandomUA = () => userAgents[Math.floor(Math.random() * userAgents.length)];

const getRandomViewport = () => {
    const widths = [1366, 1440, 1536, 1920];
    const heights = [768, 900, 864, 1080];
    const idx = Math.floor(Math.random() * widths.length);
    return { width: widths[idx], height: heights[idx] };
};

async function humanScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            let distance = 100;
            let timer = setInterval(() => {
                let scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                if (totalHeight >= scrollHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 100 + Math.random() * 200);
        });
    });
}

// Simple Semaphore for concurrency control
class Semaphore {
    constructor(max) {
        this.max = max;
        this.running = 0;
        this.queue = [];
    }

    async acquire() {
        if (this.running < this.max) {
            this.running++;
            return;
        }
        return new Promise(resolve => this.queue.push(resolve));
    }

    release() {
        this.running--;
        if (this.queue.length > 0) {
            const next = this.queue.shift();
            this.running++;
            next();
        }
    }
}

module.exports = { randomDelay, getRandomUA, getRandomViewport, humanScroll, Semaphore };
