const PDFDocument = require('pdfkit');
const fs = require('fs').promises; // Use native fs promises
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const os = require('os');

class PdfService {
    // ... (keep createPdfFromImages unchanged) ...
    createPdfFromImages(files, res) {
        if (!files || files.length === 0) throw new Error("No images provided");

        const doc = new PDFDocument({ autoFirstPage: false });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="images.pdf"');

        doc.pipe(res);

        for (const file of files) {
            try {
                const img = doc.openImage(file.buffer);
                doc.addPage({ size: [img.width, img.height] });
                doc.image(img, 0, 0);
            } catch (err) {
                console.warn(`Skipping invalid image during PDF creation: ${file.originalname}`);
            }
        }

        doc.end();
    }

    async splitPdf(buffer) {
        let tempPath = null;
        try {
            if (!buffer) throw new Error("No PDF buffer provided");

            // Safe temp path
            const uniqueName = `upload-${uuidv4()}.pdf`;
            tempPath = path.join(os.tmpdir(), uniqueName);

            // Use native fs.writeFile
            await fs.writeFile(tempPath, buffer);

            // Dynamic import for pdf-img-convert
            const pdfImgConvert = (await import('pdf-img-convert')).default;

            const outputImages = await pdfImgConvert.convert(tempPath);

            if (outputImages.length > 10) {
                throw new Error("PDF too large. Max 10 pages allowed.");
            }

            return outputImages.map((imgBuffer, index) => ({
                filename: `page-${index + 1}.png`,
                buffer: Buffer.from(imgBuffer).toString('base64')
            }));

        } finally {
            if (tempPath) {
                // Use native fs.rm (Node 14.14+) or fs.unlink
                await fs.unlink(tempPath).catch(() => { });
            }
        }
    }
}

module.exports = new PdfService();
