// main.js
// Highlights the active navigation link based on the current URL path
// Updated to work with both /tts.html and /static/tts.html

document.addEventListener('DOMContentLoaded', function() {
    const navLinks = document.querySelectorAll('header a');
    let path = window.location.pathname;
    // No normalization needed, as all links and routes use /static/
    navLinks.forEach(link => {
        link.classList.remove('active');
        let href = link.getAttribute('href');
        if (href === path || (path === '/static/' && (href === '/static/index.html'))) {
            link.classList.add('active');
        }
    });
});