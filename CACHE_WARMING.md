# Cache Warming Guide

## Overview

The F1 Sculpture Gallery now includes **automatic cache warming** to eliminate the 30-60 second wait time for first-time data loads. This system pre-fetches popular race data so users always get fast (<3s) responses.

## How It Works

### Automatic Warming (Celery Beat)

A scheduled task runs **every Monday at 3 AM** to warm the cache with:
- **Latest 3 completed races** from the current season
- **Qualifying + Race sessions only** (skips practice to save resources)
- **Top 15 drivers** by popularity/championship position

This covers ~80% of user requests and ensures the most popular data is always cached.

### What Gets Cached

1. **Session Data** (via FastF1 cache):
   - Race session metadata
   - Driver lists
   - Lap times and telemetry
   - Stored in: `/app/cache/fastf1` Docker volume

2. **Processed Sculptures** (via Redis):
   - 3D coordinates and G-force calculations
   - Ready-to-render JSON
   - TTL: 24 hours
   - Stored in: Redis database

## Usage

### Automatic Scheduling

The system runs automatically once deployed. No configuration needed.

**Schedule**: Every Monday at 3 AM UTC

**To change the schedule**, edit `backend/tasks/celery_app.py`:

```python
beat_schedule={
    'warm-cache-weekly': {
        'task': 'warm_cache_for_recent_races',
        'schedule': crontab(hour=3, minute=0, day_of_week=1),  # Modify this
        'options': {'expires': 3600}
    },
}
```

Examples:
- `crontab(hour=3, minute=0)` - Daily at 3 AM
- `crontab(hour=3, minute=0, day_of_week='sun,wed')` - Sundays and Wednesdays at 3 AM
- `crontab(minute='*/30')` - Every 30 minutes (not recommended - too aggressive)

### Manual Trigger

#### Option 1: Makefile Command (Easiest)

```bash
make warm-cache
```

This triggers cache warming for the latest 3 races and returns a task ID.

#### Option 2: API Endpoint

**Warm Recent Races:**
```bash
curl -X POST http://localhost:8000/api/cache/warm/recent
```

**Warm Specific Race:**
```bash
# Warm all drivers in Qualifying + Race
curl -X POST "http://localhost:8000/api/cache/warm/race?year=2024&round=21"

# Warm specific drivers
curl -X POST "http://localhost:8000/api/cache/warm/race?year=2024&round=21&sessions=Q&sessions=R&drivers=VER&drivers=HAM&drivers=LEC"
```

#### Option 3: Python/Celery Direct

```bash
# Enter worker container
make shell-worker

# Inside container
python3
>>> from backend.tasks.cache_warming import warm_cache_for_recent_races
>>> task = warm_cache_for_recent_races.apply_async()
>>> print(task.id)
```

### Monitoring Cache Warming

#### View Logs

```bash
# Celery worker logs (where warming tasks run)
make logs-worker

# Celery Beat logs (scheduler)
make logs-beat

# All logs
make logs
```

#### Flower Dashboard

Open http://localhost:5555 to see:
- Active cache warming tasks
- Completed tasks
- Task duration
- Success/failure rates

#### Redis Cache Stats

```bash
curl http://localhost:8000/api/cache/stats | python3 -m json.tool
```

Returns:
```json
{
  "total_keys": 145,
  "sculpture_keys": 120,
  "session_keys": 25,
  "memory_used": "2.4 MB"
}
```

## Configuration

### Customize Warming Strategy

Edit `backend/tasks/cache_warming.py`:

```python
def get_cache_warming_strategy() -> Dict[str, Any]:
    return {
        'year': datetime.now().year,
        'recent_rounds': 3,  # Number of recent races to warm
        'sessions': ['Q', 'R'],  # Which sessions to warm
        'drivers': [
            'VER', 'PER',  # Add/remove drivers
            'HAM', 'RUS',
            # ... more drivers
        ],
        'max_concurrent': 5  # Parallel task limit
    }
```

**Pro Tips:**
- **More rounds**: Increase `recent_rounds` to 5-6 for mid-season
- **All sessions**: Add `'FP1', 'FP2', 'FP3'` for practice sessions (increases load)
- **Fewer drivers**: Remove drivers who get few requests to save resources
- **Championship leaders**: Update driver list monthly to track current standings

### Environment Variables

No new environment variables needed. Uses existing Redis/Celery config.

## Performance Impact

### Resource Usage

**Per race/session/driver:**
- First load: 30-60s CPU + network (FastF1 download)
- Cached load: 2-3s CPU only
- Storage: ~50-100 KB per sculpture in Redis

**Full warming cycle (3 races, 2 sessions, 15 drivers):**
- Time: 40-70 seconds (optimized session sharing)
- CPU: Moderate (uses 2 Celery workers)
- Storage: ~9 MB Redis + ~500 MB FastF1 cache
- Network: ~200 MB (first time only)

### When to Warm

**Good times:**
- **After a race weekend** - Warm the latest race before users request it
- **Monday morning** - Default schedule, low traffic time
- **Before high traffic** - If you know users will spike (e.g., before a major race)

**Avoid:**
- **During races** - Don't compete with user requests
- **Every hour** - Too aggressive, wastes resources
- **Right before deployment** - Cache may clear on restart

## Troubleshooting

### Cache Warming Fails

**Check worker is running:**
```bash
make status
# Look for f1-celery-worker (up)
```

**Check Beat is running:**
```bash
make status
# Look for f1-celery-beat (up)
```

**View error logs:**
```bash
make logs-worker
make logs-beat
```

**Common errors:**
- `No completed events for {year}` - Season hasn't started yet, or all races are future
- `Session not available` - Sprint races may not have all sessions
- `Driver not found` - Driver didn't participate in that session

### Task Stuck in PENDING

Check Redis connection:
```bash
make redis-cli
> PING
PONG
```

Check Celery can reach Redis:
```bash
make shell-worker
celery -A backend.tasks.celery_app inspect ping
```

### Cache Not Warming as Expected

1. **Check Beat schedule**:
   ```bash
   make logs-beat | grep "warm-cache-weekly"
   ```

2. **Manually trigger** to test:
   ```bash
   make warm-cache
   ```

3. **Check Flower** for task status:
   - Open http://localhost:5555
   - Look for `warm_cache_for_recent_races` tasks

### Out of Disk Space

**Clear old caches:**
```bash
# Clear Redis sculpture cache only
curl -X DELETE http://localhost:8000/api/cache/sculptures

# Clear FastF1 cache (nuclear option)
make clean-cache
```

**Reduce warming scope:**
- Decrease `recent_rounds` from 3 to 2
- Remove less popular drivers
- Skip practice sessions

## Production Deployment

### AWS/Cloud Recommendations

1. **Increase worker concurrency** for faster warming:
   ```yaml
   # docker-compose.yml
   celery_worker:
     command: celery -A backend.tasks.celery_app worker --loglevel=info --concurrency=4
   ```

2. **Scale Beat** (only run 1 Beat instance per cluster):
   ```bash
   # In production, ensure only ONE Beat scheduler runs
   docker-compose up --scale celery_beat=1
   ```

3. **Adjust schedule** for your timezone:
   ```python
   # backend/tasks/celery_app.py
   timezone='America/New_York',  # Set your timezone
   ```

4. **Monitor resources**:
   - Use CloudWatch/Prometheus to track CPU/memory
   - Set alerts if cache warming takes >5 minutes

### High-Traffic Setup

For production sites with heavy traffic:

```python
# Warm more aggressively
'recent_rounds': 5,  # Last 5 races
'sessions': ['FP1', 'FP2', 'FP3', 'Q', 'S', 'R'],  # All sessions
'drivers': [...],  # All 20 drivers

# Warm more often
'schedule': crontab(hour='*/6'),  # Every 6 hours
```

**Cost**: ~2-3 hours Celery worker time per day

## FAQ

### Q: Will this increase my cloud costs?

**A:** Minimal impact. Cache warming runs once/week for ~1 minute. Most costs are from the FastF1 data download, which happens once and is reused.

### Q: Can I warm the entire season?

**A:** Yes, but not recommended. You'd need to modify the task to iterate all rounds. This could take 30-60 minutes and is overkill. Focus on recent races.

### Q: What if I want to warm data before a specific race weekend?

**A:** Use the specific race warming endpoint:
```bash
curl -X POST "http://localhost:8000/api/cache/warm/race?year=2024&round=22"
```

### Q: Does this affect real-time user requests?

**A:** No. Cache warming tasks run in the background using the same Celery workers, but they're queued behind user-initiated tasks. If a user requests a sculpture while warming is happening, their task takes priority.

### Q: Can I warm data for previous seasons?

**A:** Yes, modify the strategy:
```python
'year': 2023,  # Instead of datetime.now().year
'recent_rounds': 22,  # All rounds for that season
```

But this is not recommended for automatic warming—use manual trigger instead.

## Advanced Usage

### Pre-Warm Before Deployment

Run cache warming manually before deploying to production:

```bash
# 1. Start services
make up

# 2. Wait for healthy state
make health

# 3. Trigger warming
make warm-cache

# 4. Monitor progress
make logs-worker

# 5. Verify cache
curl http://localhost:8000/api/cache/stats
```

### Custom Warming Scripts

Create a one-off script for special warming needs:

```python
# warm_championship_leaders.py
from backend.tasks.cache_warming import warm_cache_specific_race

# Warm last 10 races for top 3 championship contenders
championship_leaders = ['VER', 'NOR', 'LEC']
current_year = 2024

for round_num in range(15, 25):  # Rounds 15-24
    warm_cache_specific_race.apply_async(
        args=[current_year, round_num, ['Q', 'R'], championship_leaders]
    )
```

Run it:
```bash
make shell-worker
python3 /path/to/warm_championship_leaders.py
```

## Summary

✅ **Set and forget** - Automatic weekly warming covers most users
✅ **Manual control** - Trigger on-demand before high-traffic events
✅ **Smart caching** - Only warms popular data to save resources
✅ **Production ready** - Tested with Docker, Celery Beat, and Redis

**Most users won't need to touch this.** It just works.

For questions or issues, check the logs with `make logs-worker` or open an issue on GitHub.
