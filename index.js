// Required dependencies (install with npm):
// express, multer, uuid, dotenv, sharp, qrcode, axios, google-tts-api, fs-extra, cors, @clerk/express, pdf-img-convert, pdfkit
const express = require('express');
const multer = require('multer');
const uuid = require('uuid').v4;
const dotenv = require('dotenv');
const sharp = require('sharp');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const cors = require('cors');
const os = require('os');
const googleTTS = require('google-tts-api');
// const pdfImgConvert = require('pdf-img-convert');
const { clerkMiddleware, requireAuth } = require('@clerk/express');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Initialize Clerk Middleware
app.use(clerkMiddleware());

// REMOVE these lines for Vercel serverless compatibility
// fs.ensureDirSync('static/mp3');
// fs.ensureDirSync('static/images/uploads');
// fs.ensureDirSync('static/images/processed');
// fs.ensureDirSync('static/pdf');
// fs.ensureDirSync('static/videos');
// fs.ensureDirSync('static/pdf_pages');

// Multer setup for file uploads
const upload = multer({ dest: os.tmpdir() });

// Serve all static files from the static directory at /static
app.use('/static', express.static(path.join(__dirname, 'static')));

// Serve static HTML files from public/
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
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

// Image Compressor
app.post('/compress-image', upload.single('image'), async (req, res) => {
    const targetSizeKB = parseInt(req.body.size_kb, 10);
    const inputPath = req.file.path;
    const uniqueFilename = `compressed_${uuid()}_${req.file.originalname}`;
    const outputPath = path.join(os.tmpdir(), uniqueFilename);
    let quality = 95;
    let buffer = await fs.readFile(inputPath);

    while (buffer.length > targetSizeKB * 1024 && quality > 10) {
        buffer = await sharp(buffer).jpeg({ quality }).toBuffer();
        quality -= 5;
    }
    await fs.writeFile(outputPath, buffer);
    await fs.remove(inputPath);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${uniqueFilename}"`);
    res.send(buffer);
});

// Text-to-Speech
app.post('/speak', upload.none(), async (req, res) => {
    const { text, speed, accent } = req.body;
    const lang = accent || 'en';
    const ttsSpeed = speed === 'slow' ? 0.24 : 1;
    
    try {
        const url = await googleTTS(text, lang, ttsSpeed);
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'arraybuffer'
        });
        const buffer = response.data;

        const filename = `${uuid()}.mp3`;
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.status(200).send(buffer);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'TTS failed' });
    }
});

// QR Code Generator
app.post('/generate-qr', upload.none(), async (req, res) => {
    const { data } = req.body;
    const uniqueFilename = `${uuid()}.png`;
    const outputPath = path.join(os.tmpdir(), uniqueFilename);
    await QRCode.toFile(outputPath, data, { width: 300 });
    const qrBuffer = await fs.readFile(outputPath);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="${uniqueFilename}"`);
    res.send(qrBuffer);
});

// Create PDF from images
app.post('/create-pdf', upload.array('images'), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).send('No images uploaded');
        }

        const doc = new PDFDocument({ autoFirstPage: false });
        const filename = `webtigo_${uuid()}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        doc.pipe(res);

        for (const file of req.files) {
            try {
                const img = doc.openImage(file.path);
                doc.addPage({ size: [img.width, img.height] });
                doc.image(img, 0, 0);
            } finally {
                await fs.remove(file.path);
            }
        }
        doc.end();
    } catch (err) {
        console.error('PDF creation error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to create PDF due to a server error.' });
        }
    }
});

// Split PDF to images (Native Node.js implementation for Vercel compatibility)
app.post('/split-pdf', upload.single('pdf'), async (req, res) => {
    try {
        const pdfImgConvert = (await import('pdf-img-convert')).default;
        const pdfPath = req.file.path;
        
        // Convert PDF pages to images (returns array of Uint8Arrays)
        const outputImages = await pdfImgConvert.convert(pdfPath);

        // Vercel has a 4.5MB response body limit. 
        // Large PDFs converted to base64 will exceed this.
        if (outputImages.length > 10) {
            return res.status(413).json({ error: 'PDF too large. Please split smaller files (max 10 pages).' });
        }

        const images = outputImages.map((imgBuffer, index) => ({
            filename: `page-${index + 1}.png`,
            buffer: Buffer.from(imgBuffer).toString('base64')
        }));

        await fs.remove(pdfPath);
        res.json({ images });
    } catch (err) {
        console.error('PDF split error:', err);
        res.status(500).json({ error: 'PDF split failed' });
    }
});

// Image Resizer (fixed 300x300 for demo)
app.post('/resize-image', upload.single('image'), async (req, res) => {
    const uniqueFilename = `resized_${uuid()}_${req.file.originalname}`;
    const outputPath = path.join(os.tmpdir(), uniqueFilename);
    await sharp(req.file.path).resize(300, 300).toFile(outputPath);
    const resizedBuffer = await fs.readFile(outputPath);
    await fs.remove(req.file.path);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${uniqueFilename}"`);
    res.send(resizedBuffer);
});

// Video Generator (RunwayML API)
app.post('/generate-video', upload.none(), async (req, res) => {
    const text = req.body.video_text;
    const uniqueFilename = `${uuid()}.mp4`;
    const outputPath = path.join(os.tmpdir(), uniqueFilename);
    const apiUrl = "https://api.runwayml.com/v1/generate";
    const headers = {
        'Authorization': `Bearer ${process.env.API_KEY}`,
        'Content-Type': 'application/json'
    };
    const payload = {
        model: 'gen4_video',
        prompt_text: text,
        ratio: '1920:1080',
        parameters: {}
    };
    try {
        const response = await axios.post(apiUrl, payload, { headers, responseType: 'arraybuffer' });
        await fs.writeFile(outputPath, response.data);
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Disposition', `attachment; filename="${uniqueFilename}"`);
        res.send(response.data);
    } catch (e) {
        res.status(500).json({ error: `Failed to connect to the API: ${e.message}` });
    }
});

// Case Converter
app.post('/convert-case', (req, res) => {
    const { text, type } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });

    let result = '';
    switch (type) {
        case 'uppercase':
            result = text.toUpperCase();
            break;
        case 'lowercase':
            result = text.toLowerCase();
            break;
        case 'titlecase':
            result = text.toLowerCase().replace(/\b\w/g, s => s.toUpperCase());
            break;
        case 'camelcase':
            result = text.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase());
            break;
        default:
            result = text;
    }
    res.json({ result });
});

// Protected Dashboard Route
app.get('/dashboard', requireAuth(), (req, res) => {
    res.send(`
      <h1>Webtigo Dashboard</h1>
      <p>Welcome, User ID: ${req.auth.userId}</p>
      <a href="/">Back Home</a>
    `);
});

// Error handling for Clerk authentication
app.use((err, req, res, next) => {
  if (err.message === 'Unauthenticated') {
    res.status(401).send(`
      <h1>401 - Unauthorized</h1>
      <p>You must be logged in to view this page.</p>
      <a href="/">Go Home to Sign In</a>
    `);
  } else {
    next(err);
  }
});

// Serve static files for verification and sitemap
app.get('/google6cda3ef54c5c2da9.html', (req, res) =>
    res.sendFile(path.join(__dirname, 'public/google6cda3ef54c5c2da9.html'))
);
app.get('/sitemap.xml', (req, res) => {
  res.setHeader('Content-Type', 'application/xml');
  res.sendFile(path.join(__dirname, 'public', 'sitemap.xml'));
});
app.get('/favicon.ico', (req, res) => {
    res.status(204).end(); // No Content, avoids 404 in logs
});

// Remove this legacy static CSS route, as styles.css is now in public/

if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}

module.exports = app;