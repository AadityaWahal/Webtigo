/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    async redirects() {
        return [
            {
                source: '/tts.html',
                destination: '/tts',
                permanent: true,
            },
            {
                source: '/image_compressor.html',
                destination: '/compressor',
                permanent: true,
            },
            {
                source: '/qr_code.html',
                destination: '/qrcode',
                permanent: true,
            },
            // Standardize homepage
            {
                source: '/index.html',
                destination: '/',
                permanent: true,
            },
            // Potentially other routes (Uncomment/Modify if needed):
            // {
            //   source: '/image_resizer.html',
            //   destination: '/resizer',
            //   permanent: true,
            // },
            // {
            //   source: '/frequency_generator.html',
            //   destination: '/frequency',
            //   permanent: true,
            // },
        ];
    },
};

module.exports = nextConfig;
