
const googleTTS = require('google-tts-api');
const axios = require('axios');

async function testTTS() {
    console.log("Testing Google TTS API...");
    const text = "Hello world";
    const lang = "en";

    try {
        const url = googleTTS.getAudioUrl(text, {
            lang: lang,
            slow: false,
            host: 'https://translate.google.com',
        });
        console.log("Generated URL:", url);

        console.log("Fetching audio...");
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'arraybuffer'
        });
        console.log("Audio fetched successfully. Bytes:", response.data.length);
    } catch (e) {
        console.error("TTS Test Failed:", e.message);
        if (e.response) {
            console.error("Response status:", e.response.status);
            console.error("Response data:", e.response.data.toString());
        }
    }
}

testTTS();
