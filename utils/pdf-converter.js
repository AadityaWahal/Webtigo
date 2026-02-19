const PImage = require('pureimage');
const { PassThrough } = require('stream');

// Use dynamic import for pdfjs-dist because it is ESM-only in v4+
async function convertPdfToImages(pdfBuffer) {
    // Shim global.document for pdfjs-dist
    // pureimage doesn't provide a full DOM, so we mock createElement for canvas
    if (!global.document) {
        global.document = {
            createElement: (name) => {
                if (name === 'canvas') {
                    // Create a dummy canvas for pdfjs context measurement
                    // The actual rendering will happen on pureimage bitmaps
                    // pdfjs-dist heavily relies on HTMLCanvasElement-like objects
                    return PImage.make(1, 1);
                }
                return null;
            }
        };
    }

    // Import pdfjs-dist dynamically
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

    // Set worker source
    pdfjs.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.mjs';

    // Canvas Factory for pdfjs
    // We bridge pdfjs rendering to pureimage
    const canvasFactory = {
        create: function (width, height) {
            if (width <= 0 || height <= 0) {
                width = 1; height = 1;
            }
            const canvas = PImage.make(Math.ceil(width), Math.ceil(height));
            const context = canvas.getContext('2d');
            return { canvas, context };
        },
        reset: function (canvasAndContext, width, height) {
            canvasAndContext.canvas.width = Math.ceil(width);
            canvasAndContext.canvas.height = Math.ceil(height);
            canvasAndContext.context = canvasAndContext.canvas.getContext('2d');
        },
        destroy: function (canvasAndContext) {
            canvasAndContext.canvas = null;
            canvasAndContext.context = null;
        }
    };

    // Load Document
    const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(pdfBuffer),
        disableFontFace: true, // Critical for avoiding font loading issues
        verbosity: 0
    });

    const pdfDocument = await loadingTask.promise;
    const outputImages = [];

    for (let i = 1; i <= pdfDocument.numPages; i++) {
        // console.log(`Rendering page ${i}/${pdfDocument.numPages}...`);
        const page = await pdfDocument.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });

        const canvasAndContext = canvasFactory.create(viewport.width, viewport.height);

        const renderContext = {
            canvasContext: canvasAndContext.context,
            viewport: viewport,
            canvasFactory: canvasFactory
        };

        await page.render(renderContext).promise;

        // Convert pureimage bitmap to PNG buffer
        // pureimage encodePNG is stream-based
        const pngBuffer = await new Promise((resolve, reject) => {
            const stream = new PassThrough();
            const chunks = [];
            stream.on('data', chunk => chunks.push(chunk));
            stream.on('end', () => resolve(Buffer.concat(chunks)));
            stream.on('error', reject);

            PImage.encodePNGToStream(canvasAndContext.canvas, stream)
                .catch(reject);
        });

        outputImages.push(pngBuffer);

        // Cleanup
        canvasFactory.destroy(canvasAndContext);
    }

    return outputImages;
}

module.exports = { convertPdfToImages };
