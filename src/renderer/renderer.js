const tabsContainer = document.getElementById('tabs-container');
const container = document.getElementById('webview-container');
const btnClose = document.getElementById('btn-close');
const btnMaximize = document.getElementById('btn-maximize');
const btnMinimize = document.getElementById('btn-minimize');
const btnRefresh = document.getElementById('btn-refresh');
const btnDropdown = document.getElementById('btn-dropdown');
const dropdownMenu = document.getElementById('dropdown-menu');

let activeIndex = -1;
let webviews = [];
let currentConfig = null;
let openTabs = new Set(); // 已打开的站点索引

// Window controls
btnClose.addEventListener('click', () => window.electronAPI.closeWindow());
btnMaximize.addEventListener('click', () => window.electronAPI.maximizeWindow());
btnMinimize.addEventListener('click', () => window.electronAPI.minimizeWindow());
btnRefresh.addEventListener('click', () => {
  if (activeIndex >= 0 && webviews[activeIndex]) {
    const site = currentConfig.webSites[activeIndex];
    if (site && site.url) {
      webviews[activeIndex].loadURL(site.url);
    }
  }
});

// Update maximize/restore icon
window.electronAPI.onMaximizeChange((isMaximized) => {
  btnMaximize.textContent = isMaximized ? '❐' : '□';
  btnMaximize.title = isMaximized ? '还原' : '最大化';
});

// Dropdown toggle
btnDropdown.addEventListener('click', (e) => {
  e.stopPropagation();
  dropdownMenu.classList.toggle('hidden');
});

// Close dropdown when clicking outside
document.addEventListener('click', () => {
  dropdownMenu.classList.add('hidden');
});

dropdownMenu.addEventListener('click', (e) => {
  e.stopPropagation();
});

// Initialize
async function init() {
  const config = await window.electronAPI.getAppConfig();
  currentConfig = config;
  document.title = config.title;

  // Create tabs for sites with isShow=true
  config.webSites.forEach((site, index) => {
    if (site.isShow) {
      createTab(index, site);
      openTabs.add(index);
    }
  });

  // Populate dropdown with hidden sites
  updateDropdownMenu();

  // Update close button visibility
  updateTabCloseButtons();

  // Activate first tab
  if (openTabs.size > 0) {
    const firstIndex = Math.min(...openTabs);
    activateTab(firstIndex);
  }

  // Set initial maximize icon state
  const state = await window.electronAPI.getWindowState();
  btnMaximize.textContent = state.isMaximized ? '❐' : '□';
}

function createTab(index, site) {
  const tab = document.createElement('div');
  tab.className = 'tab-item';
  tab.dataset.index = index;

  const titleSpan = document.createElement('span');
  titleSpan.className = 'tab-title';
  titleSpan.textContent = site.title;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'tab-close';
  closeBtn.textContent = '✕';
  closeBtn.title = '关闭';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeTab(index);
  });

  tab.appendChild(titleSpan);
  tab.appendChild(closeBtn);
  tab.addEventListener('click', () => activateTab(index));
  tabsContainer.appendChild(tab);
}

function closeTab(index) {
  // Find the tab element and remove it
  const tabElement = tabsContainer.querySelector(`[data-index="${index}"]`);
  if (tabElement) {
    tabElement.remove();
  }

  // Remove webview if exists
  if (webviews[index]) {
    webviews[index].remove();
    webviews[index] = null;
  }

  // Remove from open tabs
  openTabs.delete(index);

  // Update config
  currentConfig.webSites[index].isShow = false;

  // Update dropdown menu
  updateDropdownMenu();

  // Update close button visibility
  updateTabCloseButtons();

  // If closed tab was active, activate another tab
  if (activeIndex === index) {
    activeIndex = -1;
    if (openTabs.size > 0) {
      const nextIndex = Math.min(...openTabs);
      activateTab(nextIndex);
    }
  } else {
    // Re-index tabs if needed
    reindexTabs();
  }
}

function reindexTabs() {
  const tabs = tabsContainer.querySelectorAll('.tab-item');
  tabs.forEach((tab, i) => {
    // No need to re-index since we use data-index
  });
}

function updateTabCloseButtons() {
  const tabs = tabsContainer.querySelectorAll('.tab-item');
  const closeButtons = tabsContainer.querySelectorAll('.tab-close');
  const showClose = tabs.length > 1;
  closeButtons.forEach(btn => {
    btn.style.display = showClose ? '' : 'none';
  });
}

function updateDropdownMenu() {
  dropdownMenu.innerHTML = '';

  let hasHiddenSites = false;
  currentConfig.webSites.forEach((site, index) => {
    if (!openTabs.has(index)) {
      hasHiddenSites = true;
      const item = document.createElement('div');
      item.className = 'dropdown-item';
      item.textContent = site.title;
      item.addEventListener('click', () => {
        openSite(index);
        dropdownMenu.classList.add('hidden');
      });
      dropdownMenu.appendChild(item);
    }
  });

  // Divider + settings item (always show)
  if (hasHiddenSites) {
    const divider = document.createElement('div');
    divider.className = 'dropdown-divider';
    dropdownMenu.appendChild(divider);
  }

  const settingsItem = document.createElement('div');
  settingsItem.className = 'dropdown-item dropdown-settings';
  settingsItem.textContent = '⚙ 设置站点';
  settingsItem.addEventListener('click', () => {
    openSettingsDialog();
    dropdownMenu.classList.add('hidden');
  });
  dropdownMenu.appendChild(settingsItem);

  btnDropdown.style.display = 'flex';
}

function openSite(index) {
  if (openTabs.has(index)) return;

  const site = currentConfig.webSites[index];
  site.isShow = true;
  openTabs.add(index);

  // Create tab
  createTab(index, site);

  // Update close button visibility
  updateTabCloseButtons();

  // Activate the new tab
  activateTab(index);

  // Update dropdown
  updateDropdownMenu();
}

function activateTab(index) {
  if (index === activeIndex) return;

  // Deactivate current
  if (activeIndex >= 0) {
    const currentTab = tabsContainer.querySelector(`[data-index="${activeIndex}"]`);
    if (currentTab) {
      currentTab.classList.remove('active');
    }
    if (webviews[activeIndex]) {
      webviews[activeIndex].classList.remove('active');
    }
  }

  // Lazy load webview if not created yet
  if (!webviews[index]) {
    const site = currentConfig.webSites[index];
    const wv = document.createElement('webview');
    wv.setAttribute('src', site.url);
    wv.setAttribute('autosize', 'on');
    container.appendChild(wv);
    webviews[index] = wv;
  }

  // Activate new
  activeIndex = index;
  const newTab = tabsContainer.querySelector(`[data-index="${index}"]`);
  if (newTab) {
    newTab.classList.add('active');
  }
  webviews[index].classList.add('active');
}

function refreshUI() {
  // Close all tabs
  const tabs = tabsContainer.querySelectorAll('.tab-item');
  tabs.forEach(tab => tab.remove());

  // Remove all webviews
  webviews.forEach((wv, i) => {
    if (wv) {
      wv.remove();
      webviews[i] = null;
    }
  });

  openTabs.clear();
  activeIndex = -1;

  // Re-create tabs for sites with isShow=true
  currentConfig.webSites.forEach((site, index) => {
    if (site.isShow) {
      createTab(index, site);
      openTabs.add(index);
    }
  });

  updateDropdownMenu();
  updateTabCloseButtons();

  if (openTabs.size > 0) {
    const firstIndex = Math.min(...openTabs);
    activateTab(firstIndex);
  }
}

function openSettingsDialog() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal-container';

  // Header
  const header = document.createElement('div');
  header.className = 'modal-header';
  const title = document.createElement('span');
  title.textContent = '站点管理';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => overlay.remove());
  header.appendChild(title);
  header.appendChild(closeBtn);

  // Body
  const body = document.createElement('div');
  body.className = 'modal-body';

  function renderSiteList() {
    body.innerHTML = '';

    const table = document.createElement('div');
    table.className = 'site-table';

    // Table header
    const tableHeader = document.createElement('div');
    tableHeader.className = 'site-row site-row-header';
    tableHeader.innerHTML = '<span class="col-drag"></span><span class="col-name">名称</span><span class="col-url">URL</span><span class="col-show">显示</span><span class="col-actions">操作</span>';
    table.appendChild(tableHeader);

    let dragSrcIndex = null;

    currentConfig.webSites.forEach((site, index) => {
      const row = document.createElement('div');
      row.className = 'site-row';
      row.draggable = true;
      row.dataset.index = index;

      // Drag handle
      const dragHandle = document.createElement('span');
      dragHandle.className = 'col-drag';
      dragHandle.textContent = '☰';
      dragHandle.title = '拖拽排序';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'col-name';
      nameSpan.textContent = site.title;

      const urlSpan = document.createElement('span');
      urlSpan.className = 'col-url';
      urlSpan.textContent = site.url;

      const showSpan = document.createElement('span');
      showSpan.className = 'col-show';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = site.isShow;
      checkbox.addEventListener('change', () => {
        site.isShow = checkbox.checked;
      });
      showSpan.appendChild(checkbox);

      const actionsSpan = document.createElement('span');
      actionsSpan.className = 'col-actions';

      const editBtn = document.createElement('button');
      editBtn.className = 'btn-edit';
      editBtn.textContent = '编辑';
      editBtn.addEventListener('click', () => {
        row.classList.add('editing');

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = site.title;
        nameInput.className = 'edit-input';
        nameSpan.textContent = '';
        nameSpan.appendChild(nameInput);

        const urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.value = site.url;
        urlInput.className = 'edit-input';
        urlSpan.textContent = '';
        urlSpan.appendChild(urlInput);

        const saveBtn = document.createElement('button');
        saveBtn.className = 'btn-save';
        saveBtn.textContent = '保存';
        saveBtn.addEventListener('click', () => {
          const newName = nameInput.value.trim();
          const newUrl = urlInput.value.trim();
          if (newName && newUrl) {
            site.title = newName;
            site.url = newUrl;
            renderSiteList();
          }
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn-cancel';
        cancelBtn.textContent = '取消';
        cancelBtn.addEventListener('click', () => {
          renderSiteList();
        });

        actionsSpan.innerHTML = '';
        actionsSpan.appendChild(saveBtn);
        actionsSpan.appendChild(cancelBtn);
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn-delete';
      deleteBtn.textContent = '删除';
      deleteBtn.addEventListener('click', () => {
        if (confirm(`确认删除站点「${site.title}」？`)) {
          currentConfig.webSites.splice(index, 1);
          renderSiteList();
        }
      });

      actionsSpan.appendChild(editBtn);
      actionsSpan.appendChild(deleteBtn);

      row.appendChild(dragHandle);
      row.appendChild(nameSpan);
      row.appendChild(urlSpan);
      row.appendChild(showSpan);
      row.appendChild(actionsSpan);

      // --- Drag and drop ---
      row.addEventListener('dragstart', (e) => {
        dragSrcIndex = index;
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        // Use a transparent image as drag ghost
        const ghost = document.createElement('div');
        ghost.style.opacity = '0';
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 0, 0);
        setTimeout(() => ghost.remove(), 0);
      });

      row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        table.querySelectorAll('.site-row').forEach(r => r.classList.remove('drag-over'));
        dragSrcIndex = null;
      });

      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });

      row.addEventListener('dragenter', (e) => {
        e.preventDefault();
        if (row.dataset.index !== String(dragSrcIndex)) {
          row.classList.add('drag-over');
        }
      });

      row.addEventListener('dragleave', () => {
        row.classList.remove('drag-over');
      });

      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('drag-over');
        const fromIndex = dragSrcIndex;
        const toIndex = index;
        if (fromIndex === null || fromIndex === toIndex) return;

        // Reorder array
        const [moved] = currentConfig.webSites.splice(fromIndex, 1);
        currentConfig.webSites.splice(toIndex, 0, moved);

        renderSiteList();
      });

      table.appendChild(row);
    });

    body.appendChild(table);

    // Add site button
    const addBtn = document.createElement('button');
    addBtn.className = 'btn-add';
    addBtn.textContent = '+ 添加站点';
    addBtn.addEventListener('click', () => {
      const newRow = document.createElement('div');
      newRow.className = 'site-row editing';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.placeholder = '站点名称';
      nameInput.className = 'edit-input';
      const nameCol = document.createElement('span');
      nameCol.className = 'col-name';
      nameCol.appendChild(nameInput);

      const urlInput = document.createElement('input');
      urlInput.type = 'text';
      urlInput.placeholder = 'https://example.com';
      urlInput.className = 'edit-input';
      const urlCol = document.createElement('span');
      urlCol.className = 'col-url';
      urlCol.appendChild(urlInput);

      const showCol = document.createElement('span');
      showCol.className = 'col-show';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      showCol.appendChild(checkbox);

      const actionsCol = document.createElement('span');
      actionsCol.className = 'col-actions';

      const saveBtn = document.createElement('button');
      saveBtn.className = 'btn-save';
      saveBtn.textContent = '保存';
      saveBtn.addEventListener('click', () => {
        const newName = nameInput.value.trim();
        const newUrl = urlInput.value.trim();
        if (newName && newUrl) {
          currentConfig.webSites.push({
            title: newName,
            url: newUrl,
            isShow: checkbox.checked,
          });
          renderSiteList();
        }
      });

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn-cancel';
      cancelBtn.textContent = '取消';
      cancelBtn.addEventListener('click', () => {
        renderSiteList();
      });

      actionsCol.appendChild(saveBtn);
      actionsCol.appendChild(cancelBtn);

      newRow.appendChild(nameCol);
      newRow.appendChild(urlCol);
      newRow.appendChild(showCol);
      newRow.appendChild(actionsCol);

      // Insert before the add button
      table.appendChild(newRow);
      addBtn.remove();
      nameInput.focus();
    });

    body.appendChild(addBtn);
  }

  renderSiteList();

  // Footer with save button
  const footer = document.createElement('div');
  footer.className = 'modal-footer';
  const saveAllBtn = document.createElement('button');
  saveAllBtn.className = 'btn-save-all';
  saveAllBtn.textContent = '保存并关闭';
  saveAllBtn.addEventListener('click', async () => {
    await window.electronAPI.saveAppConfig(currentConfig);
    overlay.remove();
    refreshUI();
  });
  footer.appendChild(saveAllBtn);

  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(footer);
  overlay.appendChild(modal);

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
}

init();
