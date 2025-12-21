# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

F1 G-Force Sculpture Gallery v2.1 - A production-ready 3D visualization tool that transforms Formula 1 telemetry data into interactive sculptures. **Async architecture** with Celery background tasks, Redis caching, WebSocket real-time updates, dynamic team theming, and Docker deployment.

## Architecture (v2.0 - Async Edition)

**Multi-tier async architecture:**
- **Frontend**: Modular JavaScript (ES6) + Three.js + WebSocket client
- **API**: FastAPI with async endpoints and WebSocket support
- **Workers**: Celery distributed task queue
- **Cache/Broker**: Redis for caching (24hr TTL) and message brokering
- **Data**: FastF1 library with file-based cache on Docker volume

### Key Changes from v1.0
- ✅ **Async task processing** - No more 30-60s blocking requests
- ✅ **Real-time progress** - WebSocket updates with 3 detailed stages
- ✅ **Smart caching** - Redis caches processed sculptures
- ✅ **Modular frontend** - Separate JS files (api.js, websocket.js, ui.js, scene.js, main.js, team-colors.js)
- ✅ **Docker deployment** - Full containerization with docker-compose
- ✅ **Production ready** - Docker container health checks, API health endpoints, monitoring, error handling

### New in v2.1
- ✅ **Multi-driver comparison** - Compare up to 5 drivers side-by-side with checkbox selection
  - Team-colored ribbons with G-force intensity blending
  - Individual labels and tabbed stats panel
  - Optimized backend task for shared session loading
- ✅ **Interactive G-force tooltips** - Click anywhere on ribbons to view detailed telemetry
  - Combined, longitudinal, and lateral G-forces
  - Speed and distance data at exact point
  - Raycasting-based mesh intersection detection
- ✅ **Removable sculptures** - Hover over labels to reveal × button for individual removal
  - Automatic cleanup of geometry, materials, and DOM elements
  - Real-time sync with driver selection and stats panel
- ✅ **Dynamic team theming** - Auto-applies official F1 team colors (10 teams) to entire UI
- ✅ **Granular progress bar** - Direct updates with 9 checkpoints (5%, 10%, 35%, 40%, 65%, 70%, 95%, 100%) with simple CSS transitions
- ✅ **Enhanced UI controls** - Smart reset buttons (driver/session), stats minimize toggle, custom F1 logo SVG
- ✅ **Floating footer** - Project info, GitHub link, author credit with theme-colored accents
- ✅ **Apache deployment** - Production-ready reverse proxy configuration with SSL and WebSocket support
- ✅ **Session details** - Full event/session/date metadata in progress overlay with friendly names
- ✅ **Modern dropdowns** - Custom styled selects with theme-colored arrows and hover effects
- ✅ **Frontend caching** - Instant driver reset using in-memory cache
- ✅ **Help panel & guide** - Comprehensive slide-in documentation panel from right side
  - What the sculpture represents (axes, colors, G-forces)
  - Visual G-force color legend with gradients (green→yellow→red)
  - Complete camera controls and interaction guide
  - Pro tips for best sessions and circuits
  - Credits section with GitHub link and author info (Craig Derington)
  - Opens with floating ? button, closes with × or ESC key
- ✅ **Comprehensive FAQ** - Full user documentation covering all features and troubleshooting

## File Structure

```
f1-sculpture/
├── backend/
│   ├── __init__.py
│   ├── main.py                          # FastAPI app with async endpoints + WebSocket
│   ├── config.py                        # Settings management (Pydantic)
│   ├── tasks/
│   │   ├── celery_app.py                # Celery configuration
│   │   └── sculpture_tasks.py           # Background tasks (3 stages)
│   ├── services/
│   │   ├── fastf1_service.py            # F1 data loading
│   │   ├── telemetry_processor.py       # G-force calculations
│   │   └── cache_service.py             # Redis abstraction
│   ├── models/
│   │   └── schemas.py                   # Pydantic request/response models
│   ├── websocket/
│   │   └── manager.py                   # WebSocket connection manager
│   └── requirements.txt
│
├── frontend/
│   ├── index.html                       # Main UI (uses modular JS)
│   ├── favicon.svg                      # Browser tab icon (race car in Papaya Orange)
│   ├── css/
│   │   └── styles.css                   # All styles with CSS variables for theming
│   ├── js/
│   │   ├── main.js                      # Application orchestrator with frontend caching
│   │   ├── api.js                       # HTTP API client
│   │   ├── websocket.js                 # WebSocket client with reconnect
│   │   ├── ui.js                        # Progress UI manager with direct updates
│   │   ├── scene.js                     # Three.js scene management
│   │   └── team-colors.js               # F1 team color definitions and theming
│   └── images/
│       └── f1-logo.svg                  # Custom F1 logo for title (red on black)
│
├── apache/
│   ├── f1-sculpture.conf                # Apache reverse proxy configuration
│   └── README.md                        # Apache deployment guide
│
├── docker/
│   ├── backend.Dockerfile               # Python 3.11 + dependencies
│   └── nginx.conf                       # Optional reverse proxy
│
├── docker-compose.yml                   # Multi-service orchestration
├── docker-compose.dev.yml               # Development overrides
├── Makefile                             # Common commands (make up, make logs, etc.)
├── .env.example                         # Environment variables template
├── CLAUDE.md                            # This file (technical documentation)
├── FAQ.md                               # Comprehensive user documentation
└── README.md                            # Quick start guide
```

## Backend Architecture

### API Layer (`backend/main.py`)

**Endpoint Categories:**

1. **Health & Monitoring**
   - `GET /` - Basic health check
   - `GET /health` - Comprehensive (API, Redis, Celery workers)

2. **Metadata (Synchronous - Fast)**
   - `GET /api/events/{year}` - List F1 events
   - `GET /api/sessions/{year}/{round}` - Available sessions
   - `GET /api/drivers/{year}/{round}/{session}` - Drivers in session (deprecated but works)

3. **Async Task Submission**
   - `POST /api/tasks/sculpture` - Submit single driver task
   - `POST /api/tasks/compare` - Submit multi-driver comparison

4. **Task Management**
   - `GET /api/tasks/{task_id}` - Poll status (fallback)
   - `GET /api/tasks/{task_id}/result` - Get result
   - `DELETE /api/tasks/{task_id}` - Cancel task
   - `WS /ws/tasks/{task_id}` - WebSocket real-time updates

5. **Cache Management**
   - `GET /api/cache/stats` - Cache statistics
   - `DELETE /api/cache/sculptures` - Clear sculpture cache (admin)

### Service Layer

**backend/services/fastf1_service.py** - F1 Data Loading
- `get_event_schedule(year)` - Fetch events
- `get_sessions_for_event(year, round)` - Fetch sessions
- `load_session(year, round, session)` - **BLOCKING** (30-60s first time)
- `get_drivers_in_session(session)` - Extract drivers
- `get_driver_fastest_lap_telemetry(session, driver)` - Extract telemetry

**backend/services/telemetry_processor.py** - Sculpture Generation
- `process_telemetry_to_sculpture(telemetry)` - Transform to 3D coordinates
- G-force calculation logic (longitudinal + lateral → combined magnitude)
- Coordinate normalization: `(value - mean) / std * 100`
- Z-axis scaling: `combined_g * 20`

**backend/services/cache_service.py** - Redis Caching
- `get_sculpture()` / `set_sculpture()` - Sculpture caching (24hr TTL)
- `get_session_metadata()` / `set_session_metadata()` - Session info caching
- `get_cache_stats()` - Monitoring
- All keys prefixed: `f1:sculpture:*`, `f1:session:*`

### Celery Tasks (`backend/tasks/sculpture_tasks.py`)

**Task: `generate_sculpture_task(year, round, session, driver)`**
- **Stage 1 (5% - 35%)**: `loading_session` - Load F1 session data (granular updates)
  - 5%: Initialize session
  - 10%: Download from F1 servers
  - 35%: Session loaded with full details
- **Stage 2 (40% - 65%)**: `extracting_telemetry` - Find driver and extract fastest lap
  - 40%: Find driver in session
  - 65%: Telemetry extracted
- **Stage 3 (70% - 95%)**: `processing_sculpture` - Calculate G-forces and build sculpture
  - 70%: Calculate G-forces
  - 95%: Finalize sculpture
- Uses `self.update_state()` to send progress updates with metadata (event, session, date) to WebSocket

**Task: `compare_drivers_task(year, round, session, drivers_list)`**
- **Optimization**: Loads session ONCE, processes multiple drivers
- Sequential vs Parallel: 40-70s (optimized) vs 90-120s (old way)
- Max 5 drivers per comparison

**Task: `load_session_metadata_task()`**
- Cache warming operation
- Pre-loads session without generating sculpture

### WebSocket Manager (`backend/websocket/manager.py`)

- `connect(websocket, task_id)` - Subscribe WebSocket to task updates
- `disconnect(websocket, task_id)` - Cleanup
- `broadcast_progress(task_id, stage, progress, message)` - Send progress update
- `broadcast_success(task_id, result)` - Send completion
- `broadcast_error(task_id, error)` - Send failure

**Connection Management:**
- Multiple WebSockets can subscribe to same task
- Automatic cleanup on disconnect
- Thread-safe with asyncio.Lock

## Frontend Architecture

### Modular Design (ES6 Modules)

**frontend/js/main.js** - Application Orchestrator
- `F1SculptureApp` class manages entire app lifecycle
- Handles UI events (year/event/session/driver selection)
- Orchestrates async workflow: Submit task → Connect WebSocket → Render sculpture
- Falls back to polling if WebSocket fails

**frontend/js/api.js** - HTTP Client
- `F1API` class wraps all backend endpoints
- Methods: `getEvents()`, `getSessions()`, `submitSculptureTask()`, `getTaskStatus()`, etc.
- Centralized error handling

**frontend/js/websocket.js** - WebSocket Client
- `TaskWebSocket` class for real-time updates
- Auto-reconnect with exponential backoff (5 attempts)
- Graceful fallback to polling if WebSocket unavailable
- Keep-alive pings every 30s

**frontend/js/ui.js** - Progress UI
- `ProgressUI` class manages loading overlay
- **Direct progress updates** with simple CSS transitions (0.3s) for smooth visual effect
- Works correctly for both fast (2-3s cached) and slow (30-60s first load) scenarios
- 3 stage indicators with icons, colors, and full session details:
  - 📥 Loading Session (blue) - Shows event name, session, date
  - 🔍 Extracting Telemetry (yellow) - Shows driver being processed
  - ⚙️ Processing Sculpture (green) - Shows G-force calculations
- Granular progress updates (5%, 10%, 35%, 40%, 65%, 70%, 95%, 100%)
- Error handling and cancel button

**frontend/js/scene.js** - Three.js Manager
- `SceneManager` class handles 3D rendering
- `buildSculpture(sculptureData)` - Creates TubeGeometry from vertices
- Camera controls (OrbitControls)
- Lighting setup (ambient + directional + accent)
- Memory management (dispose old sculptures)

**frontend/js/team-colors.js** - F1 Team Theming
- Official F1 team color definitions (2023-2025 seasons)
- `getTeamColors(teamName)` - Get team color scheme
- `applyTeamTheme(teamName)` - Apply colors to UI via CSS variables
- Supports 10 teams: Red Bull, Ferrari, Mercedes, McLaren, Aston Martin, Alpine, Williams, RB, Kick Sauber, Haas
- Dynamic theming updates entire UI (buttons, title, stats, footer, progress)

### Data Flow

```
User Action
  ↓
main.js: generateSculpture()
  ↓
api.js: submitSculptureTask() → POST /api/tasks/sculpture
  ↓
Backend: Check Redis cache
  ├─ If cached → Return immediately (task_id="cached")
  └─ If not → Submit to Celery queue → Return task_id
  ↓
websocket.js: Connect to WS /ws/tasks/{task_id}
  ↓
Celery Worker: Process task with granular progress updates
  ├─ Stage 1: Loading session → 5%, 10%, 35% (with event/session metadata)
  ├─ Stage 2: Extracting telemetry → 40%, 65%
  └─ Stage 3: Processing → 70%, 95%
  ↓
WebSocket: Broadcast progress with full metadata to frontend
  ↓
ui.js: Smooth progress animation + stage indicator with session details
  ↓
Task Complete → WebSocket sends result
  ↓
main.js: onSculptureComplete()
  ├─ ui.js: showSuccess() → Hide overlay
  ├─ scene.js: buildSculpture() → Render in Three.js
  ├─ Update stats panel
  └─ team-colors.js: Apply team theme based on driver's team

Frontend Caching (Driver Reset):
  User clicks "Reset Driver"
  ↓
  main.js: Check this.driverCache[`${year}-${round}-${session}`]
  ├─ If cached → Instant load from memory (0ms)
  └─ If not cached → Fetch from API (2-3s) and cache for future
```

## UI Features & Controls

### New Features (v2.1)

**1. F1 Logo SVG**
- Custom F1 logo (red on black) replaced emoji for consistent cross-platform rendering
- Properly aligned and sized in title bar next to "G-Force Sculpture"
- Located in `/frontend/images/f1-logo.svg`

**2. Smart Reset Buttons**
- **Reset Driver**: Clears driver selection, keeps session, instant reload from cache
- **Reset Session**: Clears both session and driver, keeps year/event
- Side-by-side layout for easy access
- **Smart visibility**: Only show when there's something to reset
  - Reset Driver button appears only when driver is selected
  - Reset Session button appears only when session is selected
- Uses frontend caching for instant driver list reload (0ms)

**3. Stats Panel Minimize/Expand**
- Toggle button (▼/▲) in stats panel header
- Smooth collapse animation
- Persists panel visibility state
- Useful for fullscreen sculpture viewing

**4. Dynamic Team Color Theming**
- **Automatic**: Applies team colors when sculpture loads
- **Comprehensive**: Updates all UI elements (title, buttons, stats, footer, progress bar, dropdown arrows)
- **Accurate**: Official team colors for 10 F1 teams (2023-2025)
- **CSS Variables**: Uses `--theme-primary`, `--theme-secondary`, `--theme-accent`
- **Readability**: Button hover uses black text for light team colors (e.g., Ferrari yellow)
- **Examples**:
  - McLaren → Papaya Orange (#E87800 muted)
  - Red Bull → Blue (#3671C6) + Yellow (#FCD700)
  - Ferrari → Rosso Corsa Red (#E8002D) + Yellow (#FFF200)
  - Mercedes → Petronas Teal (#27F4D2)
  - Aston Martin → British Racing Green (#229971)
  - Alpine → Pink (#FF87BC) + Blue (#2293D1)

**5. Floating Footer**
- Fixed position at bottom of viewport
- Simplified design: Project name and version only ("F1 G-Force Sculpture Gallery v2.1")
- Semi-transparent with theme-colored accents
- GitHub link and credits moved to help panel for cleaner UI

**6. Granular Progress Bar**
- **Direct Updates**: Simple CSS transitions (0.3s) for smooth visual effect without complex animations
- **Works Fast or Slow**: Optimized for both cached (2-3s) and first-time (30-60s) loads
- **Granular Updates**: 9 progress checkpoints (5%, 10%, 35%, 40%, 65%, 70%, 95%, 100%)
- **Session Details**: Displays full event name, friendly session type, and date during loading
  - No more cryptic codes: "Q" → "Qualifying", "R" → "Race", "S" → "Sprint Race"
- **Metadata Display**: Year, event name, session name, and session date prominently shown

**7. Help Panel & Documentation**
- **Floating Help Button**: Question mark (?) icon in bottom-right corner
  - Theme-colored circular button with hover effects
  - Fixed position, always accessible
- **Slide-in Panel**: 420px wide panel slides from right side with smooth animation
  - Full-height scrollable content with custom scrollbar
  - Backdrop blur effect for modern aesthetic
- **Comprehensive Sections**:
  - 📊 What Am I Looking At - Explains axes, height, colors
  - 🎨 G-Force Color Legend - Visual gradients with ranges and descriptions
  - G-Force Types - Longitudinal, lateral, combined definitions
  - 🎮 Camera Controls - Left/right click, scroll wheel
  - ✨ Interactive Features - Ribbon tooltips, label removal, multi-select
  - 💡 Pro Tips - Best sessions/circuits, caching behavior
  - 👨‍💻 Credits & Source - Craig Derington, GitHub link, FastF1 credit
- **Keyboard Support**: ESC key to close panel
- **Mobile Responsive**: Full-width on mobile devices

### UI Layout

```
┌──────────────────────────────────────────────────┐
│ [F1 Logo] G-Force Sculpture          [☰ Toggle] │  ← Title Bar (theme-colored)
│                                                  │
│ Controls Panel (left):                          │
│  - Year dropdown (styled, theme arrows)         │
│  - Grand Prix dropdown                          │
│  - Session dropdown (friendly names)            │
│  - Driver dropdown                              │
│  - [Generate Sculpture] (themed button)         │
│  - [Reset Driver] [Reset Session]               │  ← Smart visibility
│  - [Reset Camera]                               │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│                                                  │
│           3D Sculpture Rendering Area            │
│              (Three.js Canvas)                   │
│                                            [?]   │  ← Help button (bottom-right)
└──────────────────────────────────────────────────┘

                                    ┌───────────────┐
                                    │ Stats [▼]     │  ← Minimize toggle
                                    │ Driver: HAM   │  ← Theme-colored
                                    │ Lap: 1:23.456 │
                                    │ Max G: 4.2G   │
                                    │ Avg G: 2.1G   │
                                    │ Speed: 312km/h│
                                    └───────────────┘

┌──────────────────────────────────────────────────┐
│        F1 G-Force Sculpture Gallery v2.1         │  ← Footer (simplified, themed)
└──────────────────────────────────────────────────┘
```

## Development Commands

### Docker (Recommended)

```bash
# Start all services
make up                  # Production mode
make up-dev              # Development mode (hot reload, debug logs)

# View logs
make logs                # All services
make logs-api            # API only
make logs-worker         # Celery worker only

# Management
make restart             # Restart services
make down                # Stop services
make clean               # Stop and remove volumes

# Monitoring
make health              # Check API health
make flower              # Open Flower dashboard (Celery monitoring)
make status              # Show service status

# Development tools
make shell-api           # Shell access to API container
make shell-worker        # Shell access to worker container
make redis-cli           # Connect to Redis CLI
```

### Local Development (Without Docker)

```bash
# Terminal 1: Redis
redis-server

# Terminal 2: Celery Worker
cd backend
celery -A backend.tasks.celery_app worker --loglevel=info --concurrency=2

# Terminal 3: FastAPI
cd backend
uvicorn backend.main:app --reload

# Terminal 4: Frontend
cd frontend
python -m http.server 3000
```

## Key Technical Details

### FastF1 Caching Strategy

- **Location**: Docker volume `fastf1_cache:/app/cache/fastf1`
- **Format**: SQLite database + pickle files (FastF1's native format)
- **Shared**: API and Celery workers mount same volume
- **Persistence**: Survives container restarts, cleared with `make clean-cache`
- **NOT in Redis**: Too large, incompatible format

### Redis Caching Schema

```
# Processed sculptures (JSON)
f1:sculpture:{year}:{round}:{session}:{driver}  → Sculpture JSON (TTL: 24h)

# Session metadata (Hash)
f1:session:{year}:{round}:{session}:metadata    → Event info (TTL: 24h)
f1:session:{year}:{round}:{session}:drivers     → List of drivers (TTL: 24h)
f1:session:{year}:{round}:{session}:loaded      → Boolean flag (TTL: 24h)

# Celery task results (managed by Celery)
celery-task-meta-{task_id}                      → Task state + result (TTL: 1h)
```

### Frontend Caching Strategy

**Location**: `frontend/js/main.js` - In-memory JavaScript object

**Purpose**: Instant driver reset without re-fetching from API

**Implementation**:
```javascript
class F1SculptureApp {
    constructor() {
        this.driverCache = {};  // In-memory cache
    }

    async loadDrivers(year, round, session) {
        const cacheKey = `${year}-${round}-${session}`;

        // Check cache first
        if (this.driverCache[cacheKey]) {
            console.log('Loading drivers from cache (instant!)');
            this.populateDriverDropdown(this.driverCache[cacheKey]);
            return;
        }

        // Fetch from API and cache
        const data = await this.api.getDrivers(year, round, session);
        this.driverCache[cacheKey] = data.drivers;
        this.populateDriverDropdown(data.drivers);
    }
}
```

**Benefits**:
- **Instant Reset**: Reset Driver button loads instantly (0ms) from memory
- **Reduced API Calls**: No redundant requests to backend
- **Better UX**: No "Loading drivers..." delay when resetting
- **Simple Implementation**: No complex cache invalidation needed
- **Session-scoped**: Cache cleared when user changes session

### G-Force Calculation Logic

**Location**: `backend/services/telemetry_processor.py`

```python
# Longitudinal G (acceleration/braking)
long_g = np.gradient(speed_ms) / 9.81
long_g = np.clip(long_g * 10, -5, 5)

# Lateral G (from speed and curvature)
curvature = np.abs(np.gradient(dx) * dy - dx * np.gradient(dy))
lateral_g = (speed_ms ** 2) / (curvature * 9.81)
lateral_g = np.clip(lateral_g * 0.1, 0, 5)

# Combined magnitude
combined_g = np.sqrt(long_g**2 + lateral_g**2)

# Z-axis (height)
z = combined_g * 20  # Scale for visibility
```

### Performance Characteristics

- **First session load**: 30-60s (downloads from F1 APIs via FastF1)
- **Cached session load**: 2-3s (from FastF1 SQLite cache)
- **Cached sculpture**: <100ms (from Redis)
- **Telemetry extraction**: 5-10s first time, <100ms cached
- **G-force processing**: ~500ms (CPU-bound, NumPy operations)

### WebSocket vs Polling

**Primary: WebSocket**
- Low latency (<500ms)
- Bidirectional
- Server push
- Connection maintained for task duration

**Fallback: Polling**
- Triggered if WebSocket fails after 5 reconnect attempts
- Polls `GET /api/tasks/{task_id}` every 2 seconds
- Max 60 attempts (2 minutes)
- Less efficient but guaranteed to work

## Common Development Scenarios

### Adding a New Celery Task

1. Define task in `backend/tasks/sculpture_tasks.py`
2. Use `@celery_app.task(bind=True, base=CallbackTask)`
3. Call `self.update_state()` for progress updates
4. Add endpoint in `backend/main.py` to submit task
5. Update frontend `api.js` with new method

### Modifying G-Force Calculations

1. Edit `backend/services/telemetry_processor.py`
2. Update `process_telemetry_to_sculpture()` method
3. Clear sculpture cache: `make clean-cache` or `DELETE /api/cache/sculptures`
4. Regenerate sculptures to see changes

### Adding Custom Team Colors

1. Add team to `frontend/js/team-colors.js`:
   ```javascript
   const TEAM_COLORS = {
       'YourTeam': {
           primary: '#FF0000',
           secondary: '#FF4444',
           accent: '#000000'
       }
   };
   ```

2. Test by generating sculpture for driver from that team
3. All UI elements will automatically update with new colors

### Modern Dropdown Styling

The v2.1 update includes custom-styled dropdowns with modern aesthetics:

**Features**:
- Removed default browser styling (`appearance: none`)
- Custom SVG arrow icon that matches theme color
- Smooth hover effects with border color change
- Focus states with box-shadow
- Rounded corners for modern look

**Implementation** (`frontend/css/styles.css`):
```css
select {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23E87800' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    padding-right: 36px;
}

select:hover {
    border-color: var(--theme-primary);
    background-color: #252525;
    transform: translateY(-1px);
}
```

**Dynamic Arrow Color**: The SVG fill color can be updated dynamically via JavaScript to match the current theme.

### Adding New UI Progress Stage

1. Update task in `backend/tasks/sculpture_tasks.py`:
   ```python
   self.update_state(
       state='PROGRESS',
       meta={
           'stage': 'new_stage_name',
           'progress': 60,
           'message': 'Doing something...'
       }
   )
   ```

2. Add stage definition in `frontend/js/ui.js`:
   ```javascript
   const stages = {
       'new_stage_name': {
           icon: '🔧',
           label: 'Stage Label',
           color: '#ff6b6b'
       }
   }
   ```

3. Update CSS with stage-specific styling in `frontend/css/styles.css`:
   ```css
   .progress-bar.stage-new-stage-name {
       background: linear-gradient(90deg, #ff6b6b, #ee5a6f);
   }
   ```

### Debugging Celery Tasks

```bash
# View worker logs
make logs-worker

# Open Flower dashboard
make flower
# Navigate to http://localhost:5555

# Check task status manually
make redis-cli
> GET celery-task-meta-{task_id}

# View all Celery keys
> KEYS celery-*
```

### Testing WebSocket Connection

```javascript
// Browser console
const ws = new WebSocket('ws://localhost:8000/ws/tasks/test-123');
ws.onmessage = (event) => console.log('Received:', JSON.parse(event.data));
ws.onopen = () => console.log('Connected');
ws.onerror = (error) => console.error('Error:', error);
```

## Environment Variables

See `.env.example` for all options. Key variables:

```bash
# Redis
REDIS_URL=redis://redis:6379/0

# Celery
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/1
CELERY_WORKER_CONCURRENCY=2

# FastF1 Cache
FASTF1_CACHE_DIR=/app/cache/fastf1

# Cache TTLs
SCULPTURE_CACHE_TTL=86400  # 24 hours
SESSION_CACHE_TTL=86400    # 24 hours
TASK_RESULT_TTL=3600       # 1 hour

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost:80
```

## Testing

```bash
# Run all tests
make test

# Or manually
docker-compose exec api pytest backend/tests/

# Test specific module
docker-compose exec api pytest backend/tests/test_telemetry.py -v
```

## Troubleshooting

### "Task stuck in PENDING"
- Check Celery worker is running: `make logs-worker`
- Check Redis connection: `make redis-cli` → `PING`
- View Flower dashboard: `make flower`

### "WebSocket not connecting"
- Check CORS settings in `backend/main.py`
- Verify API is running: `curl http://localhost:8000/health`
- Check browser console for errors

### "Sculpture not rendering"
- Check browser console for Three.js errors
- Verify sculpture data structure matches schema
- Check `scene.js` for geometry creation errors

### "Redis connection refused"
- Ensure Redis is running: `make logs-redis`
- Check Redis URL in environment
- Verify network connectivity in docker-compose

## Production Deployment

### Apache Reverse Proxy

The `apache/` directory contains production-ready Apache configuration for deploying the application.

**Features:**
- HTTP to HTTPS redirect
- WebSocket proxy support (`mod_proxy_wstunnel`)
- SSL/TLS configuration with modern ciphers
- Security headers (HSTS, X-Frame-Options, etc.)
- Static file serving with caching
- Gzip compression

**Quick Setup:**

```bash
# 1. Copy frontend files
sudo cp -r frontend /var/www/f1-sculpture/

# 2. Install Apache configuration
sudo cp apache/f1-sculpture.conf /etc/apache2/sites-available/

# 3. Enable required modules
sudo a2enmod proxy proxy_http proxy_wstunnel ssl headers rewrite

# 4. Get SSL certificate (Let's Encrypt)
sudo certbot --apache -d yourdomain.com

# 5. Enable site and reload
sudo a2ensite f1-sculpture.conf
sudo systemctl reload apache2
```

**Architecture:**
```
Internet → Apache :443 (SSL)
             ├─ / → Static Files (/var/www/f1-sculpture/frontend/)
             ├─ /api/* → FastAPI Backend (localhost:8000)
             ├─ /health → Backend Health Check
             └─ /ws/* → WebSocket (with proxy_wstunnel)
```

See `apache/README.md` for detailed deployment guide, troubleshooting, and security best practices.

## Production Considerations

- **Scaling**: Increase `CELERY_WORKER_CONCURRENCY` for more parallel tasks
- **Rate Limiting**: Add rate limiting to API endpoints (not implemented)
- **Authentication**: Add auth layer for production (not implemented)
- **CORS**: Restrict `CORS_ORIGINS` to specific domains
- **Monitoring**: Use Flower + Prometheus + Grafana for production monitoring
- **Logging**: Configure structured logging with ELK stack
- **Backup**: Regular backups of FastF1 cache volume
- **Deployment**: Use Apache or Nginx reverse proxy (see `apache/` directory)

## Known Limitations

- Multi-driver comparison UI not implemented (backend ready)
- No authentication/authorization
- No rate limiting on API endpoints
- WebSocket has no authentication
- Task results expire after 1 hour (configurable)
- Max 5 drivers per comparison task

## Future Enhancements

- [ ] Multi-driver comparison in frontend UI
- [ ] Task queue prioritization
- [ ] Progressive data loading (stream vertices)
- [ ] Offline mode with Service Workers
- [ ] Export sculptures as 3D models (.obj, .stl)
- [ ] VR/AR support with WebXR
- [ ] Real-time race data integration

## Documentation

### For Users
**FAQ.md** - Comprehensive user documentation covering:
- What the sculpture represents (peaks/valleys = G-forces, colors = intensity)
- How to use the app (step-by-step guide)
- UI features (reset buttons, team theming, stats toggle, etc.)
- Technical details (data source, caching, tech stack)
- Troubleshooting common issues
- Development setup and contributing

**Key Sections**:
- Understanding G-force calculations and visualization
- Session types (Practice, Qualifying, Sprint, Race)
- Performance optimization tips
- Browser requirements and controls

### For Developers
**CLAUDE.md** - This file - technical architecture documentation
**README.md** - Quick start guide and setup instructions
**apache/README.md** - Production deployment guide

### Inline Documentation
- All JavaScript modules use JSDoc-style comments
- Python backend uses docstrings for classes and functions
- CSS includes section comments for organization

---

**Version**: 2.1 (Dynamic Team Theming Edition)
**Last Updated**: 2024
**Maintained By**: Craig
