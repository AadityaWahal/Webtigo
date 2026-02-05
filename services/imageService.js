const sharp = require('sharp');

class ImageService {
    async compressImage(buffer, size_kb) {
        if (!buffer) throw new Error("No buffer provided");
        let quality = 90;
        let compressedBuffer = buffer;
        const targetSize = size_kb * 1024;

        // Simple adaptive compression
        // Safety break: don't go below quality 10
        let currentSize = buffer.length;

        // If already smaller, just return (or can re-encode to ensure JPEG)
        if (currentSize <= targetSize) {
            return await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
        }

        while (currentSize > targetSize && quality > 10) {
            compressedBuffer = await sharp(buffer)
                .jpeg({ quality: quality })
                .toBuffer();
            currentSize = compressedBuffer.length;
            quality -= 10;
        }
        return compressedBuffer;
    }

    async resizeImage(buffer, width = 300, height = 300) {
        if (!buffer) throw new Error("No buffer provided");
        return await sharp(buffer)
            .resize(parseInt(width), parseInt(height), { fit: 'cover' })
            .jpeg()
            .toBuffer();
    }
}

module.exports = new ImageService();
