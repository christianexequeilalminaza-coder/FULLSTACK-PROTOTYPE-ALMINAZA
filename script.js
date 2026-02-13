function showPage(pageId) {
    // 1. Hide all sections
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => page.classList.remove('active'));

    // 2. Show the requested section
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.add('active');
    }
}

// Simple Login Simulation for testing
function simulateLogin(isAdmin = false) {
    document.body.classList.remove('not-authenticated');
    document.body.classList.add('authenticated');
    if (isAdmin) {
        document.body.classList.add('is-admin');
    }
    showPage('home');
}