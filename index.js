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
// Load environment variables (try .env.local first, then .env)
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// Explicit absolute path for static files
app.use(express.static(path.join(__dirname, 'public')));

// Global View Variables
app.use((req, res, next) => {
    // Support both standard and Next.js-style env var names
    res.locals.clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY;
    next();
});

// Templating Engine (Next.js-style)
app.use(expressLayouts);
// Explicit absolute path for views
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.set('layout', './layout'); // looks for views/layout.ejs

// File Upload Config (Temporary /tmp storage)
const upload = multer({ dest: '/tmp' });


// Ensure temp dirs
// native fs mkdirSync with recursive: true replaces ensureDirSync
try {
    fsSync.mkdirSync(path.join(__dirname, 'public/temp_downloads'), { recursive: true });
} catch (e) { }

// --- LEGACY REDIRECTS (SEO) ---
app.use((req, res, next) => {
    const redirects = {
        '/tts.html': '/tts',
        '/image_compressor.html': '/compressor',
        '/qr_code.html': '/qrcode',
        '/index.html': '/'
    };

    if (redirects[req.path]) {
        return res.redirect(301, redirects[req.path]);
    }
    next();
});

// --- VIEW ROUTES (Next.js Pages) ---

app.get('/', (req, res) => {
    res.render('pages/index', { title: 'Webtigo - Free Online Tools' });
});

app.get('/signin', (req, res) => {
    res.render('pages/signin', { title: 'Sign In - Webtigo' });
});

app.get('/tts', (req, res) => {
    res.render('pages/tts', { title: 'Text to Speech - Webtigo' });
});

app.get('/compressor', (req, res) => {
    res.render('pages/compressor', { title: 'Image Compressor - Webtigo' });
});

app.get('/qrcode', (req, res) => {
    res.render('pages/qrcode', { title: 'QR Code Generator - Webtigo' });
});

// (PDF Page removed)

app.get('/resizer', (req, res) => {
    res.render('pages/resizer', { title: 'Image Resizer - Webtigo' });
});

app.get('/frequency', (req, res) => {
    res.render('pages/frequency', { title: 'Frequency Generator - Webtigo' });
});

app.get('/case-converter', (req, res) => {
    res.render('pages/case-converter', { title: 'Case Converter - Webtigo' });
});

app.get('/images-to-pdf', (req, res) => {
    res.render('pages/images-to-pdf', { title: 'Images to PDF - Webtigo' });
});

app.get('/pdf-to-images', (req, res) => {
    res.render('pages/pdf-to-images', { title: 'PDF to Images - Webtigo' });
});


// --- API ROUTES (Serverless Processing) ---

// Helper to safely remove files via native fs
const safeRemove = async (filePath) => {
    try {
        await fs.rm(filePath, { recursive: true, force: true });
    } catch (e) { /* ignore */ }
};

// 1. Image Compressor
app.post('/api/compress-image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).send('No image uploaded');
        const targetSizeKB = parseInt(req.body.size_kb, 10) || 50;
        let quality = 95;
        let buffer = await fs.readFile(req.file.path);

        while (buffer.length > targetSizeKB * 1024 && quality > 10) {
            buffer = await sharp(buffer).jpeg({ quality }).toBuffer();
            quality -= 10;
        }

        const filename = `compressed_${uuidv4()}.jpg`;
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
        await safeRemove(req.file.path);
    } catch (err) {
        res.status(500).send('Compression Failed');
    }
});

// 2. Image Resizer
app.post('/api/resize-image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).send('No image uploaded');
        const width = parseInt(req.body.width) || 300;
        const height = parseInt(req.body.height) || 300;

        const buffer = await sharp(req.file.path)
            .resize(width, height, { fit: 'cover' })
            .toBuffer();

        const filename = `resized_${uuidv4()}.jpg`;
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
        await safeRemove(req.file.path);
    } catch (err) {
        res.status(500).send('Resize Failed');
    }
});

// 3. QR Code
app.post('/api/generate-qr', upload.none(), async (req, res) => {
    try {
        const { data } = req.body;
        if (!data) return res.status(400).send('No data provided');
        const buffer = await QRCode.toBuffer(data, { width: 300 });
        const filename = `qr_${uuidv4()}.png`;
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
    } catch (err) {
        res.status(500).send('QR Gen Failed');
    }
});

// 4. TTS
app.post('/api/speak', upload.none(), async (req, res) => {
    try {
        const { text, speed, accent } = req.body;
        if (!text) return res.status(400).send('No text');
        const lang = accent || 'en';
        const slow = speed === 'slow';
        const filename = `tts_${uuidv4()}.mp3`;
        const tempPath = path.join('/tmp', filename);

        const tts = new gTTS(text, lang, slow);
        tts.save(tempPath, async (err) => {
            if (err) return res.status(500).send('TTS Failed');
            const buffer = await fs.readFile(tempPath);
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(buffer);
            await safeRemove(tempPath);
        });
    } catch (err) {
        res.status(500).send('TTS Error');
    }
});

// 6. Img to PDF
app.post('/api/images-to-pdf', upload.array('images', 50), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) return res.status(400).send('No images uploaded');

        // Create a new PDFDocument
        const pdfDoc = await PDFDocument.create();

        // Sort files by index if sent, but multer array maintains order of upload
        // We assume frontend sends them in order

        for (const file of req.files) {
            const imageBytes = await fs.readFile(file.path);
            let image;
            // Embed based on type
            if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/jpg') {
                image = await pdfDoc.embedJpg(imageBytes);
            } else if (file.mimetype === 'image/png') {
                image = await pdfDoc.embedPng(imageBytes);
            } else {
                continue; // Skip unsupported
            }

            const { width, height } = image.scale(1);
            const page = pdfDoc.addPage([width, height]);
            page.drawImage(image, {
                x: 0,
                y: 0,
                width: width,
                height: height,
            });
            await safeRemove(file.path);
        }

        const pdfBytes = await pdfDoc.save();
        const filename = `converted_${uuidv4()}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(Buffer.from(pdfBytes));
    } catch (err) {
        console.error(err);
        res.status(500).send('Conversion Failed');
    }
});

// 7. PDF to Images
app.post('/api/pdf-to-images', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).send('No PDF uploaded');

        // 1. Get page count using pdf-lib
        const pdfBuffer = await fs.readFile(req.file.path);
        const pdfDoc = await PDFDocument.load(pdfBuffer);
        const pageCount = pdfDoc.getPageCount();

        const zip = new AdmZip();

        // 2. Render each page with sharp
        for (let i = 0; i < pageCount; i++) {
            try {
                const imageBuffer = await sharp(req.file.path, { page: i, density: 150 })
                    .jpeg({ quality: 90 })
                    .toBuffer();
                zip.addFile(`page_${i + 1}.jpg`, imageBuffer);
            } catch (sharpError) {
                console.error('Sharp PDF render error:', sharpError);
                // Continue to next page or fail? Better to fail or warn.
            }
        }

        const zipBuffer = zip.toBuffer();
        const filename = `extracted_images_${uuidv4()}.zip`;

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(zipBuffer);

        await safeRemove(req.file.path);

    } catch (err) {
        console.error(err);
        res.status(500).send('Extraction Failed. Note: This feature requires system-level PDF libraries which may be missing.');
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
