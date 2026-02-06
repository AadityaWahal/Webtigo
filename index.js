const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const QRCode = require('qrcode');
const { PDFDocument } = require('pdf-lib');
const gTTS = require('gtts');
const createZip = require('./utils/zip');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// Global View Variables
app.use((req, res, next) => {
    res.locals.clerkKey = process.env.CLERK_PUBLISHABLE_KEY;
    next();
});

// Templating Engine (Next.js-style)
app.use(expressLayouts);
app.set('view engine', 'ejs');
app.set('layout', './layout'); // looks for views/layout.ejs

// File Upload Config (Temporary /tmp storage)
const upload = multer({ dest: '/tmp' });

// Ensure temp dirs
fs.ensureDirSync(path.join(__dirname, 'public/temp_downloads')); // Not used in serverless logic, but good practice locally

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

app.get('/pdf', (req, res) => {
    res.render('pages/pdf', { title: 'PDF Tools - Webtigo' });
});

app.get('/resizer', (req, res) => {
    res.render('pages/resizer', { title: 'Image Resizer - Webtigo' });
});

app.get('/frequency', (req, res) => {
    res.render('pages/frequency', { title: 'Frequency Generator - Webtigo' });
});

app.get('/case-converter', (req, res) => {
    res.render('pages/case-converter', { title: 'Case Converter - Webtigo' });
});


// --- API ROUTES (Serverless Processing) ---

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
        await fs.remove(req.file.path);
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
        await fs.remove(req.file.path);
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

// 4. Create PDF
app.post('/api/create-pdf', upload.array('images'), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) return res.status(400).send('No images');
        const pdfDoc = await PDFDocument.create();
        for (const file of req.files) {
            const imgBuffer = await fs.readFile(file.path);
            let img;
            if (file.mimetype === 'image/png') {
                img = await pdfDoc.embedPng(imgBuffer);
            } else {
                img = await pdfDoc.embedJpg(imgBuffer);
            }
            const page = pdfDoc.addPage([img.width, img.height]);
            page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
            await fs.remove(file.path);
        }
        const pdfBytes = await pdfDoc.save();
        const filename = `created_${uuidv4()}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(Buffer.from(pdfBytes));
    } catch (err) {
        res.status(500).send('PDF Create Failed');
    }
});

// 5. Split PDF
app.post('/api/split-pdf', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).send('No PDF');
        const pdfBytes = await fs.readFile(req.file.path);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pageCount = pdfDoc.getPageCount();
        const filesToZip = [];

        for (let i = 0; i < pageCount; i++) {
            const newPdf = await PDFDocument.create();
            const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
            newPdf.addPage(copiedPage);
            const pdfBuffer = await newPdf.save();
            filesToZip.push({ name: `page-${i + 1}.pdf`, buffer: Buffer.from(pdfBuffer) });
        }

        const zipBuffer = createZip(filesToZip);
        const filename = `split_pages_${uuidv4()}.zip`;
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(zipBuffer);
        await fs.remove(req.file.path);
    } catch (err) {
        res.status(500).send('Split PDF Failed');
    }
});

// 6. TTS
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
            await fs.remove(tempPath);
        });
    } catch (err) {
        res.status(500).send('TTS Error');
    }
});

app.listen(PORT, () => console.log(`Available on http://localhost:${PORT}`));

module.exports = app;
