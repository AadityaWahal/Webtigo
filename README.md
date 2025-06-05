# File Converter & Text-to-Speech Utility Website

This project is a modern web application built with Node.js, Express, and Nunjucks.  
It provides a suite of free utilities including text-to-speech, image compression, QR code generation, PDF services, and image resizing.

## Features

- **Text-to-Speech:** Convert text to speech and download the audio (no login required).
- **Image Compressor:** Compress images to a target file size.
- **QR Code Generator:** Generate QR codes for any text or URL.
- **PDF Service:** 
  - Create PDFs from images (with drag-and-drop ordering).
  - Convert PDF pages to images.
- **Image Resizer:** Resize images to custom or preset dimensions.

## Project Structure

```
text-to-speech-website
├── static
│   ├── css
│   │   └── styles.css
│   ├── images
│   ├── mp3
│   ├── pdf
│   ├── pdf_pages
│   └── videos
├── templates
│   ├── base.html
│   ├── index.html
│   ├── tts.html
│   ├── image_compressor.html
│   ├── qr_code.html
│   ├── pdf_service.html
│   └── image_resizer.html
├── app.js
├── package.json
└── README.md
```

## Installation

1. Clone the repository:
   ```sh
   git clone <repository-url>
   cd text-to-speech-website
   ```

2. Install dependencies:
   ```sh
   npm install
   ```

3. (Optional) Create a `.env` file for API keys if needed.

## Usage

1. Start the server:
   ```sh
   node app.js
   ```
   or, for development with auto-reload:
   ```sh
   npx nodemon app.js
   ```

2. Open your web browser and go to [http://127.0.0.1:5000](http://127.0.0.1:5000).

## Dependencies

- express
- multer
- uuid
- dotenv
- sharp
- qrcode
- pdf-lib
- axios
- gtts
- fs-extra
- cors
- nunjucks

(Install all with `npm install`.)

## Contributing

Feel free to submit issues or pull requests for improvements or bug fixes.

## License

This project is licensed under the MIT License.