// filepath: /Users/stasnazarenko/Documents/Crypto/Ant/antidetect/public/theme.js
(function(){
    const toggle = document.getElementById('themeToggle');

    try {
        if (localStorage.getItem('theme') === 'light') {
            document.body.classList.add('light');
        }
    } catch(e) { /* ignore */ }

    if (!toggle) return;

    toggle.addEventListener('click', () => {
        document.body.classList.toggle('light');
        try {
            localStorage.setItem(
                'theme',
                document.body.classList.contains('light') ? 'light' : 'dark'
            );
        } catch(e) {}
    });
})();

