/**
 * UI Manager for Progress Overlay and Stage Indicators
 * Handles the visual progress feedback during sculpture generation
 */

class ProgressUI {
    constructor() {
        this.overlay = null;
        this.progressBar = null;
        this.progressText = null;
        this.progressStage = null;
        this.progressPercentage = null;
        this.cancelButton = null;
        this.currentTaskId = null;

        this.init();
    }

    /**
     * Initialize UI elements
     */
    init() {
        // Get or create overlay
        this.overlay = document.getElementById('loading-overlay');
        if (!this.overlay) {
            console.warn('Loading overlay not found in DOM');
            return;
        }

        this.progressBar = this.overlay.querySelector('.progress-bar');
        this.progressText = this.overlay.querySelector('.progress-text');
        this.progressStage = this.overlay.querySelector('.progress-stage');
        this.progressPercentage = this.overlay.querySelector('.progress-percentage');
        this.cancelButton = this.overlay.querySelector('.cancel-button');

        // Setup cancel button
        if (this.cancelButton) {
            this.cancelButton.addEventListener('click', () => this.handleCancel());
        }
    }

    /**
     * Show loading overlay
     */
    show(taskId = null) {
        if (this.overlay) {
            this.currentTaskId = taskId;
            this.overlay.classList.add('active');
            this.reset();
        }
    }

    /**
     * Hide loading overlay
     */
    hide() {
        if (this.overlay) {
            this.overlay.classList.remove('active');
            this.currentTaskId = null;
            this.reset();
        }
    }

    /**
     * Update progress with stage information
     */
    updateProgress(stage, progress, message, metadata = {}) {
        // Update progress bar directly (no animation - too fast when cached)
        if (this.progressBar) {
            this.progressBar.style.width = `${progress}%`;
            this.progressBar.setAttribute('aria-valuenow', progress);

            // Update stage-specific styling
            this.progressBar.className = 'progress-bar';
            if (stage) {
                this.progressBar.classList.add(`stage-${stage}`);
            }
        }

        // Update percentage
        if (this.progressPercentage) {
            this.progressPercentage.textContent = `${progress}%`;
        }

        // Update stage indicator with full session details
        if (stage) {
            this.updateStageIndicator(stage, metadata);
        }

        // Update message
        if (this.progressText) {
            this.progressText.textContent = message || '';
        }
    }

    /**
     * Convert session code to friendly name
     */
    getFriendlySessionName(sessionCode) {
        const sessionNames = {
            'FP1': 'Free Practice 1',
            'FP2': 'Free Practice 2',
            'FP3': 'Free Practice 3',
            'Q': 'Qualifying',
            'R': 'Race',
            'S': 'Sprint',
            'SS': 'Sprint Shootout',
            'SQ': 'Sprint Qualifying'
        };
        return sessionNames[sessionCode] || sessionCode;
    }

    /**
     * Update stage indicator with icon and label
     */
    updateStageIndicator(stage, metadata = {}) {
        const stages = {
            'loading_session': {
                icon: '📥',
                label: 'Loading Session Data',
                color: '#3b82f6'
            },
            'extracting_telemetry': {
                icon: '🔍',
                label: 'Extracting Telemetry',
                color: '#f59e0b'
            },
            'processing_sculpture': {
                icon: '⚙️',
                label: 'Processing G-Forces',
                color: '#10b981'
            }
        };

        const stageInfo = stages[stage] || {
            icon: '⏳',
            label: 'Processing...',
            color: '#6b7280'
        };

        if (this.progressStage) {
            // Build session details header if metadata is available
            let sessionDetails = '';
            if (metadata.year && metadata.event_name && metadata.session_name) {
                const friendlySessionName = this.getFriendlySessionName(metadata.session_name);
                sessionDetails = `
                    <div class="session-details">
                        ${metadata.year} ${metadata.event_name} - ${friendlySessionName}
                        ${metadata.session_date ? `<br><span class="session-date">${metadata.session_date}</span>` : ''}
                    </div>
                `;
            }

            this.progressStage.innerHTML = `
                ${sessionDetails}
                <div style="display: flex; align-items: center; gap: 15px;">
                    <span class="stage-icon">${stageInfo.icon}</span>
                    <span class="stage-label">${stageInfo.label}</span>
                </div>
            `;
        }

        // Update progress bar color
        if (this.progressBar) {
            this.progressBar.style.background = `linear-gradient(90deg, ${stageInfo.color}, ${this.lightenColor(stageInfo.color)})`;
        }
    }

    /**
     * Show error state
     */
    showError(message, allowRetry = true) {
        if (!this.overlay) return;

        const container = this.overlay.querySelector('.progress-container');
        if (!container) return;

        container.innerHTML = `
            <div class="error-container">
                <div class="error-icon">❌</div>
                <div class="error-message">${message}</div>
                ${allowRetry ? '<button onclick="window.location.reload()">Retry</button>' : ''}
                <button onclick="progressUI.hide()" style="margin-left: 10px;">Close</button>
            </div>
        `;
    }

    /**
     * Show success state (brief)
     */
    showSuccess(message = 'Sculpture generated successfully!') {
        if (this.progressText) {
            this.progressText.textContent = message;
        }

        if (this.progressBar) {
            this.progressBar.style.width = '100%';
            this.progressBar.style.background = 'linear-gradient(90deg, #10b981, #34d399)';
        }

        if (this.progressStage) {
            this.progressStage.innerHTML = `
                <span class="stage-icon">✅</span>
                <span class="stage-label">Complete</span>
            `;
        }

        // Auto-hide after 1 second
        setTimeout(() => this.hide(), 1000);
    }

    /**
     * Reset progress UI to initial state
     */
    reset() {
        if (this.progressBar) {
            this.progressBar.style.width = '0%';
            this.progressBar.className = 'progress-bar';
        }

        if (this.progressText) {
            this.progressText.textContent = '';
        }

        if (this.progressStage) {
            this.progressStage.innerHTML = '';
        }

        if (this.progressPercentage) {
            this.progressPercentage.textContent = '0%';
        }
    }

    /**
     * Handle cancel button click
     */
    handleCancel() {
        if (this.currentTaskId && window.api) {
            console.log('Cancelling task:', this.currentTaskId);
            window.api.cancelTask(this.currentTaskId)
                .then(() => {
                    this.showError('Task cancelled by user', false);
                    setTimeout(() => this.hide(), 2000);
                })
                .catch(error => {
                    console.error('Failed to cancel task:', error);
                });
        } else {
            this.hide();
        }
    }

    /**
     * Utility: Lighten a hex color
     */
    lightenColor(color, percent = 20) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) + amt;
        const G = (num >> 8 & 0x00FF) + amt;
        const B = (num & 0x0000FF) + amt;
        return '#' + (
            0x1000000 +
            (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
            (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
            (B < 255 ? (B < 1 ? 0 : B) : 255)
        ).toString(16).slice(1);
    }
}

export default ProgressUI;
