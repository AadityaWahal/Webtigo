// Required dependencies
const express = require('express');
const multer = require('multer');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// ... (existing imports)

// (lines 37-47 replacement)
// Dynamic page routing
app.get('/:page.html', (req, res) => {
    const page = req.params.page;
    const filePath = path.join(__dirname, 'public', `${page}.html`);

    // Check if file exists using native fs
    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (!err) {
            res.sendFile(filePath);
        } else {
            res.status(404).send('Not Found');
        }
    });
});

// --- API ENDPOINTS (Using Modular Services) ---

// 1. Image Compressor
app.post('/compress-image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

        const size_kb = parseInt(req.body.size_kb, 10) || 50;
        const buffer = await imageService.compressImage(req.file.buffer, size_kb);
        const base64Image = `data:image/jpeg;base64,${buffer.toString('base64')}`;

        res.json({ image: base64Image, filename: 'compressed_image.jpg' });
    } catch (err) {
        console.error("Compression Error:", err);
        res.status(500).json({ error: 'Compression failed: ' + err.message });
    }
});

// 2. Image Resizer
app.post('/resize-image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

        const { width, height } = req.body;
        const buffer = await imageService.resizeImage(req.file.buffer, width || 300, height || 300);
        const base64Image = `data:image/jpeg;base64,${buffer.toString('base64')}`;

        res.json({ image: base64Image, filename: 'resized_image.jpg' });
    } catch (err) {
        console.error("Resize Error:", err);
        res.status(500).json({ error: 'Resize failed: ' + err.message });
    }
});

// 3. QR Code Generator
app.post('/generate-qr', upload.none(), async (req, res) => {
    try {
        const { data } = req.body;
        const buffer = await qrService.generateQr(data);
        const base64Image = `data:image/png;base64,${buffer.toString('base64')}`;

        res.json({ image: base64Image, filename: 'qrcode.png' });
    } catch (err) {
        console.error("QR Error:", err);
        res.status(500).json({ error: 'QR failed: ' + err.message });
    }
});

// 4. Create PDF
app.post('/create-pdf', upload.array('images'), (req, res) => {
    try {
        // pdfService.createPdfFromImages streams directly to response, so no async await needed for the initial call,
        // but it handles its own errors inside safely.
        pdfService.createPdfFromImages(req.files, res);
    } catch (err) {
        console.error("PDF Create Error:", err);
        if (!res.headersSent) res.status(500).json({ error: 'PDF Create failed: ' + err.message });
    }
});

// 5. Split PDF
app.post('/split-pdf', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No PDF uploaded' });

        const images = await pdfService.splitPdf(req.file.buffer);
        res.json({ images });

    } catch (err) {
        console.error("PDF Split Error:", err);
        const statusCode = err.message.includes("too large") ? 413 : 500;
        res.status(statusCode).json({ error: 'PDF Split failed: ' + err.message });
    }
});

// 6. Case Converter
app.post('/convert-case', upload.none(), (req, res) => {
    try {
        const { text, type } = req.body;
        const result = textService.convertCase(text, type);
        res.json({ result });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 7. Video Generator (Placeholder)
app.post('/generate-video', upload.none(), (req, res) => {
    res.status(501).json({ error: 'Video generation requires high-end GPU. Service not available.' });
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