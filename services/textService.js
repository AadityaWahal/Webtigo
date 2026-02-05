class TextService {
    convertCase(text, type) {
        if (!text) throw new Error("Text is required");

        switch (type) {
            case 'uppercase': return text.toUpperCase();
            case 'lowercase': return text.toLowerCase();
            case 'titlecase': return text.toLowerCase().replace(/\b\w/g, s => s.toUpperCase());
            case 'camelcase': return text.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase());
            default: return text;
        }
    }
}

module.exports = new TextService();
