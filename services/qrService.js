const QRCode = require('qrcode');

class QrService {
    async generateQr(data) {
        if (!data) throw new Error("Data is required for QR code");
        return await QRCode.toBuffer(data, { width: 300 });
    }
}

module.exports = new QrService();
