// main.js
// Highlights the active navigation link based on the current URL path
document.addEventListener('DOMContentLoaded', function() {
    const navLinks = document.querySelectorAll('header a');
    const path = window.location.pathname;
    navLinks.forEach(link => {
        // Remove any existing 'active' class
        link.classList.remove('active');
        // If the link's href matches the current path, add 'active'
        if (link.getAttribute('href') === path) {
            link.classList.add('active');
        }
        // Special case for home page
        if (path === '/' && link.getAttribute('href') === '/') {
            link.classList.add('active');
        }
    });
});