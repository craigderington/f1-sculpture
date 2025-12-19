/**
 * F1 G-Force Sculpture Gallery - Main Application
 * Orchestrates the async workflow with WebSocket progress updates
 */

import F1API from './api.js';
import TaskWebSocket from './websocket.js';
import ProgressUI from './ui.js';
import SceneManager from './scene.js';
import { applyTeamTheme } from './team-colors.js';

class F1SculptureApp {
    constructor() {
        this.api = new F1API();
        this.progressUI = new ProgressUI();
        this.sceneManager = new SceneManager('canvas-container');
        this.currentWebSocket = null;
        this.pollingInterval = null;

        // Cache for driver lists (so Reset Driver is instant)
        this.driverCache = {};

        // Make API available globally for cancel button
        window.api = this.api;
        window.progressUI = this.progressUI;

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
        const driverSelect = document.getElementById('driver');

        try {
            // Show loading state
            eventSelect.innerHTML = '<option value="">Loading events...</option>';
            eventSelect.disabled = true;
            sessionSelect.innerHTML = '<option value="">Select event first...</option>';
            driverSelect.innerHTML = '<option value="">Select session first...</option>';

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
        const driverSelect = document.getElementById('driver');

        try {
            // Show loading state
            sessionSelect.innerHTML = '<option value="">Loading sessions...</option>';
            sessionSelect.disabled = true;
            driverSelect.innerHTML = '<option value="">Select session first...</option>';

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
        const driverSelect = document.getElementById('driver');
        const cacheKey = `${year}-${round}-${session}`;

        try {
            // Check if we have cached drivers
            if (this.driverCache[cacheKey]) {
                console.log('Loading drivers from cache (instant!)');
                this.populateDriverDropdown(this.driverCache[cacheKey]);
                return;
            }

            // Show loading state (can take 30-60s for first load)
            driverSelect.innerHTML = '<option value="">Loading drivers (may take up to 60s)...</option>';
            driverSelect.disabled = true;

            const data = await this.api.getDrivers(year, round, session);

            // Cache the driver list
            this.driverCache[cacheKey] = data.drivers;

            this.populateDriverDropdown(data.drivers);

            console.log(`Loaded ${data.drivers.length} drivers (cached for future)`);
        } catch (error) {
            console.error('Error loading drivers:', error);
            driverSelect.innerHTML = '<option value="">Error loading drivers</option>';
            driverSelect.disabled = false;
        }
    }

    /**
     * Populate driver dropdown from driver list
     */
    populateDriverDropdown(drivers) {
        const driverSelect = document.getElementById('driver');

        driverSelect.innerHTML = '<option value="">Select a driver...</option>';
        drivers.forEach(driver => {
            const option = document.createElement('option');
            option.value = driver.abbreviation;
            option.textContent = `#${driver.number} ${driver.fullName} - ${driver.abbreviation} (${driver.teamName})`;
            driverSelect.appendChild(option);
        });
        driverSelect.disabled = false;

        // Add change listener to update reset button visibility
        driverSelect.addEventListener('change', () => {
            this.updateResetButtonVisibility();
        });
    }

    /**
     * Generate sculpture (async workflow)
     */
    async generateSculpture() {
        const year = parseInt(document.getElementById('year').value);
        const round = parseInt(document.getElementById('event').value);
        const session = document.getElementById('session').value;
        const driver = document.getElementById('driver').value;

        if (!year || !round || !session || !driver) {
            alert('Please select all fields');
            return;
        }

        console.log(`Generating sculpture: ${year} R${round} ${session} - ${driver}`);

        try {
            // Submit task
            const response = await this.api.submitSculptureTask(year, round, session, driver);
            const taskId = response.task_id;

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

        // Build and render sculpture
        this.sceneManager.buildSculpture(sculptureData);
        this.sceneManager.resetCamera();

        // Update stats panel
        this.updateStats(sculptureData);

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
     * Update statistics panel
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
        const driverSelect = document.getElementById('driver');
        driverSelect.innerHTML = '<option value="">Select a driver...</option>';

        // Reload drivers for the current session
        const year = document.getElementById('year').value;
        const round = document.getElementById('event').value;
        const session = document.getElementById('session').value;

        if (year && round && session) {
            this.loadDrivers(year, round, session);
        }

        // Update reset button visibility
        this.updateResetButtonVisibility();

        console.log('Driver selection reset');
    }

    /**
     * Reset session and driver selections
     */
    resetSession() {
        const sessionSelect = document.getElementById('session');
        const driverSelect = document.getElementById('driver');

        sessionSelect.innerHTML = '<option value="">Select a session...</option>';
        driverSelect.innerHTML = '<option value="">Select session first...</option>';

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
        const driverSelect = document.getElementById('driver');
        const resetDriverBtn = document.getElementById('reset-driver');
        const resetSessionBtn = document.getElementById('reset-session');

        const hasSession = sessionSelect.value !== '';
        const hasDriver = driverSelect.value !== '';

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
