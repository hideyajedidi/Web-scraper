const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { scrapeGoogleMaps } = require('./scraper');
const path = require('path');
const fs = require('fs');
const { createObjectCsvWriter } = require('csv-writer');
const XLSX = require('xlsx');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 5000;

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('start-scrape', async (data) => {
        const { query, location, limit } = data;
        console.log(`Starting scrape for ${query} in ${location} (limit: ${limit})`);
        
        try {
            const results = await scrapeGoogleMaps(query, location, limit, (progressData) => {
                socket.emit('scrape-progress', progressData);
            });
            
            socket.emit('scrape-complete', results);
            
            // Save to JSON for later download
            const fileName = `results_${Date.now()}.json`;
            const dataDir = path.join(__dirname, 'data');
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
            fs.writeFileSync(path.join(dataDir, fileName), JSON.stringify(results, null, 2));
            
        } catch (error) {
            socket.emit('scrape-error', error.message);
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// Endpoint for CSV export
app.post('/export-csv', async (req, res) => {
    const { data } = req.body;
    if (!data || !Array.isArray(data)) return res.status(400).send('No data provided');

    const filePath = path.join(__dirname, 'data', `export_${Date.now()}.csv`);
    
    // Ensure data directory exists
    if (!fs.existsSync(path.join(__dirname, 'data'))) {
        fs.mkdirSync(path.join(__dirname, 'data'));
    }

    const csvWriter = createObjectCsvWriter({
        path: filePath,
        header: [
            { id: 'name', title: 'NAME' },
            { id: 'phone', title: 'PHONE' },
            { id: 'website', title: 'WEBSITE' },
            { id: 'email', title: 'EMAIL' },
            { id: 'linkedin', title: 'LINKEDIN' },
            { id: 'linkedin_bio', title: 'LINKEDIN_BIO' },
        ]
    });

    await csvWriter.writeRecords(data);
    res.download(filePath);
});

// Endpoint for XLSX export
app.post('/export-xlsx', async (req, res) => {
    const { data } = req.body;
    if (!data || !Array.isArray(data)) return res.status(400).send('No data provided');

    try {
        const filePath = path.join(__dirname, 'data', `export_${Date.now()}.xlsx`);
        
        // Ensure data directory exists
        if (!fs.existsSync(path.join(__dirname, 'data'))) {
            fs.mkdirSync(path.join(__dirname, 'data'));
        }

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Scraped Data");
        
        XLSX.writeFile(workbook, filePath);
        res.download(filePath);
    } catch (error) {
        console.error('XLSX Export failed:', error);
        res.status(500).send('Export failed');
    }
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    // Create data directory
    if (!fs.existsSync(path.join(__dirname, 'data'))) {
        fs.mkdirSync(path.join(__dirname, 'data'));
    }
});
