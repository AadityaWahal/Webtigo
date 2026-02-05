// Required dependencies: express, multer, uuid, dotenv, sharp, qrcode, pdfkit, fs-extra, cors, @clerk/express, pdf-img-convert
const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const dotenv = require('dotenv');
const sharp = require('sharp');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const fs = require('fs-extra'); // Kept for edge cases, but mostly avoiding disk
const path = require('path');
const cors = require('cors');
const { clerkMiddleware, requireAuth } = require('@clerk/express');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Initialize Clerk Middleware
app.use(clerkMiddleware());

// Use Memory Storage for Multer to avoid writing to disk (Vercel compatible)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // Limit to 10MB
});

// Serve static HTML files from public/
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));

// Dynamic page routing
app.get('/:page.html', (req, res) => {
    const page = req.params.page;
    const filePath = path.join(__dirname, 'public', `${page}.html`);
    fs.pathExists(filePath).then(exists => {
        if (exists) {
            res.sendFile(filePath);
        } else {
            res.status(404).send('Not Found');
        }
    });
});

// --- API ENDPOINTS (No External Calls, In-Memory Only) ---

// 1. Image Compressor
app.post('/compress-image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

        let quality = 80;
        let buffer = req.file.buffer;

        // Simple logic: reduce quality for stability
        const compressedBuffer = await sharp(buffer)
            .jpeg({ quality: quality })
            .toBuffer();

        res.set('Content-Type', 'image/jpeg');
        res.set('Content-Disposition', `attachment; filename="compressed_image.jpg"`);
        res.send(compressedBuffer);
    } catch (err) {
        console.error("Compression error:", err);
        res.status(500).json({ error: 'Compression failed' });
    }
});

// 2. Image Resizer
app.post('/resize-image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

        const resizedBuffer = await sharp(req.file.buffer)
            .resize(300, 300, { fit: 'cover' })
            .toBuffer();

        res.set('Content-Type', 'image/jpeg');
        res.set('Content-Disposition', `attachment; filename="resized_image.jpg"`);
        res.send(resizedBuffer);
    } catch (err) {
        console.error("Resize error:", err);
        res.status(500).json({ error: 'Resize failed' });
    }
});

// 3. QR Code Generator
app.post('/generate-qr', upload.none(), async (req, res) => {
    try {
        const { data } = req.body;
        if (!data) return res.status(400).json({ error: 'Data is required' });

        const qrBuffer = await QRCode.toBuffer(data, { width: 300 });

        res.set('Content-Type', 'image/png');
        res.set('Content-Disposition', `attachment; filename="qrcode.png"`);
        res.send(qrBuffer);
    } catch (err) {
        console.error("QR Error:", err);
        res.status(500).json({ error: 'QR Generation failed' });
    }
});

// 4. Create PDF from Images
app.post('/create-pdf', upload.array('images'), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) return res.status(400).send('No images uploaded');

        const doc = new PDFDocument({ autoFirstPage: false });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="images.pdf"');

        doc.pipe(res);

        for (const file of req.files) {
            const img = doc.openImage(file.buffer);
            doc.addPage({ size: [img.width, img.height] });
            doc.image(img, 0, 0);
        }

        doc.end();
    } catch (err) {
        console.error('PDF creation error:', err);
        if (!res.headersSent) res.status(500).json({ error: 'PDF creation failed' });
    }
});

// 5. Split PDF
app.post('/split-pdf', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No PDF uploaded' });

        // Write buffer to temp file (Vercel allows /tmp)
        const tempPath = path.join(require('os').tmpdir(), `upload-${uuidv4()}.pdf`);
        await fs.writeFile(tempPath, req.file.buffer);

        const pdfImgConvert = (await import('pdf-img-convert')).default;
        const outputImages = await pdfImgConvert.convert(tempPath);

        // Cleanup temp file immediately
        await fs.remove(tempPath).catch(console.error);

        if (outputImages.length > 10) {
            return res.status(413).json({ error: 'PDF too large (max 10 pages).' });
        }

        const images = outputImages.map((imgBuffer, index) => ({
            filename: `page-${index + 1}.png`,
            buffer: Buffer.from(imgBuffer).toString('base64')
        }));

        res.json({ images });
    } catch (err) {
        console.error('PDF split error:', err);
        res.status(500).json({ error: 'PDF split failed' });
    }
});

// 6. Case Converter (Pure Logic)
app.post('/convert-case', upload.none(), (req, res) => {
    const { text, type } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });

    let result = '';
    switch (type) {
        case 'uppercase': result = text.toUpperCase(); break;
        case 'lowercase': result = text.toLowerCase(); break;
        case 'titlecase': result = text.toLowerCase().replace(/\b\w/g, s => s.toUpperCase()); break;
        case 'camelcase': result = text.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase()); break;
        default: result = text;
    }
    res.json({ result });
});

// 7. Video Generator Placeholder (Cannot run on Serverless CPU)
app.post('/generate-video', upload.none(), (req, res) => {
    res.status(501).json({ error: 'Video generation requires high-end GPU which is not available in this environment. Please use premium service.' });
});

// Dashboard & Auth
app.get('/dashboard', requireAuth(), (req, res) => {
    res.send(`<h1>Webtigo Dashboard</h1><p>Welcome, User ID: ${req.auth.userId}</p><a href="/">Back Home</a>`);
});

app.use((err, req, res, next) => {
    if (err.message === 'Unauthenticated') {
        res.status(401).send(`<h1>401 - Unauthorized</h1><p>Login required.</p><a href="/">Sign In</a>`);
    } else {
        next(err);
    }
});

// Utilities
app.get('/sitemap.xml', (req, res) => {
    res.setHeader('Content-Type', 'application/xml');
    res.sendFile(path.join(__dirname, 'public', 'sitemap.xml'));
});
app.get('/favicon.ico', (req, res) => res.status(204).end());

if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}

module.exports = app;