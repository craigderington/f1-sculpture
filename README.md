# F1 G-Force Sculpture Gallery

![f1-sculpture-logo](https://raw.githubusercontent.com/craigderington/f1-sculptures/refs/heads/master/assets/f1-sculptures-logo.png)

An innovative 3D visualization of Formula 1 telemetry data that transforms driver performance into interactive sculptures. Each lap becomes a unique 3D artwork where the track layout is extruded vertically based on G-force intensity.

**NEW in v2.1:** Multi-driver comparison, interactive ribbons with G-force tooltips, and removable sculptures!

**v2.0:** Async architecture with real-time progress updates, Docker deployment, and Redis caching

## 🎨 Concept

Instead of traditional 2D telemetry graphs, this project creates 3D "sculptures" where:
- **X/Y plane**: Track layout (circuit geography)
- **Z-axis (height)**: Combined G-force magnitude
- **Color gradient**: G-force intensity (green → red for low → high G-forces)

Different drivers create distinct "sculpture signatures" based on their driving style, braking points, and cornering techniques.

## 🚀 Features

### v2.1 - Interactive Edition (NEW!)
- **Multi-Driver Comparison**: Select up to 5 drivers and compare them side-by-side
  - Checkbox-based driver selection with live count
  - Team-colored ribbons for instant visual distinction
  - Tabbed stats panel for each driver
  - Dynamic spacing and labeling
- **Interactive G-Force Tooltips**: Click anywhere on a ribbon to see detailed telemetry
  - Combined G-force magnitude
  - Longitudinal G (acceleration/braking)
  - Lateral G (cornering forces)
  - Speed and distance at that exact point
- **Removable Sculptures**: Hover over driver labels and click × to remove individual sculptures
- **Help Panel & Guide**: Comprehensive slide-in help panel with user documentation
  - What the sculpture represents (axes, colors, G-forces)
  - Visual G-force color legend with gradients
  - Complete camera controls and interaction guide
  - Pro tips and best practices
  - Credits and source repository links
- **Enhanced UX**:
  - Full session names (no abbreviations)
  - Interactive features hint panel
  - Smart reset buttons (driver/session)
  - Frontend caching for instant driver reset

### v2.0 - Async Edition
- **Real-time Progress Updates**: WebSocket-powered progress indicators with 3 detailed stages
- **Background Processing**: Celery workers handle long-running telemetry processing
- **Smart Caching**: Redis caches processed sculptures for instant subsequent loads (24hr TTL)
- **Docker Deployment**: Full containerized setup with docker-compose
- **Production Ready**: Docker container health checks, API health endpoints, monitoring with Flower, and graceful error handling

### Core Features
- **3D Interactive Visualization**: Rotate, zoom, and explore driver sculptures from any angle
- **Real F1 Data**: Uses FastF1 library to fetch authentic telemetry from official sources
- **Multi-Season Support**: Explore races from 2023, 2024, and beyond
- **Session Comparison**: View practice, qualifying, and race sessions
- **Driver Analysis**: Compare how different drivers tackle the same circuit
- **Beautiful Rendering**: Custom shaders, team colors, and dynamic lighting

## 🛠️ Tech Stack

### Backend
- **FastAPI**: High-performance async API
- **Celery**: Distributed task queue for background processing
- **Redis**: Message broker, result backend, and caching layer
- **FastF1**: F1 data access and telemetry processing
- **NumPy/Pandas**: Data manipulation and G-force calculations

### Frontend
- **Three.js**: WebGL-based 3D rendering
- **Vanilla JavaScript**: ES6 modules for clean architecture
- **WebSocket**: Real-time progress updates

### Infrastructure
- **Docker**: Containerized deployment
- **Docker Compose**: Multi-service orchestration
- **Nginx**: Optional reverse proxy for frontend

## 📋 Prerequisites

- Docker & Docker Compose (recommended)
- **OR** for local development:
  - Python 3.11+
  - Redis server
  - Modern web browser with WebGL support
  - Internet connection (for downloading F1 telemetry data)

## 🏁 Quick Start (Docker - Recommended)

### 1. Start All Services

```bash
# Clone the repository
git clone <your-repo-url>
cd f1-sculpture

# Start with make (easiest)
make up

# OR use docker-compose directly
docker-compose up -d
```

This starts:
- **API** (port 8000) - FastAPI backend
- **Celery Worker** - Background task processor
- **Redis** (port 6379) - Cache and message broker
- **Flower** (port 5555) - Celery monitoring dashboard
- **Frontend** (port 3000) - Nginx serving the UI

### 2. Access the Application

- **Frontend**: http://localhost:3000
- **API Docs**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health
- **Flower Monitoring**: http://localhost:5555

### 3. Generate Your First Sculpture

1. Select **2024** for the year
2. Pick a **Grand Prix** (Monaco, Silverstone, Monza recommended)
3. Choose **Qualifying (Q)** session (best data quality)
4. Select a **driver** (VER, HAM, LEC)
5. Click **Generate Sculpture**
6. Watch real-time progress: Loading session → Extracting telemetry → Processing sculpture
7. Explore the 3D sculpture with mouse controls

## 🎮 Controls & Interaction

### Camera Controls
- **Left Click + Drag**: Rotate the sculpture
- **Right Click + Drag**: Pan the view
- **Scroll Wheel**: Zoom in/out
- **Reset Camera**: Button to return to default view

### Interactive Features (v2.1)
- **Click on Ribbons**: View detailed G-force telemetry at any point
  - Combined, longitudinal, and lateral G-forces
  - Speed and distance data
  - Close with × button or ESC key
- **Hover over Labels**: See × button to remove individual sculptures
- **Multi-Select Drivers**: Use checkboxes to compare up to 5 drivers
- **Clear All**: Remove all driver selections at once
- **Help Button (?)**: Click the help button in bottom-right corner for comprehensive guide
  - Opens slide-in panel with full documentation
  - Includes color legend, controls, tips, and credits
  - Close with × button or ESC key

## 🐳 Docker Commands (Makefile)

```bash
# Development
make up-dev          # Start with hot reload and debug logging
make logs            # View all logs
make logs-api        # View API logs only
make logs-worker     # View Celery worker logs

# Management
make restart         # Restart all services
make down            # Stop all services
make clean           # Stop and remove volumes
make clean-cache     # Clear FastF1 cache only

# Monitoring
make health          # Check API health
make flower          # Open Flower dashboard
make status          # Show service status

# Development Tools
make shell-api       # Shell access to API container
make shell-worker    # Shell access to worker container
make redis-cli       # Connect to Redis CLI
```

## 💻 Local Development (Without Docker)

### Backend Setup

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Start Redis (in separate terminal)
redis-server

# Start Celery worker (in separate terminal)
celery -A backend.tasks.celery_app worker --loglevel=info

# Start API
python main.py
```

The API will start on `http://localhost:8000`

### Frontend Setup

```bash
cd frontend

# Serve with Python HTTP server
python -m http.server 3000
```

Then navigate to `http://localhost:3000`

## 🎯 API Endpoints (v2.0)

### Metadata (Fast - Synchronous)
- `GET /api/events/{year}` - List all events for a year
- `GET /api/sessions/{year}/{round}` - Get available sessions
- `GET /api/drivers/{year}/{round}/{session}` - List drivers in session

### Async Task Submission (New!)
- `POST /api/tasks/sculpture` - Submit sculpture generation task
  ```json
  {
    "year": 2024,
    "round": 1,
    "session": "Q",
    "driver": "VER"
  }
  ```
  Returns: `{"task_id": "abc-123", "status": "PENDING"}`

- `POST /api/tasks/compare` - Compare multiple drivers
  ```json
  {
    "year": 2024,
    "round": 1,
    "session": "Q",
    "drivers": ["VER", "HAM", "LEC"]
  }
  ```

### Task Management
- `GET /api/tasks/{task_id}` - Poll task status (fallback)
- `GET /api/tasks/{task_id}/result` - Get completed result
- `DELETE /api/tasks/{task_id}` - Cancel task
- `WS /ws/tasks/{task_id}` - WebSocket for real-time updates

### Monitoring
- `GET /health` - Health check (API, Redis, Celery)
- `GET /api/cache/stats` - Cache statistics

## 📊 Architecture

```
┌─────────────┐
│   Frontend  │  (Nginx:3000)
│  Three.js   │
└──────┬──────┘
       │ HTTP/WebSocket
       ↓
┌─────────────┐     ┌──────────────┐
│   FastAPI   │────→│    Redis     │  (Cache + Broker)
│   (API)     │     │   (port 6379)│
└──────┬──────┘     └──────────────┘
       │                    ↑
       │ Submit Task        │ Poll Results
       ↓                    │
┌─────────────┐            │
│   Celery    │────────────┘
│   Workers   │  (Background Processing)
└─────────────┘

FastF1 Cache: Docker Volume (persistent SQLite + pickle)
```

### Data Flow

1. **User selects driver** → Frontend
2. **Submit task** → API checks Redis cache
3. **If cached**: Return immediately
4. **If not cached**: Submit to Celery queue
5. **WebSocket connects** → Real-time progress updates
6. **Worker processes**:
   - Stage 1: Load F1 session (30-60s first time, 2-3s cached)
   - Stage 2: Extract telemetry (5-10s)
   - Stage 3: Process G-forces and generate sculpture (500ms)
7. **Cache result** → Redis (24hr TTL)
8. **Return to frontend** → Render in Three.js

## 🔮 Performance

- **First Load**: 30-60s (downloads data from F1 APIs)
- **Cached Session**: 2-3s (from FastF1 file cache)
- **Cached Sculpture**: <100ms (from Redis)
- **Multi-Driver (5 drivers)**: 40-70s optimized (vs 90-120s sequential)

## 💡 Tips

- **First load is slow**: FastF1 downloads and caches data (~30-60 seconds)
- **Subsequent loads are fast**: Cached data loads in <3 seconds
- **Best circuits for visualization**:
  - **High G-forces**: Monaco, Singapore (street circuits)
  - **Speed variation**: Monza, Spa (high-speed with heavy braking)
  - **Flowing corners**: Silverstone, Suzuka (technical)
- **Best sessions**: Qualifying has the cleanest data (single push laps)

## 🐛 Troubleshooting

### Backend won't start
```bash
# Check services
make status

# View logs
make logs-api

# Check health
make health

# Restart services
make restart
```

### Redis connection issues
```bash
# Check Redis is running
make logs-redis

# Test Redis connection
make redis-cli
> ping  # Should return PONG
```

### Celery worker not processing
```bash
# Check worker logs
make logs-worker

# View Flower dashboard
make flower
```

### No data for a session
- Not all sessions have telemetry (especially older races)
- Try a different session or race
- Check API docs at http://localhost:8000/docs

### Sculpture looks flat
- Some street circuits (Monaco) produce flatter sculptures due to lower speeds
- Try a high-speed circuit like Monza or Spa

## 🧪 Testing

```bash
# Run tests in Docker
make test

# Or manually
docker-compose exec api pytest
```

## 🎯 Environment Variables

See `.env.example` for all configuration options:

```bash
# Redis
REDIS_URL=redis://redis:6379/0

# Celery
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/1

# FastF1 Cache
FASTF1_CACHE_DIR=/app/cache/fastf1

# Cache TTLs
SCULPTURE_CACHE_TTL=86400  # 24 hours
```

## 🤝 Contributing

Ideas for new visualizations or features? Open an issue or submit a PR!

### Future Enhancements
- [ ] Animation through lap progression
- [ ] Tire compound visualization
- [ ] Sector-based color coding
- [ ] Export sculptures as 3D models (.obj, .stl)
- [ ] VR/AR support
- [ ] Real-time race data during live sessions
- [x] Multi-driver comparison (v2.1 ✅)
- [x] Interactive telemetry tooltips (v2.1 ✅)
- [x] Team color theming (v2.1 ✅)

## 📜 License

MIT License - Feel free to use and modify

## 🙏 Special Thanks and Credit:

- **[FastF1](https://github.com/theOehrly/Fast-F1)**: Amazing Python library for F1 data access by Philipp Schaefer [@theOehrly](https://github.com/theOehrly)
- **[Three.js](https://threejs.org/)**: Powerful 3D graphics library
- **F1 Community**: For making telemetry data accessible

---

**Built with ❤️ for F1 fans who appreciate data visualization**

v2.1 - Interactive Edition [@craigderington](https://craigderington.dev)
