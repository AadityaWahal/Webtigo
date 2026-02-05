const PDFDocument = require('pdfkit');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const os = require('os');

class PdfService {
    // Create PDF: Streams directly to response, so we pass `res` in or return a doc?
    // Passing `res` allows us to pipe directly.
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

            await fs.writeFile(tempPath, buffer);

            // Dynamic import for pdf-img-convert
            const pdfImgConvert = (await import('pdf-img-convert')).default;

            // Limit to first 10 pages for safety
            // pdf-img-convert docs say specific pages can be passed via config, 
            // but default behavior is all pages. We will slice output if needed.
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
                await fs.remove(tempPath).catch(() => { });
            }
        }
    }
}

module.exports = new PdfService();
