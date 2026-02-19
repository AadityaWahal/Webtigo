const { createCanvas } = require('canvas');

// We use dynamic import for pdfjs-dist because it is ESM-only in v4+
async function convertPdfToImages(pdfBuffer) {
    // Import pdfjs-dist dynamically
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

    // Set worker source - required for pdfjs v4
    // We point to the local node_modules path
    // Note: In some environments allowing the worker to be internal might be better, 
    // but pdfjs often demands a worker.
    // pdf-img-convert allows it to be string.
    pdfjs.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.mjs';

    // Helper to create canvas (Node replacement for DOM canvas)
    const canvasFactory = {
        create: function (width, height) {
            const canvas = createCanvas(width, height);
            const context = canvas.getContext("2d");
            return { canvas, context };
        },
        reset: function (canvasAndContext, width, height) {
            canvasAndContext.canvas.width = width;
            canvasAndContext.canvas.height = height;
        },
        destroy: function (canvasAndContext) {
            canvasAndContext.canvas = null;
            canvasAndContext.context = null;
        }
    };

    // Load Document
    // disableFontFace: true is important in Node to avoid font loading errors if fonts are missing
    const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(pdfBuffer),
        disableFontFace: true,
        verbosity: 0
    });

    const pdfDocument = await loadingTask.promise;
    const outputImages = [];

    for (let i = 1; i <= pdfDocument.numPages; i++) {
        console.log(`Processing page ${i}/${pdfDocument.numPages}`);
        const page = await pdfDocument.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 }); // Good quality scale
        console.log(`Viewport: ${viewport.width}x${viewport.height}`);

        const canvasAndContext = canvasFactory.create(viewport.width, viewport.height);

        const renderContext = {
            canvasContext: canvasAndContext.context,
            viewport: viewport,
            canvasFactory: canvasFactory
        };

        await page.render(renderContext).promise;

        // Convert to PNG buffer
        const imageBuffer = canvasAndContext.canvas.toBuffer('image/png');
        outputImages.push(imageBuffer);

        // Cleanup
        canvasFactory.destroy(canvasAndContext);
    }

    return outputImages;
}

module.exports = { convertPdfToImages };
