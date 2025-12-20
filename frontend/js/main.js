/**
 * F1 G-Force Sculpture Gallery - Main Application
 * Orchestrates the async workflow with WebSocket progress updates
 */

import F1API from './api.js';
import TaskWebSocket from './websocket.js';
import ProgressUI from './ui.js';
import SceneManager from './scene.js';
import { applyTeamTheme, getTeamColors } from './team-colors.js';

class F1SculptureApp {
    constructor() {
        this.api = new F1API();
        this.progressUI = new ProgressUI();
        this.sceneManager = new SceneManager('canvas-container');
        this.currentWebSocket = null;
        this.pollingInterval = null;

        // Cache for driver lists (so Reset Driver is instant)
        this.driverCache = {};

        // Multi-driver comparison state
        this.comparisonMode = false;
        this.selectedDrivers = new Set();

        // Make components available globally
        window.api = this.api;
        window.progressUI = this.progressUI;
        window.sceneManager = this.sceneManager; // For tooltip close button
        window.f1App = this; // Make app instance available to scene manager

        this.init();
    }

    /**
     * Initialize application
     */
    async init() {
        console.log('F1 Sculpture Gallery - Async Edition');

        // Setup event listeners
        this.setupEventListeners();

        // Initialize reset button visibility
        this.updateResetButtonVisibility();

        // Load initial data
        await this.loadInitialData();

        // Check backend health
        this.checkHealth();
    }

    /**
     * Setup UI event listeners
     */
    setupEventListeners() {
        // Year selection
        document.getElementById('year').addEventListener('change', async (e) => {
            await this.loadEvents(e.target.value);
        });

        // Event selection
        document.getElementById('event').addEventListener('change', async (e) => {
            const year = document.getElementById('year').value;
            const round = e.target.value;
            if (round) {
                await this.loadSessions(year, round);
            }
        });

        // Session selection
        document.getElementById('session').addEventListener('change', async (e) => {
            const year = document.getElementById('year').value;
            const round = document.getElementById('event').value;
            const session = e.target.value;
            if (session) {
                await this.loadDrivers(year, round, session);
            }
            this.updateResetButtonVisibility();
        });

        // Generate sculpture button
        document.getElementById('load-sculpture').addEventListener('click', () => {
            this.generateSculpture();
        });

        // Reset camera button
        document.getElementById('reset-camera').addEventListener('click', () => {
            this.sceneManager.resetCamera();
        });

        // Reset driver button
        document.getElementById('reset-driver').addEventListener('click', () => {
            this.resetDriver();
        });

        // Reset session button
        document.getElementById('reset-session').addEventListener('click', () => {
            this.resetSession();
        });

        // Clear drivers button
        document.getElementById('clear-drivers').addEventListener('click', () => {
            this.clearDriverSelection();
        });

        // Toggle controls button
        document.getElementById('toggle-controls').addEventListener('click', () => {
            document.getElementById('controls').classList.toggle('hidden');
        });

        // Toggle stats panel
        document.getElementById('toggle-stats').addEventListener('click', () => {
            this.toggleStats();
        });
    }

    /**
     * Load initial data (2024 events)
     */
    async loadInitialData() {
        const year = document.getElementById('year').value;
        await this.loadEvents(year);
    }

    /**
     * Load events for a year
     */
    async loadEvents(year) {
        const eventSelect = document.getElementById('event');
        const sessionSelect = document.getElementById('session');
        const driverListContainer = document.getElementById('driver-list');

        try {
            // Show loading state
            eventSelect.innerHTML = '<option value="">Loading events...</option>';
            eventSelect.disabled = true;
            sessionSelect.innerHTML = '<option value="">Select event first...</option>';
            driverListContainer.innerHTML = '';
            driverListContainer.classList.add('empty');

            const events = await this.api.getEvents(year);

            eventSelect.innerHTML = '<option value="">Select a Grand Prix...</option>';
            events.forEach(event => {
                const option = document.createElement('option');
                option.value = event.round;
                option.textContent = `${event.name} (${event.location})`;
                eventSelect.appendChild(option);
            });
            eventSelect.disabled = false;

            console.log(`Loaded ${events.length} events for ${year}`);
        } catch (error) {
            console.error('Error loading events:', error);
            eventSelect.innerHTML = '<option value="">Error loading events</option>';
            eventSelect.disabled = false;
            alert('Failed to load events. Make sure the backend is running.');
        }
    }

    /**
     * Load sessions for an event
     */
    async loadSessions(year, round) {
        const sessionSelect = document.getElementById('session');
        const driverListContainer = document.getElementById('driver-list');

        try {
            // Show loading state
            sessionSelect.innerHTML = '<option value="">Loading sessions...</option>';
            sessionSelect.disabled = true;
            driverListContainer.innerHTML = '';
            driverListContainer.classList.add('empty');

            const data = await this.api.getSessions(year, round);

            sessionSelect.innerHTML = '<option value="">Select a session...</option>';
            data.sessions.forEach(session => {
                const option = document.createElement('option');
                option.value = session.name;
                option.textContent = session.fullName;
                sessionSelect.appendChild(option);
            });
            sessionSelect.disabled = false;

            console.log(`Loaded ${data.sessions.length} sessions`);
        } catch (error) {
            console.error('Error loading sessions:', error);
            sessionSelect.innerHTML = '<option value="">Error loading sessions</option>';
            sessionSelect.disabled = false;
        }
    }

    /**
     * Load drivers for a session
     */
    async loadDrivers(year, round, session) {
        const driverListContainer = document.getElementById('driver-list');
        const cacheKey = `${year}-${round}-${session}`;

        try {
            // Check if we have cached drivers
            if (this.driverCache[cacheKey]) {
                console.log('Loading drivers from cache (instant!)');
                this.populateDriverCheckboxes(this.driverCache[cacheKey]);
                return;
            }

            // Show loading state (can take 30-60s for first load)
            driverListContainer.innerHTML = '<div class="loading-drivers">Loading drivers (may take up to 60s)...</div>';
            driverListContainer.classList.remove('empty');

            const data = await this.api.getDrivers(year, round, session);

            // Cache the driver list
            this.driverCache[cacheKey] = data.drivers;

            this.populateDriverCheckboxes(data.drivers);

            console.log(`Loaded ${data.drivers.length} drivers (cached for future)`);
        } catch (error) {
            console.error('Error loading drivers:', error);
            driverListContainer.innerHTML = '<div class="error-loading">Error loading drivers</div>';
        }
    }

    /**
     * Populate driver checkboxes from driver list
     */
    populateDriverCheckboxes(drivers) {
        const driverListContainer = document.getElementById('driver-list');

        // Clear existing
        driverListContainer.innerHTML = '';
        driverListContainer.classList.remove('empty');
        this.selectedDrivers.clear();

        drivers.forEach(driver => {
            const driverItem = document.createElement('div');
            driverItem.className = 'driver-item';
            driverItem.dataset.driverCode = driver.abbreviation;
            driverItem.dataset.teamName = driver.teamName;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `driver-${driver.abbreviation}`;
            checkbox.value = driver.abbreviation;
            checkbox.addEventListener('change', (e) => this.handleDriverSelection(e, driver));

            const label = document.createElement('label');
            label.htmlFor = checkbox.id;
            label.textContent = `#${driver.number} ${driver.fullName} - ${driver.abbreviation} (${driver.teamName})`;

            driverItem.appendChild(checkbox);
            driverItem.appendChild(label);

            // Click anywhere on item to toggle
            driverItem.addEventListener('click', (e) => {
                if (e.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change'));
                }
            });

            driverListContainer.appendChild(driverItem);
        });

        this.updateDriverCount();
        this.updateResetButtonVisibility();
    }

    /**
     * Handle driver selection/deselection
     */
    handleDriverSelection(event, driver) {
        const checkbox = event.target;
        const driverItem = checkbox.closest('.driver-item');

        if (checkbox.checked) {
            // Check max limit (5 drivers)
            if (this.selectedDrivers.size >= 5) {
                checkbox.checked = false;
                alert('Maximum 5 drivers allowed for comparison');
                return;
            }

            this.selectedDrivers.add({
                code: driver.abbreviation,
                teamName: driver.teamName
            });
            driverItem.classList.add('selected');
        } else {
            // Remove from selection
            const toRemove = Array.from(this.selectedDrivers).find(d => d.code === driver.abbreviation);
            if (toRemove) {
                this.selectedDrivers.delete(toRemove);
            }
            driverItem.classList.remove('selected');
        }

        this.updateDriverCount();
        this.updateResetButtonVisibility();

        console.log('Selected drivers:', Array.from(this.selectedDrivers).map(d => d.code));
    }

    /**
     * Update driver count label
     */
    updateDriverCount() {
        const countElement = document.getElementById('driver-count');
        const clearButton = document.getElementById('clear-drivers');
        const count = this.selectedDrivers.size;

        if (count === 0) {
            countElement.textContent = '0 selected';
            clearButton.classList.add('hidden');
        } else if (count === 1) {
            countElement.textContent = '1 selected';
            clearButton.classList.remove('hidden');
        } else {
            countElement.textContent = `${count} selected (comparison mode)`;
            clearButton.classList.remove('hidden');
        }

        // Update comparison mode flag
        this.comparisonMode = count > 1;
    }

    /**
     * Clear all driver selections
     */
    clearDriverSelection() {
        // Uncheck all checkboxes
        const checkboxes = document.querySelectorAll('.driver-item input[type="checkbox"]');
        checkboxes.forEach(cb => {
            cb.checked = false;
            cb.closest('.driver-item').classList.remove('selected');
        });

        this.selectedDrivers.clear();
        this.updateDriverCount();
        this.updateResetButtonVisibility();

        console.log('Cleared all driver selections');
    }

    /**
     * Generate sculpture (async workflow)
     */
    async generateSculpture() {
        const year = parseInt(document.getElementById('year').value);
        const round = parseInt(document.getElementById('event').value);
        const session = document.getElementById('session').value;

        if (!year || !round || !session) {
            alert('Please select year, event, and session');
            return;
        }

        // Validate driver selection
        const driverCodes = Array.from(this.selectedDrivers).map(d => d.code);

        if (driverCodes.length === 0) {
            alert('Please select at least one driver');
            return;
        }

        console.log(`Generating sculpture: ${year} R${round} ${session} - ${driverCodes.join(', ')}`);

        try {
            let response, taskId;

            // Branch logic: single vs comparison
            if (driverCodes.length === 1) {
                // Single driver task
                response = await this.api.submitSculptureTask(year, round, session, driverCodes[0]);
                taskId = response.task_id;
            } else {
                // Multi-driver comparison task
                response = await this.api.submitCompareTask(year, round, session, driverCodes);
                taskId = response.task_id;
            }

            console.log(`Task submitted: ${taskId}`);

            // Handle cached result
            if (taskId === 'cached') {
                console.log('Loading cached sculpture');
                this.progressUI.show();
                this.progressUI.updateProgress('processing_sculpture', 100, 'Loading from cache...');

                // Get cached result
                const result = await this.api.getTaskResult(taskId);
                if (result.result) {
                    this.onSculptureComplete(result.result);
                }
                return;
            }

            // Show progress UI
            this.progressUI.show(taskId);

            // Connect WebSocket for real-time updates
            this.connectWebSocket(taskId);

        } catch (error) {
            console.error('Error generating sculpture:', error);
            this.progressUI.showError(`Failed to generate sculpture: ${error.message}`);
        }
    }

    /**
     * Connect WebSocket for real-time progress updates
     */
    connectWebSocket(taskId) {
        // Cleanup existing connection
        if (this.currentWebSocket) {
            this.currentWebSocket.disconnect();
        }

        this.currentWebSocket = new TaskWebSocket(taskId, {
            onConnect: () => {
                console.log('WebSocket connected');
            },

            onProgress: (data) => {
                console.log('Progress update:', data);
                this.progressUI.updateProgress(data.stage, data.progress, data.message, data.metadata);
            },

            onSuccess: (result) => {
                console.log('Sculpture generation complete');
                this.onSculptureComplete(result);
            },

            onError: (error) => {
                console.error('Task failed:', error);
                this.progressUI.showError(`Sculpture generation failed: ${error}`);
            },

            onFallbackPolling: () => {
                console.log('Falling back to polling');
                this.startPolling(taskId);
            }
        });

        this.currentWebSocket.connect();

        // Start keep-alive pings
        const pingInterval = setInterval(() => {
            if (this.currentWebSocket && this.currentWebSocket.connected) {
                this.currentWebSocket.ping();
            } else {
                clearInterval(pingInterval);
            }
        }, 30000); // Ping every 30 seconds
    }

    /**
     * Polling fallback (if WebSocket fails)
     */
    async startPolling(taskId) {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }

        let attempts = 0;
        const maxAttempts = 60; // 60 * 2s = 2 minutes

        this.pollingInterval = setInterval(async () => {
            attempts++;

            if (attempts > maxAttempts) {
                clearInterval(this.pollingInterval);
                this.progressUI.showError('Task timeout - please try again');
                return;
            }

            try {
                const status = await this.api.getTaskStatus(taskId);

                if (status.status === 'PROGRESS') {
                    const metadata = {
                        year: status.year,
                        event_name: status.event_name,
                        session_name: status.session_name,
                        session_date: status.session_date,
                        driver: status.driver
                    };
                    this.progressUI.updateProgress(
                        status.stage,
                        status.progress,
                        status.message,
                        metadata
                    );
                } else if (status.status === 'SUCCESS') {
                    clearInterval(this.pollingInterval);
                    const result = await this.api.getTaskResult(taskId);
                    this.onSculptureComplete(result.result);
                } else if (status.status === 'FAILURE') {
                    clearInterval(this.pollingInterval);
                    this.progressUI.showError(status.error || 'Task failed');
                }
            } catch (error) {
                console.error('Polling error:', error);
            }
        }, 2000); // Poll every 2 seconds
    }

    /**
     * Handle sculpture completion
     */
    onSculptureComplete(sculptureData) {
        console.log('Rendering sculpture:', sculptureData);

        // Show brief success message
        this.progressUI.showSuccess();

        // Determine if comparison mode (sculptureData has 'sculptures' array vs single object)
        const isComparison = sculptureData.sculptures !== undefined;

        if (isComparison) {
            // Multi-driver comparison
            console.log(`Rendering ${sculptureData.sculptures.length} sculptures (comparison mode)`);

            this.sceneManager.buildMultipleSculptures(sculptureData.sculptures);
            this.sceneManager.resetCamera();

            // Update stats panel (tabbed view)
            this.updateStatsComparison(sculptureData.sculptures);

            // Apply first driver's team theme
            if (sculptureData.sculptures.length > 0 && sculptureData.sculptures[0].driver.teamName) {
                applyTeamTheme(sculptureData.sculptures[0].driver.teamName);
                console.log(`Applied theme for ${sculptureData.sculptures[0].driver.teamName}`);
            }
        } else {
            // Single driver
            this.sceneManager.buildSculpture(sculptureData);
            this.sceneManager.resetCamera();

            // Update stats panel (single view)
            this.updateStats(sculptureData);

            // Apply team color theme
            if (sculptureData.driver && sculptureData.driver.teamName) {
                applyTeamTheme(sculptureData.driver.teamName);
                console.log(`Applied theme for ${sculptureData.driver.teamName}`);
            }
        }

        // Cleanup
        if (this.currentWebSocket) {
            this.currentWebSocket.disconnect();
            this.currentWebSocket = null;
        }

        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    /**
     * Update statistics panel (single driver)
     */
    updateStats(data) {
        document.getElementById('stat-driver').textContent = data.driver.abbreviation;
        document.getElementById('stat-laptime').textContent = data.driver.lapTime;
        document.getElementById('stat-maxg').textContent = data.metadata.maxGForce.toFixed(2) + 'G';
        document.getElementById('stat-avgg').textContent = data.metadata.avgGForce.toFixed(2) + 'G';
        document.getElementById('stat-speed').textContent = data.metadata.maxSpeed.toFixed(0) + ' km/h';

        // Apply team color theme
        if (data.driver && data.driver.teamName) {
            applyTeamTheme(data.driver.teamName);
            console.log(`Applied theme for ${data.driver.teamName}`);
        }
    }

    /**
     * Update statistics panel for comparison mode (tabbed interface)
     */
    updateStatsComparison(sculptures) {
        const infoPanel = document.getElementById('info');
        const statsContent = infoPanel.querySelector('.stats-content');

        // Build tabbed interface
        let tabsHTML = '<div class="stats-tabs">';
        let contentHTML = '';

        sculptures.forEach((sculpture, index) => {
            const driver = sculpture.driver;
            const isActive = index === 0 ? 'active' : '';

            // Tab button (will apply team color via JavaScript after render)
            tabsHTML += `
                <button class="stats-tab ${isActive}" data-tab="${driver.abbreviation}" data-team="${driver.teamName}">
                    ${driver.abbreviation}
                </button>
            `;

            // Tab content
            contentHTML += `
                <div class="stats-tab-content ${isActive}" data-tab="${driver.abbreviation}">
                    <div class="stat">
                        <span class="stat-label">Driver:</span>
                        <span class="stat-value">${driver.abbreviation}</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label">Lap Time:</span>
                        <span class="stat-value">${driver.lapTime}</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label">Max G-Force:</span>
                        <span class="stat-value">${sculpture.metadata.maxGForce.toFixed(2)}G</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label">Avg G-Force:</span>
                        <span class="stat-value">${sculpture.metadata.avgGForce.toFixed(2)}G</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label">Max Speed:</span>
                        <span class="stat-value">${sculpture.metadata.maxSpeed.toFixed(0)} km/h</span>
                    </div>
                </div>
            `;
        });

        tabsHTML += '</div>';

        // Replace stats content
        statsContent.innerHTML = tabsHTML + contentHTML;

        // Apply team colors to tabs
        const tabs = statsContent.querySelectorAll('.stats-tab');
        tabs.forEach(tab => {
            const teamName = tab.dataset.team;
            if (teamName) {
                const teamColors = getTeamColors(teamName);

                // Apply team color to each tab
                if (tab.classList.contains('active')) {
                    tab.style.backgroundColor = teamColors.primary;
                    tab.style.borderColor = teamColors.primary;
                } else {
                    tab.style.backgroundColor = 'transparent';
                    tab.style.borderColor = teamColors.primary;
                    tab.style.color = teamColors.primary;
                }
            }

            // Add click handler
            tab.addEventListener('click', () => {
                // Remove active from all
                tabs.forEach(t => {
                    t.classList.remove('active');
                    const tTeamName = t.dataset.team;
                    if (tTeamName) {
                        const tTeamColors = getTeamColors(tTeamName);
                        t.style.backgroundColor = 'transparent';
                        t.style.borderColor = tTeamColors.primary;
                        t.style.color = tTeamColors.primary;
                    }
                });
                statsContent.querySelectorAll('.stats-tab-content').forEach(c => c.classList.remove('active'));

                // Activate clicked tab
                tab.classList.add('active');
                const tabTeamName = tab.dataset.team;
                if (tabTeamName) {
                    const tabTeamColors = getTeamColors(tabTeamName);
                    tab.style.backgroundColor = tabTeamColors.primary;
                    tab.style.borderColor = tabTeamColors.primary;
                    tab.style.color = '#000';
                }

                const tabId = tab.dataset.tab;
                statsContent.querySelector(`.stats-tab-content[data-tab="${tabId}"]`).classList.add('active');
            });
        });

        console.log(`Stats panel updated with ${sculptures.length} driver tabs`);
    }

    /**
     * Check backend health
     */
    async checkHealth() {
        try {
            const health = await this.api.healthCheck();
            console.log('Backend health:', health);

            if (health.redis !== 'healthy' || health.celery === 'unhealthy') {
                console.warn('Backend services may not be fully operational');
            }
        } catch (error) {
            console.error('Health check failed:', error);
        }
    }

    /**
     * Reset driver selection
     */
    resetDriver() {
        // Clear all selections
        this.clearDriverSelection();

        // Clear sculptures from 3D scene
        this.sceneManager.disposeSculpture();

        // Clear stats panel
        this.clearStats();

        // Reload drivers for the current session
        const year = document.getElementById('year').value;
        const round = document.getElementById('event').value;
        const session = document.getElementById('session').value;

        if (year && round && session) {
            this.loadDrivers(year, round, session);
        }

        console.log('Driver selection reset and sculptures cleared');
    }

    /**
     * Callback when a sculpture is removed from the scene
     */
    onSculptureRemoved(driverCode) {
        console.log('App notified of sculpture removal:', driverCode);

        // Uncheck the driver in the selection list
        const driverList = document.getElementById('driver-list');
        if (driverList) {
            const driverItems = driverList.querySelectorAll('.driver-item');
            driverItems.forEach(item => {
                const checkbox = item.querySelector('input[type="checkbox"]');
                const label = item.querySelector('label');

                // Check if this is the removed driver
                if (label && label.textContent.includes(driverCode)) {
                    checkbox.checked = false;
                    item.classList.remove('selected');
                }
            });
        }

        // Remove from selectedDrivers set
        const toRemove = Array.from(this.selectedDrivers).find(d => d.code === driverCode);
        if (toRemove) {
            this.selectedDrivers.delete(toRemove);
        }

        // Update driver count
        this.updateDriverCount();

        // Remove tab from stats panel if in comparison mode
        if (this.comparisonMode) {
            const statsContent = document.querySelector('.stats-content');
            if (statsContent) {
                // Remove the tab button
                const tab = statsContent.querySelector(`.stats-tab[data-tab="${driverCode}"]`);
                if (tab) tab.remove();

                // Remove the tab content
                const tabContent = statsContent.querySelector(`.stats-tab-content[data-tab="${driverCode}"]`);
                if (tabContent) tabContent.remove();

                // If this was the active tab, activate the first remaining tab
                const remainingTabs = statsContent.querySelectorAll('.stats-tab');
                if (remainingTabs.length > 0 && !statsContent.querySelector('.stats-tab.active')) {
                    remainingTabs[0].click();
                }
            }

            // If only one sculpture left, switch to single mode
            if (this.sceneManager.sculptures.size === 1) {
                console.log('Only one sculpture remaining, switching to single mode');
                this.comparisonMode = false;
            }

            // If no sculptures left, clear stats
            if (this.sceneManager.sculptures.size === 0) {
                this.clearStats();
            }
        }
    }

    /**
     * Clear stats panel
     */
    clearStats() {
        const statElements = {
            'stat-driver': '-',
            'stat-laptime': '-',
            'stat-maxg': '-',
            'stat-avgg': '-',
            'stat-speed': '-'
        };

        for (const [id, value] of Object.entries(statElements)) {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        }

        // Clear comparison stats if they exist
        const statsContent = document.querySelector('.stats-content');
        if (statsContent && statsContent.querySelector('.stats-tabs')) {
            // Restore original stats structure with interaction hint
            statsContent.innerHTML = `
                <div class="stat">
                    <span class="stat-label">Driver:</span>
                    <span class="stat-value" id="stat-driver">-</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Lap Time:</span>
                    <span class="stat-value" id="stat-laptime">-</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Max G-Force:</span>
                    <span class="stat-value" id="stat-maxg">-</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Avg G-Force:</span>
                    <span class="stat-value" id="stat-avgg">-</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Max Speed:</span>
                    <span class="stat-value" id="stat-speed">-</span>
                </div>
                <div class="interaction-hint">
                    <div class="hint-icon">💡</div>
                    <div class="hint-text">
                        <strong>Interactive Features:</strong><br>
                        • Click on ribbons for G-force data<br>
                        • Hover over labels and click × to remove
                    </div>
                </div>
            `;
        }
    }

    /**
     * Reset session and driver selections
     */
    resetSession() {
        const sessionSelect = document.getElementById('session');
        const driverListContainer = document.getElementById('driver-list');

        sessionSelect.innerHTML = '<option value="">Select a session...</option>';
        driverListContainer.innerHTML = '';
        driverListContainer.classList.add('empty');

        // Clear driver selections
        this.selectedDrivers.clear();
        this.updateDriverCount();

        // Reload sessions for the current event
        const year = document.getElementById('year').value;
        const round = document.getElementById('event').value;

        if (year && round) {
            this.loadSessions(year, round);
        }

        // Update reset button visibility
        this.updateResetButtonVisibility();

        console.log('Session and driver selections reset');
    }

    /**
     * Toggle stats panel minimize/expand
     */
    toggleStats() {
        const infoPanel = document.getElementById('info');
        const toggleBtn = document.getElementById('toggle-stats');

        infoPanel.classList.toggle('minimized');

        // Update button icon and title
        if (infoPanel.classList.contains('minimized')) {
            toggleBtn.textContent = '▲';
            toggleBtn.title = 'Expand stats';
        } else {
            toggleBtn.textContent = '▼';
            toggleBtn.title = 'Minimize stats';
        }
    }

    /**
     * Update reset button visibility based on selections
     */
    updateResetButtonVisibility() {
        const sessionSelect = document.getElementById('session');
        const resetDriverBtn = document.getElementById('reset-driver');
        const resetSessionBtn = document.getElementById('reset-session');

        const hasSession = sessionSelect.value !== '';
        const hasDriver = this.selectedDrivers.size > 0;

        // Show reset driver button only if driver is selected
        if (hasDriver) {
            resetDriverBtn.classList.remove('hidden');
        } else {
            resetDriverBtn.classList.add('hidden');
        }

        // Show reset session button only if session is selected
        if (hasSession) {
            resetSessionBtn.classList.remove('hidden');
        } else {
            resetSessionBtn.classList.add('hidden');
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new F1SculptureApp();
});
