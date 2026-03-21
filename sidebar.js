(function(global) {
  const sidebarContent = document.getElementById('sidebarContent');
  const gameContainer = document.querySelector('.game-container');

  function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar.classList.contains('open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  function openSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const settings = document.getElementById('settingsPanel');
    const info = document.getElementById('infoPanel');
    settings.style.display = 'block';
    settings.style.width = '100%';
    info.style.display = 'block';
    info.style.width = '100%';
    info.style.marginTop = '16px';
    sidebarContent.appendChild(settings);
    sidebarContent.appendChild(info);
    sidebar.classList.add('open');
    overlay.classList.add('open');
  }

  function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const settings = document.getElementById('settingsPanel');
    const info = document.getElementById('infoPanel');
    const boardWrapper = document.querySelector('.board-wrapper');
    if (settings && settings.parentNode === sidebarContent) {
      settings.style.display = '';
      settings.style.width = '';
      gameContainer.insertBefore(settings, boardWrapper);
    }
    if (info && info.parentNode === sidebarContent) {
      info.style.display = '';
      info.style.width = '';
      info.style.marginTop = '';
      gameContainer.appendChild(info);
    }
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
  }

  global.toggleSidebar = toggleSidebar;
  global.openSidebar = openSidebar;
  global.closeSidebar = closeSidebar;
})(window);
