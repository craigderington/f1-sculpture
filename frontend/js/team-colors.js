/**
 * F1 Team Color Definitions
 * Official brand colors for Formula 1 teams (2023-2025 seasons)
 */

const TEAM_COLORS = {
    // 2024-2025 Teams
    'Red Bull Racing': {
        primary: '#3671C6',    // Red Bull Blue
        secondary: '#FCD700',  // Yellow
        accent: '#1E1E1E'      // Dark
    },
    'Ferrari': {
        primary: '#E8002D',    // Rosso Corsa Red
        secondary: '#FFF200',  // Yellow
        accent: '#000000'      // Black
    },
    'Mercedes': {
        primary: '#27F4D2',    // Petronas Teal
        secondary: '#6CD3BF',  // Light Teal
        accent: '#000000'      // Black
    },
    'McLaren': {
        primary: '#E87800',    // Papaya Orange (muted)
        secondary: '#F09030',  // Light Orange
        accent: '#1E1E1E'      // Dark
    },
    'Aston Martin': {
        primary: '#229971',    // British Racing Green
        secondary: '#CEDC00',  // Lime
        accent: '#000000'      // Black
    },
    'Alpine': {
        primary: '#FF87BC',    // Pink
        secondary: '#2293D1',  // Blue
        accent: '#000000'      // Black
    },
    'Williams': {
        primary: '#64C4FF',    // Williams Blue
        secondary: '#041E42',  // Navy
        accent: '#FFFFFF'      // White
    },
    'RB': {
        primary: '#6692FF',    // AlphaTauri/RB Blue
        secondary: '#2B3E50',  // Dark Blue
        accent: '#FFFFFF'      // White
    },
    'Kick Sauber': {
        primary: '#52E252',    // Stake Green
        secondary: '#000000',  // Black
        accent: '#FFFFFF'      // White
    },
    'Haas F1 Team': {
        primary: '#B6BABD',    // Silver
        secondary: '#ED1C24',  // Red
        accent: '#000000'      // Black
    },

    // Legacy names (for backwards compatibility)
    'AlphaTauri': {
        primary: '#6692FF',
        secondary: '#2B3E50',
        accent: '#FFFFFF'
    },
    'Alfa Romeo': {
        primary: '#B12039',    // Alfa Red
        secondary: '#000000',
        accent: '#FFFFFF'
    },

    // Default fallback
    'default': {
        primary: '#E87800',    // McLaren Papaya (default, muted)
        secondary: '#F09030',
        accent: '#1E1E1E'
    }
};

/**
 * Get team colors by team name
 * @param {string} teamName - Full or partial team name
 * @returns {Object} Team color scheme
 */
export function getTeamColors(teamName) {
    if (!teamName) {
        return TEAM_COLORS.default;
    }

    // Exact match
    if (TEAM_COLORS[teamName]) {
        return TEAM_COLORS[teamName];
    }

    // Partial match (case-insensitive)
    const teamKey = Object.keys(TEAM_COLORS).find(key =>
        key.toLowerCase().includes(teamName.toLowerCase()) ||
        teamName.toLowerCase().includes(key.toLowerCase())
    );

    return teamKey ? TEAM_COLORS[teamKey] : TEAM_COLORS.default;
}

/**
 * Generate SVG dropdown arrow with custom color
 * @param {string} color - Hex color code (e.g., '#E87800')
 * @returns {string} SVG data URI
 */
function generateDropdownArrow(color) {
    // Remove '#' from hex color and URL encode
    const encodedColor = encodeURIComponent(color);

    return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='${encodedColor}' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`;
}

/**
 * Apply team color theme to the UI
 * @param {string} teamName - Team name
 */
export function applyTeamTheme(teamName) {
    const colors = getTeamColors(teamName);

    // Set CSS custom properties (variables) for dynamic theming
    const root = document.documentElement;
    root.style.setProperty('--theme-primary', colors.primary);
    root.style.setProperty('--theme-secondary', colors.secondary);
    root.style.setProperty('--theme-accent', colors.accent);

    // Update dropdown arrow colors to match theme
    const dropdownArrowSVG = generateDropdownArrow(colors.primary);
    const selects = document.querySelectorAll('select');
    selects.forEach(select => {
        select.style.backgroundImage = dropdownArrowSVG;
    });

    console.log(`Applied theme for ${teamName || 'default'}:`, colors);
}

/**
 * Reset to default theme
 */
export function resetTheme() {
    applyTeamTheme('default');
}

export default {
    getTeamColors,
    applyTeamTheme,
    resetTheme,
    TEAM_COLORS
};
