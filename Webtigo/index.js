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
const gTTS = require('gtts');
const createZip = require('./simpleZip');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Multer setup for file uploads
const upload = multer({ dest: '/tmp' });
const pdfUpload = multer({ dest: '/tmp' });

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
    try {
        const targetSizeKB = parseInt(req.body.size_kb, 10);
        const inputPath = req.file.path;
        const uniqueFilename = `compressed_${uuid()}_${req.file.originalname}`;
        const outputPath = path.join('/tmp', uniqueFilename);
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
    } catch (e) {
        res.status(500).send('Compression failed');
    }
});

// Text-to-Speech
app.post('/speak', upload.none(), async (req, res) => {
    const { text, speed, gender, accent } = req.body;
    const lang = accent || 'en';
    const slow = speed === 'slow';
    const filename = `${uuid()}.mp3`;
    const outputPath = path.join('/tmp', filename); // Use /tmp for serverless
    const tts = new gTTS(text, lang, slow);
    tts.save(outputPath, async err => {
        if (err) return res.status(500).json({ error: 'TTS failed' });
        try {
            const data = await fs.readFile(outputPath);
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.status(200).send(data);
        } catch (e) {
            res.status(500).json({ error: 'Failed to read mp3' });
        }
    });
});

// QR Code Generator
app.post('/generate-qr', upload.none(), async (req, res) => {
    const { data } = req.body;
    const uniqueFilename = `${uuid()}.png`;
    const outputPath = path.join('/tmp', uniqueFilename);
    await QRCode.toFile(outputPath, data, { width: 300 });
    const qrBuffer = await fs.readFile(outputPath);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="${uniqueFilename}"`);
    res.send(qrBuffer);
});

// Create PDF from images
app.post('/create-pdf', upload.array('images'), async (req, res) => {
    try {
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
        const outputPath = path.join('/tmp', filename);
        await fs.writeFile(outputPath, pdfBytes);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(Buffer.from(pdfBytes));
    } catch (e) {
        res.status(500).send('PDF creation failed: ' + e.message);
    }
});

// Split PDF into single-page PDFs
app.post('/split-pdf', pdfUpload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No PDF uploaded' });

        const pdfPath = req.file.path;
        const pdfBytes = await fs.readFile(pdfPath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pageCount = pdfDoc.getPageCount();
        const files = [];

        for (let i = 0; i < pageCount; i++) {
            const newPdf = await PDFDocument.create();
            const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
            newPdf.addPage(copiedPage);
            const pdfBuffer = await newPdf.save();
            files.push({
                name: `page-${i + 1}.pdf`,
                buffer: Buffer.from(pdfBuffer) // Ensure buffer
            });
        }

        const zipBuffer = createZip(files);
        await fs.remove(pdfPath);

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="split_pages.zip"`);
        res.send(zipBuffer);

    } catch (err) {
        console.error('Split PDF failed:', err);
        if (req.file && req.file.path) await fs.remove(req.file.path).catch(() => { });
        res.status(500).json({ error: 'Failed to split PDF: ' + err.message });
    }
});

// Image Resizer (fixed 300x300 for demo)
app.post('/resize-image', upload.single('image'), async (req, res) => {
    const uniqueFilename = `resized_${uuid()}_${req.file.originalname}`;
    const outputPath = path.join('/tmp', uniqueFilename);
    await sharp(req.file.path).resize(300, 300).toFile(outputPath);
    const resizedBuffer = await fs.readFile(outputPath);
    await fs.remove(req.file.path);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${uniqueFilename}"`);
    res.send(resizedBuffer);
});

// Video Generator (Disabled/Placeholder)
app.post('/generate-video', upload.none(), async (req, res) => {
    res.status(501).json({ error: 'Video generation requires high-end GPU. Service not available.' });
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

app.use(express.static(path.join(__dirname, 'public')));
app.use('/static', express.static(path.join(__dirname, 'static')));

module.exports = app;

if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
    });
}
