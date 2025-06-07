// main.js
// Highlights the active navigation link based on the current URL path
// Updated to work with both /tts.html and /static/tts.html

document.addEventListener('DOMContentLoaded', function() {
    const navLinks = document.querySelectorAll('header a');
    let path = window.location.pathname;
    // Normalize /static/tts.html to /tts.html for matching
    if (path.startsWith('/static/')) {
        path = path.replace('/static', '');
    }
    navLinks.forEach(link => {
        link.classList.remove('active');
        // Normalize both href and path for matching
        let href = link.getAttribute('href');
        if (href.startsWith('/static/')) {
            href = href.replace('/static', '');
        }
        if (href === path || (path === '/' && href === '/index.html')) {
            link.classList.add('active');
        }
    });
});