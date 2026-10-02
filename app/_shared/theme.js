// Load before styles to avoid a flash when opening a saved dark workspace.
(() => {
 let theme, sidebar;
 try { theme = localStorage.getItem('ovrendi_app_theme'); sidebar = localStorage.getItem('ovrendi_sidebar'); } catch (_) {}
 document.documentElement.dataset.appTheme = ['light','dark'].includes(theme) ? theme : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
 document.documentElement.dataset.sidebar = sidebar === 'collapsed' ? 'collapsed' : 'expanded';
})();
