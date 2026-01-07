// Required dependencies (install with npm):
// express, multer, uuid, dotenv, sharp, qrcode, pdf-lib, axios, gtts, fs-extra, cors, express-ejs-layouts

const express = require('express');
const multer = require('multer');
const uuid = require('uuid').v4;
const dotenv = require('dotenv');
const sharp = require('sharp');
const QRCode = require('qrcode');
const { PDFDocument } = require('pdf-lib');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const cors = require('cors');
const { exec } = require('child_process');
const os = require('os');
const googleTTS = require('google-tts-api');
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
const pdfUpload = multer({ dest: os.tmpdir() });
const videoUpload = multer({ dest: os.tmpdir() });

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
    const slow = speed === 'slow';
    
    try {
        const base64 = await googleTTS.getAudioBase64(text, {
            lang: lang,
            slow: slow,
            host: 'https://translate.google.com',
            timeout: 10000,
        });
        const buffer = Buffer.from(base64, 'base64');
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
    const pdfDoc = await PDFDocument.create();
    for (const file of req.files) {
        const imgBytes = await fs.readFile(file.path);
        let img;
        if (file.mimetype === 'image/jpeg') {
            img = await pdfDoc.embedJpg(imgBytes);
        } else {
            img = await pdfDoc.embedPng(imgBytes);
        }
        const page = pdfDoc.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
        await fs.remove(file.path);
    }
    const pdfBytes = await pdfDoc.save();
    const filename = `${uuid()}.pdf`;
    const outputPath = path.join(os.tmpdir(), filename);
    await fs.writeFile(outputPath, pdfBytes);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBytes);
});

// Split PDF to images (requires 'pdftoppm' installed)
app.post('/split-pdf', pdfUpload.single('pdf'), async (req, res) => {
    const pdfPath = req.file.path;
    const outputDir = path.join(os.tmpdir(), `pdf_pages_${uuid()}`);
    await fs.ensureDir(outputDir);
    const baseName = `page-${uuid()}`;
    const cmd = `pdftoppm -jpeg -r 200 "${pdfPath}" "${outputDir}/${baseName}"`;
    exec(cmd, async (err) => {
        await fs.remove(pdfPath);
        if (err) return res.status(500).json({ error: 'PDF split failed' });
        const files = await fs.readdir(outputDir);
        const imageFiles = files.filter(f => f.startsWith(baseName));
        const images = [];
        for (const f of imageFiles) {
            const imgBuffer = await fs.readFile(path.join(outputDir, f));
            images.push({ filename: f, buffer: imgBuffer.toString('base64') });
        }
        res.json({ images });
    });
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