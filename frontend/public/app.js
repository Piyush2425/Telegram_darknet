const apiBaseUrl = 'http://localhost:5000';

const state = {
  channels: [],
  stats: {
    messages: 0,
    messagesToday: 0,
    channels: 0,
    groups: 0,
    telegramStatus: 'Disconnected',
    mongodbStatus: 'Unknown',
    schedulerStatus: 'Stopped',
  },
  clientReady: false,
  entities: [],
  explorerLoaded: false,
  scheduler: null,
};

function $(selector) {
  return document.querySelector(selector);
}

function setActivity(message) {
  const activityLog = $('#activity-log');
  if (!activityLog) return;
  activityLog.innerHTML = `<p>${message}</p>`;
}

function showError(message) {
  setActivity(`Error: ${message}`);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function showExplorerAlert(message, type = 'info') {
  const alert = $('#explorer-alert');
  if (!alert) return;
  alert.textContent = message || '';
  alert.className = message ? `alert visible alert-${type}` : 'alert';
}

function formatEntityDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function renderEntities() {
  const body = $('#entity-table-body');
  const count = $('#entity-count');
  if (!body) return;
  if (count) count.textContent = `${state.entities.length} ${state.entities.length === 1 ? 'entity' : 'entities'}`;

  if (!state.entities.length) {
    body.innerHTML = '<tr><td colspan="8" class="empty-state">No matching Telegram entities.</td></tr>';
    return;
  }

  body.innerHTML = state.entities.map((entity) => `
    <tr>
      <td>
        <input
          type="checkbox"
          class="entity-checkbox"
          data-id="${entity.telegram_id}"
          aria-label="Select ${escapeHtml(entity.title || 'entity')}"
          ${entity.enabled ? 'checked' : ''}
        >
      </td>
      <td class="entity-title">${escapeHtml(entity.title || 'Untitled')}</td>
      <td>${entity.username ? `@${escapeHtml(entity.username)}` : '—'}</td>
      <td><span class="entity-type">${escapeHtml(entity.type || 'Unknown')}</span></td>
      <td>${formatNumber(entity.messages_stored)}</td>
      <td>${formatEntityDate(entity.last_scraped)}</td>
      <td>
        <span class="status-badge ${entity.enabled ? 'status-enabled' : 'status-disabled'}">
          ${escapeHtml(entity.monitoring_status || (entity.enabled ? 'Monitoring' : 'Idle'))}
        </span>
      </td>
      <td>
        <button class="btn-secondary entity-action" data-action="scrape-entity" data-id="${entity.telegram_id}">
          <i class="fas fa-download"></i> Scrape
        </button>
      </td>
    </tr>
  `).join('');
}

async function loadTelegramEntities() {
  const search = $('#entity-search')?.value.trim() || '';
  try {
    const response = await axios.get(`${apiBaseUrl}/api/telegram-entities`, {
      params: { search },
    });
    state.entities = response.data.entities || [];
    state.explorerLoaded = true;
    renderEntities();
  } catch (error) {
    showExplorerAlert(error.response?.data?.error || error.message, 'error');
  }
}

async function refreshTelegramEntities() {
  const button = $('#refresh-entities-btn');
  if (button) {
    button.disabled = true;
    button.classList.add('is-loading');
  }
  showExplorerAlert('Connecting to Telegram and discovering chats…', 'info');
  try {
    const response = await axios.post(`${apiBaseUrl}/api/telegram-entities/refresh`);
    showExplorerAlert(`Found and saved ${response.data.count || 0} Telegram entities.`, 'success');
    await loadTelegramEntities();
  } catch (error) {
    showExplorerAlert(error.response?.data?.error || error.message, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove('is-loading');
    }
  }
}

function setAllEntitySelections(enabled) {
  state.entities.forEach((entity) => {
    entity.enabled = enabled;
  });
  renderEntities();
}

function handleEntityCheckbox(event) {
  const checkbox = event.target.closest('.entity-checkbox');
  if (!checkbox) return;
  const entity = state.entities.find(
    (candidate) => String(candidate.telegram_id) === checkbox.dataset.id,
  );
  if (entity) {
    entity.enabled = checkbox.checked;
    renderEntities();
  }
}

async function saveEntitySelection() {
  const enabledIds = state.entities
    .filter((entity) => entity.enabled)
    .map((entity) => entity.telegram_id);
  const disabledIds = state.entities
    .filter((entity) => !entity.enabled)
    .map((entity) => entity.telegram_id);
  const button = $('#save-entity-selection');
  if (button) button.disabled = true;
  try {
    await axios.put(`${apiBaseUrl}/api/telegram-entities/selection`, {
      enabled_ids: enabledIds,
      disabled_ids: disabledIds,
    });
    showExplorerAlert('Monitoring selection saved.', 'success');
    await loadTelegramEntities();
  } catch (error) {
    showExplorerAlert(error.response?.data?.error || error.message, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

function renderSchedulerStatus() {
  const container = $('#scheduler-status');
  if (!container) return;

  const scheduler = state.scheduler;
  if (!scheduler) {
    container.innerHTML = '<p>Scheduler status is unavailable.</p>';
    return;
  }

  const statusText = scheduler.running ? 'Running' : 'Stopped';
  const configuredText = scheduler.configured ? 'Configured' : 'Not configured';

  container.innerHTML = `
    <div class="scheduler-status-grid">
      <div>
        <span class="scheduler-label">State</span>
        <strong>${statusText}</strong>
      </div>
      <div>
        <span class="scheduler-label">Configuration</span>
        <strong>${configuredText}</strong>
      </div>
      <div>
        <span class="scheduler-label">Run Time</span>
        <strong>${scheduler.run_at || '—'}</strong>
      </div>
      <div>
        <span class="scheduler-label">Repeat Interval</span>
        <strong>${scheduler.interval_hours ? `${scheduler.interval_hours} hours` : '—'}</strong>
      </div>
      <div>
        <span class="scheduler-label">Active Chat</span>
        <strong>${scheduler.active_entity?.title ? escapeHtml(scheduler.active_entity.title) : '—'}</strong>
      </div>
      <div>
        <span class="scheduler-label">Queue</span>
        <strong>${scheduler.queue?.length || 0}</strong>
      </div>
    </div>
  `;
}

function applySchedulerFormValues(scheduler) {
  if (!scheduler) return;
  const runAtInput = $('#scheduler-run-at');
  const intervalInput = $('#scheduler-interval-hours');
  if (runAtInput && scheduler.run_at) {
    runAtInput.value = scheduler.run_at.slice(0, 5);
  }
  if (intervalInput && scheduler.interval_hours) {
    intervalInput.value = String(scheduler.interval_hours);
  }
}

async function loadSchedulerStatus() {
  try {
    const response = await axios.get(`${apiBaseUrl}/api/scheduler`);
    state.scheduler = response.data.scheduler || null;
    applySchedulerFormValues(state.scheduler);
    renderSchedulerStatus();
  } catch (error) {
    state.scheduler = null;
    renderSchedulerStatus();
    showError(error.response?.data?.error || error.message);
  }
}

async function saveScheduler(event) {
  event.preventDefault();

  const runAt = $('#scheduler-run-at')?.value || '02:00';
  const intervalHours = parseInt($('#scheduler-interval-hours')?.value || '24', 10);
  const button = $('#scheduler-form button[type="submit"]');
  if (button) button.disabled = true;

  try {
    const response = await axios.post(`${apiBaseUrl}/api/scheduler`, {
      run_at: runAt,
      interval_hours: Number.isFinite(intervalHours) ? intervalHours : 24,
    });
    state.scheduler = response.data.scheduler || null;
    renderSchedulerStatus();
    setActivity(`Scheduler saved for ${runAt}.`);
  } catch (error) {
    showError(error.response?.data?.error || error.message);
  } finally {
    if (button) button.disabled = false;
  }
}

async function runSchedulerNow() {
  const button = $('#scheduler-run-now');
  if (button) button.disabled = true;
  try {
    const response = await axios.post(`${apiBaseUrl}/api/scheduler/run`);
    const queueCount = response.data.scheduler?.queue?.length || 0;
    setActivity(`Sequential scraping started for selected chats. Queue: ${queueCount}.`);
    await loadSchedulerStatus();
    await loadTelegramEntities();
    await loadDashboard();
  } catch (error) {
    showError(error.response?.data?.error || error.message);
  } finally {
    if (button) button.disabled = false;
  }
}

function renderChannels() {
  const container = $('#channels-container');
  if (!container) return;

  if (!state.channels.length) {
    container.innerHTML = '<p>No channels added yet.</p>';
    return;
  }

  container.innerHTML = state.channels
    .map(
      (channel) => `
        <div class="channel-card">
          <div class="channel-info">
            <h3>${channel.title || 'Unknown channel'}</h3>
            <p>ID: ${channel.id}</p>
            <p>${channel.link || ''}</p>
          </div>
          <div class="channel-actions">
            <button class="btn-secondary" data-action="scrape-messages" data-id="${channel.id}">Scrape Messages</button>
            <button class="btn-secondary" data-action="scrape-members" data-id="${channel.id}">Scrape Members</button>
            <button class="btn-danger" data-action="remove-channel" data-id="${channel.id}">Remove</button>
          </div>
        </div>
      `,
    )
    .join('');
}

function updateStats() {
  const channelCount = $('#channel-count');
  const messageCount = $('#message-count');
  const groupCount = $('#group-count');
  const messagesToday = $('#messages-today-count');
  const telegramStatus = $('#telegram-status');
  const mongodbStatus = $('#mongodb-status');
  const dashboardSchedulerStatus = $('#dashboard-scheduler-status');
  const channelForm = $('#channel-form button[type="submit"]');

  if (channelCount) channelCount.textContent = formatNumber(state.stats.channels);
  if (groupCount) groupCount.textContent = formatNumber(state.stats.groups);
  if (messageCount) messageCount.textContent = formatNumber(state.stats.messages);
  if (messagesToday) messagesToday.textContent = formatNumber(state.stats.messagesToday);
  if (telegramStatus) telegramStatus.textContent = state.stats.telegramStatus;
  if (mongodbStatus) mongodbStatus.textContent = state.stats.mongodbStatus;
  if (dashboardSchedulerStatus) dashboardSchedulerStatus.textContent = state.stats.schedulerStatus;
  if (channelForm) channelForm.disabled = !state.clientReady;
}

async function loadDashboard() {
  try {
    const response = await axios.get(`${apiBaseUrl}/api/dashboard`);
    state.stats.messages = response.data.total_messages || 0;
    state.stats.messagesToday = response.data.messages_collected_today || 0;
    state.stats.channels = response.data.total_channels || 0;
    state.stats.groups = response.data.total_groups || 0;
    state.stats.telegramStatus = response.data.telegram_status || 'Disconnected';
    state.stats.mongodbStatus = response.data.mongodb_status || 'Unknown';
    state.stats.schedulerStatus = response.data.scheduler_status || 'Stopped';
    updateStats();
  } catch (error) {
    state.stats.mongodbStatus = 'Unavailable';
    updateStats();
  }
}

async function loadChannels() {
  const response = await axios.get(`${apiBaseUrl}/api/channels`);
  state.channels = response.data.channels || [];
  renderChannels();
  updateStats();
}

async function loadStatus() {
  try {
    const response = await axios.get(`${apiBaseUrl}/api/status`);
    state.clientReady = Boolean(response.data.client_connected);
    state.stats.telegramStatus = state.clientReady ? 'Connected' : 'Disconnected';
    if (response.data.total_messages !== undefined) {
      state.stats.messages = response.data.total_messages;
    }
    if (response.data.messages_collected_today !== undefined) {
      state.stats.messagesToday = response.data.messages_collected_today;
    }
    if (response.data.mongodb_status) {
      state.stats.mongodbStatus = response.data.mongodb_status;
    }
    updateStats();

    const initButton = $('#init-client-btn');
    if (initButton) initButton.disabled = !response.data.credentials_loaded;

    const status = $('#client-status');
    if (status) {
      if (response.data.client_connected) {
        status.textContent = 'Telegram session restored';
      } else if (response.data.credentials_loaded) {
        status.textContent = 'Credentials loaded, connect to Telegram';
      } else {
        status.textContent = 'Client not initialized';
      }
    }

    if (response.data.credentials_loaded && !response.data.client_connected) {
      await initializeClient();
    }
  } catch (error) {
    showError(error.message);
  }
}

async function saveCredentials(event) {
  event.preventDefault();

  const apiId = $('#api-id')?.value.trim();
  const apiHash = $('#api-hash')?.value.trim();
  const phone = $('#phone')?.value.trim();

  try {
    const response = await axios.post(`${apiBaseUrl}/api/credentials`, {
      api_id: apiId,
      api_hash: apiHash,
      phone,
    });
    setActivity(response.data.message || 'Credentials saved');
    const initButton = $('#init-client-btn');
    if (initButton) initButton.disabled = false;
  } catch (error) {
    showError(error.response?.data?.error || error.message);
  }
}

async function initializeClient() {
  const status = $('#client-status');
  if (status) status.textContent = 'Connecting to Telegram...';

  try {
    const response = await axios.post(`${apiBaseUrl}/api/initialize`);
    state.clientReady = Boolean(response.data.success);
    updateStats();
    if (status) status.textContent = response.data.message || 'Client initialized';
    setActivity('Telegram client connected');
  } catch (error) {
    state.clientReady = false;
    updateStats();
    if (status) status.textContent = 'Client not initialized';
    showError(error.response?.data?.error || error.message);
  }
}

async function addChannel(event) {
  event.preventDefault();

  const input = $('#channel-link');
  const channelLink = input?.value.trim();
  if (!channelLink) return;

  try {
    const response = await axios.post(`${apiBaseUrl}/api/channels`, { link: channelLink });
    state.channels.push(response.data.channel);
    if (input) input.value = '';
    renderChannels();
    updateStats();
    setActivity(`Added channel ${response.data.channel?.title || channelLink}`);
  } catch (error) {
    showError(error.response?.data?.error || error.message);
  }
}

async function removeChannel(channelId) {
  try {
    await axios.delete(`${apiBaseUrl}/api/channels/${channelId}`);
    state.channels = state.channels.filter((channel) => String(channel.id) !== String(channelId));
    renderChannels();
    updateStats();
    setActivity(`Removed channel ${channelId}`);
  } catch (error) {
    showError(error.response?.data?.error || error.message);
  }
}

async function scrapeMessages(channelId) {
  try {
    const response = await axios.post(`${apiBaseUrl}/api/channels/${channelId}/scrape/messages`);
    state.stats.messages += response.data.count || 0;
    updateStats();
    setActivity(`Saved ${response.data.count || 0} messages to ${response.data.file}`);
  } catch (error) {
    showError(error.response?.data?.error || error.message);
  }
}

async function scrapeMembers(channelId) {
  try {
    const response = await axios.post(`${apiBaseUrl}/api/channels/${channelId}/scrape/members`);
    setActivity(`Saved ${response.data.count || 0} members to ${response.data.file}`);
  } catch (error) {
    showError(error.response?.data?.error || error.message);
  }
}

async function scrapeEntity(telegramId) {
  const button = document.querySelector(`button[data-action="scrape-entity"][data-id="${telegramId}"]`);
  if (button) button.disabled = true;
  try {
    const response = await axios.post(`${apiBaseUrl}/api/telegram-entities/${telegramId}/scrape`);
    setActivity(`Scraped ${response.data.messages_saved || 0} new messages from ${telegramId}.`);
    await loadTelegramEntities();
    await loadDashboard();
    await loadSchedulerStatus();
  } catch (error) {
    showExplorerAlert(error.response?.data?.error || error.message, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

function handleEntityActions(event) {
  const button = event.target.closest('button[data-action="scrape-entity"]');
  if (!button) return;
  scrapeEntity(button.dataset.id);
}

function handleChannelActions(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const action = button.dataset.action;
  const channelId = button.dataset.id;

  if (action === 'remove-channel') {
    removeChannel(channelId);
  }

  if (action === 'scrape-messages') {
    scrapeMessages(channelId);
  }

  if (action === 'scrape-members') {
    scrapeMembers(channelId);
  }

}

function initializeTabs() {
  const tabs = document.querySelectorAll('.sidebar li[data-tab]');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((item) => item.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((panel) => panel.classList.remove('active'));
      tab.classList.add('active');
      const targetTab = $(`#${tab.dataset.tab}-tab`);
      if (targetTab) targetTab.classList.add('active');
      if (tab.dataset.tab === 'telegram-explorer' && !state.explorerLoaded) {
        loadTelegramEntities();
      }
    });
  });
}

async function bootstrap() {
  initializeTabs();

  $('#credentials-form')?.addEventListener('submit', saveCredentials);
  $('#channel-form')?.addEventListener('submit', addChannel);
  $('#init-client-btn')?.addEventListener('click', initializeClient);
  $('#channels-container')?.addEventListener('click', handleChannelActions);
  $('#refresh-entities-btn')?.addEventListener('click', refreshTelegramEntities);
  $('#select-all-entities')?.addEventListener('click', () => setAllEntitySelections(true));
  $('#unselect-all-entities')?.addEventListener('click', () => setAllEntitySelections(false));
  $('#enable-entities')?.addEventListener('click', () => setAllEntitySelections(true));
  $('#disable-entities')?.addEventListener('click', () => setAllEntitySelections(false));
  $('#save-entity-selection')?.addEventListener('click', saveEntitySelection);
  $('#entity-table-body')?.addEventListener('change', handleEntityCheckbox);
  $('#entity-table-body')?.addEventListener('click', handleEntityActions);
  $('#start-selected-scraping')?.addEventListener('click', runSchedulerNow);
  $('#scheduler-form')?.addEventListener('submit', saveScheduler);
  $('#scheduler-run-now')?.addEventListener('click', runSchedulerNow);
  $('#scheduler-refresh-status')?.addEventListener('click', loadSchedulerStatus);

  let searchTimer;
  $('#entity-search')?.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(loadTelegramEntities, 250);
  });

  await loadStatus();
  await loadChannels();
  await loadSchedulerStatus();
  await loadDashboard();
}

document.addEventListener('DOMContentLoaded', bootstrap);
