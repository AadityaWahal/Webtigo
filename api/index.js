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
const gTTS = require('gtts');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Ensure directories exist
fs.ensureDirSync('static/mp3');
fs.ensureDirSync('static/images/uploads');
fs.ensureDirSync('static/images/processed');
fs.ensureDirSync('static/pdf');
fs.ensureDirSync('static/videos');
fs.ensureDirSync('static/pdf_pages');

// Multer setup for file uploads
const upload = multer({ dest: 'static/images/uploads/' });
const pdfUpload = multer({ dest: 'static/' });
const videoUpload = multer({ dest: 'static/videos/' });

// Image Compressor
app.post('/compress-image', upload.single('image'), async (req, res) => {
    const targetSizeKB = parseInt(req.body.size_kb, 10);
    const inputPath = req.file.path;
    const uniqueFilename = `${uuid()}_${req.file.originalname}`;
    const outputPath = `static/images/processed/compressed_${uniqueFilename}`;
    let quality = 95;
    let buffer = await fs.readFile(inputPath);

    while (buffer.length > targetSizeKB * 1024 && quality > 10) {
        buffer = await sharp(buffer).jpeg({ quality }).toBuffer();
        quality -= 5;
    }
    await fs.writeFile(outputPath, buffer);
    await fs.remove(inputPath);
    res.json({ compressed_image_url: `/images/processed/compressed_${uniqueFilename}` });
});

// Text-to-Speech
app.post('/speak', upload.none(), async (req, res) => {
    const { text, speed, gender, accent } = req.body;
    const lang = accent || 'en';
    const slow = speed === 'slow';
    const filename = `${uuid()}.mp3`;
    const outputPath = `static/mp3/${filename}`;
    const tts = new gTTS(text, lang, slow);
    tts.save(outputPath, err => {
        if (err) return res.status(500).json({ error: 'TTS failed' });
        res.json({ audio_url: `/mp3/${filename}` });
    });
});

// QR Code Generator
app.post('/generate-qr', upload.none(), async (req, res) => {
    const { data } = req.body;
    const uniqueFilename = `${uuid()}.png`;
    const outputPath = `static/images/processed/${uniqueFilename}`;
    await QRCode.toFile(outputPath, data, { width: 300 });
    res.json({ qr_code_url: `/images/processed/${uniqueFilename}` });
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
    const outputPath = `static/pdf/${filename}`;
    await fs.writeFile(outputPath, pdfBytes);
    res.json({ pdf_url: `/pdf/${filename}` });
});

// Split PDF to images (requires 'pdftoppm' installed)
app.post('/split-pdf', pdfUpload.single('pdf'), async (req, res) => {
    const pdfPath = req.file.path;
    const outputDir = 'static/pdf_pages';
    await fs.ensureDir(outputDir);
    const baseName = `page-${uuid()}`;
    const cmd = `pdftoppm -jpeg -r 200 "${pdfPath}" "${outputDir}/${baseName}"`;
    exec(cmd, async (err) => {
        await fs.remove(pdfPath);
        if (err) return res.status(500).json({ error: 'PDF split failed' });
        const files = await fs.readdir(outputDir);
        const imageUrls = files.filter(f => f.startsWith(baseName)).map(f => `/pdf_pages/${f}`);
        res.json({ image_urls: imageUrls });
    });
});

// Image Resizer (fixed 300x300 for demo)
app.post('/resize-image', upload.single('image'), async (req, res) => {
    const uniqueFilename = `${uuid()}_${req.file.originalname}`;
    const outputPath = `static/images/processed/resized_${uniqueFilename}`;
    await sharp(req.file.path).resize(300, 300).toFile(outputPath);
    await fs.remove(req.file.path);
    res.json({ resized_image_url: `/images/processed/resized_${uniqueFilename}` });
});

// Video Generator (RunwayML API)
app.post('/generate-video', upload.none(), async (req, res) => {
    const text = req.body.video_text;
    const uniqueFilename = `${uuid()}.mp4`;
    const outputPath = `static/videos/${uniqueFilename}`;
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
        res.json({ video_url: `/videos/${uniqueFilename}` });
    } catch (e) {
        res.status(500).json({ error: `Failed to connect to the API: ${e.message}` });
    }
});

// Serve static files for verification and sitemap
app.get('/google6cda3ef54c5c2da9.html', (req, res) =>
    res.sendFile(path.join(__dirname, 'static/google6cda3ef54c5c2da9.html'))
);
app.get('/sitemap.xml', (req, res) =>
    res.sendFile(path.join(__dirname, 'static/sitemap.xml'))
);

module.exports = app;