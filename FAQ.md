# F1 G-Force Sculpture Gallery - FAQ

## General Questions

### What is this project?

The F1 G-Force Sculpture Gallery transforms Formula 1 telemetry data into interactive 3D sculptures. Each sculpture visualizes a driver's fastest lap, showing the track layout, G-forces, and racing intensity in a beautiful 3D ribbon.

### What do I need to run this?

- **Docker & Docker Compose** (recommended) - Everything runs in containers
- **OR** Local setup: Python 3.11+, Redis, Node.js for development

### Is this official F1 software?

No, this is a fan-made visualization tool built using the open-source FastF1 library, which provides access to F1 telemetry data.

---

## Understanding the Sculpture

### What does the 3D ribbon represent?

The sculpture has three components:

1. **Track Layout (X, Y plane)** - The car's path around the circuit
2. **G-Force Height (Z-axis)** - Vertical extrusion based on G-force intensity
3. **Color Gradient** - Visual reinforcement of G-force magnitude

### What are the peaks and valleys?

- **🔺 Peaks (tall sections)** = High G-force zones
  - Hard braking zones
  - Fast, high-speed corners
  - Intense acceleration out of slow corners

- **🔻 Valleys (flat sections)** = Low G-force zones
  - Straights (constant speed)
  - Slow corners (low lateral G)
  - Coasting sections

**Height Formula:** `z = combined_g × 20` (scaled for visibility)

### What do the colors mean?

The sculpture uses a **green → red gradient** based on G-force intensity:

- 🟢 **Green** - Low G-force (0-1G) - Comfortable zones
- 🟡 **Yellow** - Medium G-force (2-3G) - Moderate stress
- 🟠 **Orange** - High G-force (3-4G) - Pushing hard
- 🔴 **Red** - Extreme G-force (4-5G+) - Maximum physical stress

**Color calculation:** `intensity = min(g_force / 5.0, 1.0)`

### How are G-forces calculated?

The app calculates **combined G-forces** from two components:

**1. Longitudinal G (Acceleration/Braking)**
```
long_g = change_in_speed / 9.81
```
- Positive = Acceleration
- Negative = Braking
- Range: -5G to +5G (clipped)

**2. Lateral G (Cornering)**
```
lateral_g = (speed² / turn_radius) / 9.81
```
- Based on speed and track curvature
- Range: 0G to 5G (clipped)

**3. Combined Magnitude**
```
combined_g = √(long_g² + lat_g²)
```

This gives the **total G-force** the driver experiences at each point on the track.

### Why do some tracks have taller sculptures?

Different circuits produce different G-force profiles:

- **Street circuits** (Monaco, Singapore) - Frequent braking = many tall spikes
- **High-speed circuits** (Monza, Spa) - Sustained high-speed corners = moderate height
- **Technical circuits** (Suzuka, Silverstone) - Mix of both

The sculpture reflects the **physical intensity** of driving that specific circuit.

---

## Using the App

### How do I generate a sculpture?

1. Select **Year** (2023, 2024, 2025)
2. Select **Grand Prix** (e.g., Monaco, Silverstone)
3. Select **Session** (Practice, Qualifying, Race, Sprint)
4. Select **Driver** (e.g., Max Verstappen, Lewis Hamilton)
5. Click **Generate Sculpture**
6. Wait for loading (30-60s first time, 2-3s cached)
7. Explore the 3D sculpture!

### Why does the first load take so long?

The first time you load a session, the app:
- Downloads data from F1's official timing system (via FastF1)
- Processes telemetry for all drivers
- Caches everything locally

**First load:** 30-60 seconds
**Subsequent loads:** 2-3 seconds (cached)

### What's the difference between sessions?

- **FP1/FP2/FP3** (Practice) - Setup and testing laps
- **Qualifying** - Single fast lap for grid position
- **Sprint Qualifying** - Qualifying for Sprint Race (sprint weekends only)
- **Sprint Race** - Short race on Saturday (some weekends)
- **Race** - Main Grand Prix on Sunday

**Tip:** Qualifying usually has the cleanest, fastest laps for best sculptures!

### Can I compare multiple drivers?

The backend supports multi-driver comparison, but the UI isn't implemented yet. Coming in a future update!

### What are Sprint weekends?

Some Grand Prix have a Sprint format with different sessions:
- **Practice 1** (Friday)
- **Sprint Qualifying** (Friday) - Sets Sprint grid
- **Sprint Race** (Saturday) - Short race
- **Qualifying** (Saturday) - Sets main race grid
- **Race** (Sunday) - Full Grand Prix

The app properly labels Sprint sessions in the dropdown.

---

## UI Features

### What do the reset buttons do?

- **Reset Driver** - Clears driver selection, reloads driver list (instant via cache)
- **Reset Session** - Clears both session and driver, reloads sessions

**Pro tip:** Reset buttons only appear when there's something to reset!

### What's the minimize toggle on the stats panel?

Click the **▼/▲ button** in the stats panel header to collapse/expand the statistics, giving you more screen space for the sculpture.

### Why does the UI change colors?

**Dynamic Team Theming!** When you generate a sculpture, the entire UI adapts to the driver's team colors:

- 🟠 **McLaren** - Papaya Orange
- 🔴 **Ferrari** - Rosso Corsa Red
- 🔵 **Red Bull** - Blue & Yellow
- 🩵 **Mercedes** - Petronas Teal
- 🟢 **Aston Martin** - British Racing Green
- 🩷 **Alpine** - Pink & Blue
- And more!

Everything changes: title, buttons, stats, footer, progress bar, dropdown arrows!

### How do I control the 3D view?

**Mouse Controls:**
- **Left-click + drag** - Rotate view
- **Right-click + drag** - Pan camera
- **Scroll wheel** - Zoom in/out
- **Reset Camera button** - Return to default view

**Keyboard (with focus on canvas):**
- **Arrow keys** - Rotate view
- **+/-** - Zoom

### What's the favicon?

The custom F1 race car favicon (in your browser tab) is an SVG with McLaren's Papaya Orange color scheme!

---

## Technical Questions

### What data source does this use?

The app uses **FastF1**, an open-source Python library that accesses:
- F1's official timing data
- Telemetry from all cars
- Session information
- Historical race data back to 2018

### How is data cached?

**Two-tier caching:**

1. **FastF1 Cache (SQLite + Pickle)**
   - Raw F1 session data
   - Stored in Docker volume
   - Survives container restarts
   - ~GB per season

2. **Redis Cache (JSON)**
   - Processed sculptures
   - 24-hour TTL
   - Fast in-memory access
   - Auto-expires old data

### What's the async architecture?

**Modern async stack:**
- **Frontend:** JavaScript ES6 modules + Three.js + WebSocket
- **API:** FastAPI (async Python)
- **Workers:** Celery background tasks
- **Cache/Broker:** Redis
- **Container:** Docker Compose orchestration

**Why async?** Session loading takes 30-60s. Instead of blocking the browser, we:
1. Submit task to background worker
2. Connect WebSocket for real-time progress
3. Display animated progress overlay
4. Render sculpture when complete

### What are the progress stages?

1. **📥 Loading Session (5%-35%)** - Download and load F1 data
2. **🔍 Extracting Telemetry (40%-65%)** - Find driver's fastest lap
3. **⚙️ Processing Sculpture (70%-95%)** - Calculate G-forces and build 3D model
4. **✅ Complete (100%)** - Render in Three.js

### Can I export the sculpture?

Not yet, but planned features include:
- Export as 3D model (.obj, .stl)
- Screenshot/video capture
- Share link to specific sculpture

### What's the tech stack?

**Backend:**
- Python 3.11
- FastAPI (web framework)
- Celery (task queue)
- Redis (cache + message broker)
- FastF1 (F1 data library)
- NumPy (G-force calculations)

**Frontend:**
- Vanilla JavaScript (ES6 modules)
- Three.js (3D rendering)
- WebSocket (real-time updates)
- CSS3 (modern styling with variables)

**Infrastructure:**
- Docker + Docker Compose
- Nginx (frontend serving)
- Apache config (production deployment)

---

## Troubleshooting

### The sculpture isn't rendering

**Check:**
1. Did you wait for 100% completion?
2. Check browser console for errors (F12)
3. Try **Reset Camera** button
4. Refresh the page

### Progress bar stuck at X%

**Solutions:**
1. Check Celery worker is running: `make logs-worker`
2. Check Redis connection: `make health`
3. Open Flower dashboard: `make flower` (http://localhost:5555)
4. Cancel and retry task

### "Loading drivers..." takes forever

**First time:** 30-60 seconds is normal (downloading session)
**Subsequent times:** Should be 2-3 seconds (cached)

**If still slow:**
1. Check internet connection (needs to reach F1 servers)
2. Check backend logs: `make logs-api`
3. Try different session (some may have issues)

### WebSocket not connecting

**Solutions:**
1. Check CORS settings in backend
2. Verify API is running: `curl http://localhost:8000/health`
3. Check browser console for errors
4. Falls back to polling automatically after 5 retry attempts

### No data for 2025 season

**Expected!** 2025 season data becomes available as races happen. Historical data (2018-2024) is fully available.

### "No laps found for driver"

**Possible causes:**
1. Driver didn't participate in that session
2. Driver crashed/retired with no clean laps
3. Data not available yet (very recent sessions)

**Try:** Different session or different driver

### Docker containers won't start

**Solutions:**
1. Ensure Docker is running
2. Check ports aren't in use: `make status`
3. Clean and restart: `make clean && make up`
4. Check logs: `make logs`

---

## Performance & Optimization

### How can I speed up sculpture generation?

**Tips:**
1. **Use cached sessions** - Second load is always faster
2. **Qualifying sessions** - Usually faster to process than races
3. **Recent seasons** - 2023-2024 data is more optimized
4. **Pre-load sessions** - Load drivers first, then switch drivers quickly

### Can I run this on a low-spec machine?

**Minimum requirements:**
- 4GB RAM
- 2 CPU cores
- 10GB disk space (for FastF1 cache)
- Modern browser with WebGL support

**Recommended:**
- 8GB RAM
- 4+ CPU cores
- SSD storage
- GPU with WebGL 2.0

### Does this use a lot of bandwidth?

**First load:** ~50-200MB per session (downloads F1 data)
**Cached:** Minimal (only API calls, no external downloads)

Data is cached locally, so subsequent loads are bandwidth-free!

---

## Development & Contributing

### How do I run this locally?

**Docker (recommended):**
```bash
make up          # Start all services
make logs        # View logs
make health      # Check status
```

**Manual:**
```bash
# Terminal 1: Redis
redis-server

# Terminal 2: Celery Worker
cd backend && celery -A backend.tasks.celery_app worker --loglevel=info

# Terminal 3: FastAPI
cd backend && uvicorn backend.main:app --reload

# Terminal 4: Frontend
cd frontend && python -m http.server 3000
```

### How can I contribute?

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

**Ideas for contributions:**
- Multi-driver comparison UI
- 3D export functionality
- VR/AR support
- Additional visualizations
- Performance improvements
- Bug fixes

### Where's the documentation?

- **CLAUDE.md** - Full technical documentation
- **README.md** - Quick start guide
- **FAQ.md** - This file
- **Code comments** - Inline documentation

### Can I use this for commercial purposes?

This is a fan project for educational/personal use. Check FastF1 and F1 data licensing for commercial use restrictions.

---

## Credits & Attribution

**Built with:**
- [FastF1](https://github.com/theOehrly/Fast-F1) - F1 data library by @theOehrly
- [Three.js](https://threejs.org/) - 3D graphics library
- [FastAPI](https://fastapi.tiangolo.com/) - Python web framework
- [Celery](https://docs.celeryq.dev/) - Distributed task queue
- [Redis](https://redis.io/) - In-memory data store

**Data source:** Formula 1 via FastF1 library

**Created by:** Craig

**Version:** 2.1 (Async Edition with Dynamic Team Theming)

---

## Future Enhancements

**Planned features:**
- [ ] Multi-driver comparison view
- [ ] Telemetry overlay (speed, throttle, brake)
- [ ] Sector-by-sector analysis
- [ ] Export as 3D model (.obj, .stl)
- [ ] VR/AR support (WebXR)
- [ ] Live race data integration
- [ ] Social sharing features
- [ ] Performance leaderboards

**Got ideas?** Open an issue on GitHub!

---

## Support

**Need help?**
- Check this FAQ first
- Read CLAUDE.md for technical details
- Open an issue on GitHub
- Check logs: `make logs`

**Found a bug?**
- Open an issue with reproduction steps
- Include browser/OS information
- Attach error logs if possible

---

**Enjoy visualizing F1 data in 3D!** 🏎️🏁
