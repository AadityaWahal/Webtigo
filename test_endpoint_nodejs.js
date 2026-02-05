
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

async function testEndpoint() {
    const form = new FormData();
    form.append('text', 'Hello testing');
    form.append('speed', 'normal');
    form.append('accent', 'en');

    try {
        console.log("Sending POST request to http://localhost:3000/speak");
        const response = await axios.post('http://localhost:3000/speak', form, {
            headers: {
                ...form.getHeaders()
            },
            responseType: 'arraybuffer'
        });

        console.log("Response status:", response.status);
        console.log("Response length:", response.data.length);
        fs.writeFileSync('test_output_node.mp3', response.data);
        console.log("Saved test_output_node.mp3");
    } catch (e) {
        console.error("Endpoint Test Failed:", e.message);
        if (e.response) {
            console.error("Status:", e.response.status);
            console.error("Data:", e.response.data.toString());
        }
    }
}

testEndpoint();
