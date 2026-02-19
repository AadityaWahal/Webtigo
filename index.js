const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises; // Use native fs promises
const fsSync = require('fs');      // Use native sync fs for ensuring dirs
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const QRCode = require('qrcode');
const gTTS = require('gtts');
const { PDFDocument } = require('pdf-lib');
const AdmZip = require('adm-zip');
const { convertPdfToImages } = require('./utils/pdf-converter');
// Load environment variables (Prioritize .env.local)
const resultLocal = require('dotenv').config({ path: '.env.local' });
if (resultLocal.error) {
    console.log("⚠️ .env.local not found, trying default .env");
    require('dotenv').config();
} else {
    console.log("✅ Loaded config from .env.local");
}

// Debugging: Log if keys are missing (without revealing secrets)
// Vercel might not have the file, so checking process.env is crucial
if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !process.env.CLERK_PUBLISHABLE_KEY) {
    console.error("❌ ERROR: Clerk Publishable Key is missing! Check Vercel Environment Variables or .env.local");
} else {
    console.log("✅ Clerk Configuration Loaded");
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// Explicit absolute path for static files
app.use(express.static(path.join(__dirname, 'public')));


// Templating Engine (Next.js-style)
app.use(expressLayouts);
// Explicit absolute path for views
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.set('layout', './layout'); // looks for views/layout.ejs

const os = require('os');
// File Upload Config (Memory storage for Serverless robustness)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit per file
});

// ... (skip lines)

// 6. Img to PDF
app.post('/api/images-to-pdf', (req, res, next) => {
    upload.array('images', 50)(req, res, (err) => {
        if (err) {
            console.error("Multer Error:", err);
            return res.status(400).send("File Upload Error: " + err.message);
        }
        next();
    });
}, async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).send('No images uploaded');
        }

        const pdfDoc = await PDFDocument.create();

        for (const file of req.files) {
            let image;
            // Embed based on mimetype using buffer directly
            try {
                if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/jpg') {
                    image = await pdfDoc.embedJpg(file.buffer);
                } else if (file.mimetype === 'image/png') {
                    image = await pdfDoc.embedPng(file.buffer);
                } else {
                    continue;
                }
            } catch (embedError) {
                console.error(`Failed to embed image ${file.originalname}:`, embedError);
                continue;
            }

            const { width, height } = image.scale(1);
            const page = pdfDoc.addPage([width, height]);
            page.drawImage(image, {
                x: 0,
                y: 0,
                width: width,
                height: height,
            });
        }

        const pdfBytes = await pdfDoc.save();
        const filename = `converted_${uuidv4()}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(Buffer.from(pdfBytes));
    } catch (err) {
        fsSync.appendFileSync('debug_crash.log', `[${new Date().toISOString()}] ERROR: ${err.stack}\n`);
        console.error("Images-to-PDF Failed:", err);
        console.error(err.stack);
        res.status(500).send('Conversion Failed: ' + err.message);
    }
});

// 7. PDF to Images
app.post('/api/pdf-to-images', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).send('No PDF uploaded');

        // Retrieve the PDF file data
        const pdfBuffer = req.file.buffer; // Use buffer directly from memory storage

        // Convert the PDF to images (returns an array of Buffers)
        const outputImages = await convertPdfToImages(pdfBuffer);

        const zip = new AdmZip();

        // Add each image to the ZIP file
        outputImages.forEach((imageBuffer, index) => {
            zip.addFile(`page_${index + 1}.png`, imageBuffer);
        });

        const zipBuffer = zip.toBuffer();
        const filename = `extracted_images_${uuidv4()}.zip`;

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(zipBuffer);

        // No need to remove req.file.path as it's memory storage
        // await safeRemove(req.file.path);

    } catch (err) {
        fsSync.appendFileSync('debug_crash.log', `[${new Date().toISOString()}] PDF2IMG ERROR: ${err.stack}\n`);
        console.error("PDF-to-Image Error:", err);
        res.status(500).send('Extraction Failed: ' + err.message);
    }
});

// 5. Sitemap
app.get('/sitemap.xml', (req, res) => {
    const pages = [
        '/',
        '/signin',
        '/tts',
        '/compressor',
        '/qrcode',
        '/resizer',
        '/frequency',
        '/case-converter',
        '/images-to-pdf',
        '/pdf-to-images'
    ];

    const baseUrl = 'https://' + (req.get('host') || 'webtigo.vercel.app');

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        ${pages.map(page => `
            <url>
                <loc>${baseUrl}${page}</loc>
                <changefreq>weekly</changefreq>
                <priority>${page === '/' ? '1.0' : '0.8'}</priority>
            </url>
        `).join('')}
    </urlset>`;

    res.header('Content-Type', 'application/xml');
    res.send(sitemap);
});

app.listen(PORT, () => console.log(`Available on http://localhost:${PORT}`));

module.exports = app;
