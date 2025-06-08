// main.js
// Highlights the active navigation link based on the current URL path
// Updated to work with both /public/tts.html, /static/tts.html, and their corresponding index.html files

document.addEventListener('DOMContentLoaded', function() {
    const navLinks = document.querySelectorAll('header a');
    let path = window.location.pathname;
    // Normalize /public/tts.html and /static/tts.html to /tts.html for matching
    if (path.startsWith('/public/')) {
        path = path.replace('/public', '');
    }
    if (path.startsWith('/static/')) {
        path = path.replace('/static', '');
    }
    navLinks.forEach(link => {
        link.classList.remove('active');
        let href = link.getAttribute('href');
        if (href.startsWith('/public/')) {
            href = href.replace('/public', '');
        }
        if (href.startsWith('/static/')) {
            href = href.replace('/static', '');
        }
        if (href === path || (path === '/' && (href === '/index.html'))) {
            link.classList.add('active');
        }
    });
});