"""
F1 G-Force Sculpture Gallery - Main FastAPI Application
Refactored with async task processing, Redis caching, and WebSocket support.
"""

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import logging
import asyncio
from typing import List

# Local imports
from backend.config import settings, setup_fastf1_cache
from backend.models.schemas import (
    SculptureTaskRequest,
    CompareTaskRequest,
    TaskResponse,
    TaskStatusResponse,
    HealthCheckResponse,
    EventInfo,
    SessionInfo,
    DriverMetadata
)
from backend.services.fastf1_service import FastF1Service
from backend.services.cache_service import CacheService
from backend.tasks.sculpture_tasks import (
    generate_sculpture_task,
    compare_drivers_task,
    load_session_metadata_task
)
from backend.tasks.cache_warming import (
    warm_cache_for_recent_races,
    warm_cache_specific_race
)
from backend.tasks.celery_app import celery_app
from backend.websocket.manager import ws_manager

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastF1 cache
setup_fastf1_cache()

# Initialize services
cache_service = CacheService(settings.redis_url)


# Lifespan context manager for startup/shutdown
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle application startup and shutdown."""
    # Startup
    logger.info("Starting F1 G-Force Sculpture Gallery API")
    await cache_service.connect()
    logger.info(f"Connected to Redis at {settings.redis_url}")

    yield

    # Shutdown
    logger.info("Shutting down API")
    await cache_service.disconnect()


# Create FastAPI app
app = FastAPI(
    title="F1 G-Force Sculpture API",
    version="2.0.0",
    description="Async API for generating 3D F1 telemetry sculptures with real-time progress updates",
    lifespan=lifespan
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Health Check & Monitoring Endpoints
# ============================================================================

@app.get("/", tags=["Health"])
async def root():
    """API root - basic health check."""
    return {
        "status": "ok",
        "message": "F1 G-Force Sculpture API v2.0 - Async Edition",
        "docs": "/docs"
    }


@app.get("/health", response_model=HealthCheckResponse, tags=["Health"])
async def health_check():
    """
    Comprehensive health check for all services.
    Returns status of API, Redis, and Celery workers.
    """
    health = {
        "api": "healthy",
        "redis": "unknown",
        "celery": "unknown"
    }

    # Check Redis
    try:
        redis_ok = await cache_service.ping()
        health["redis"] = "healthy" if redis_ok else "unhealthy"
    except Exception as e:
        logger.error(f"Redis health check failed: {e}")
        health["redis"] = "unhealthy"

    # Check Celery workers
    try:
        inspector = celery_app.control.inspect()
        active_workers = inspector.active()
        health["celery"] = "healthy" if active_workers else "no_workers"
    except Exception as e:
        logger.error(f"Celery health check failed: {e}")
        health["celery"] = "unhealthy"

    # Determine HTTP status code
    all_healthy = all(v in ["healthy", "no_workers"] for v in health.values())
    status_code = 200 if all_healthy else 503

    return JSONResponse(content=health, status_code=status_code)


# ============================================================================
# Synchronous Metadata Endpoints (Fast Operations)
# ============================================================================

@app.get("/api/events/{year}", response_model=List[EventInfo], tags=["Metadata"])
async def get_events(year: int):
    """
    Get all F1 events for a given year.
    Fast operation - uses FastF1 cache.
    """
    try:
        f1_service = FastF1Service()
        events = f1_service.get_event_schedule(year)
        return events

    except Exception as e:
        logger.error(f"Error fetching events for {year}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sessions/{year}/{round}", tags=["Metadata"])
async def get_sessions(year: int, round: int):
    """
    Get available sessions for a specific event.
    Fast operation - uses FastF1 cache.
    """
    try:
        f1_service = FastF1Service()
        sessions = f1_service.get_sessions_for_event(year, round)
        return sessions

    except Exception as e:
        logger.error(f"Error fetching sessions for {year} round {round}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Async Task Submission Endpoints
# ============================================================================

@app.post("/api/tasks/sculpture", response_model=TaskResponse, tags=["Tasks"])
async def submit_sculpture_task(request: SculptureTaskRequest):
    """
    Submit a background task to generate a sculpture for a single driver.
    Returns immediately with a task ID for tracking progress.

    Check cache first - if sculpture exists, return it immediately.
    Otherwise, submit background task.
    """
    try:
        # Check cache first
        cached_sculpture = await cache_service.get_sculpture(
            request.year, request.round, request.session, request.driver
        )

        if cached_sculpture:
            logger.info(f"Returning cached sculpture for {request.driver}")
            # Return as "completed" task with immediate result
            return TaskResponse(
                task_id="cached",
                status="SUCCESS"
            )

        # Submit Celery task
        task = generate_sculpture_task.delay(
            request.year,
            request.round,
            request.session,
            request.driver
        )

        logger.info(f"Submitted sculpture task {task.id} for {request.driver}")

        return TaskResponse(
            task_id=task.id,
            status="PENDING"
        )

    except Exception as e:
        logger.error(f"Error submitting sculpture task: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/tasks/compare", response_model=TaskResponse, tags=["Tasks"])
async def submit_compare_task(request: CompareTaskRequest):
    """
    Submit a background task to compare multiple drivers.
    More efficient than individual tasks - loads session once.
    """
    try:
        # Submit Celery task
        task = compare_drivers_task.delay(
            request.year,
            request.round,
            request.session,
            request.drivers
        )

        logger.info(f"Submitted comparison task {task.id} for {len(request.drivers)} drivers")

        return TaskResponse(
            task_id=task.id,
            status="PENDING"
        )

    except Exception as e:
        logger.error(f"Error submitting comparison task: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Task Status & Results Endpoints (Polling Fallback)
# ============================================================================

@app.get("/api/tasks/{task_id}", response_model=TaskStatusResponse, tags=["Tasks"])
async def get_task_status(task_id: str):
    """
    Get the current status of a task (for polling fallback).
    Prefer WebSocket for real-time updates.

    Special case: task_id="cached" returns cached result immediately.
    """
    try:
        # Handle cached responses
        if task_id == "cached":
            return TaskStatusResponse(
                task_id="cached",
                status="SUCCESS",
                message="Data served from cache"
            )

        # Get task result from Celery
        task_result = celery_app.AsyncResult(task_id)

        # Build status response
        response = TaskStatusResponse(
            task_id=task_id,
            status=task_result.state
        )

        if task_result.state == 'PENDING':
            response.message = "Task is queued"

        elif task_result.state == 'PROGRESS':
            # Extract progress metadata
            if task_result.info:
                response.stage = task_result.info.get('stage')
                response.progress = task_result.info.get('progress')
                response.message = task_result.info.get('message')

        elif task_result.state == 'SUCCESS':
            response.message = "Task completed successfully"
            response.progress = 100
            # Don't include full result here - use /result endpoint

        elif task_result.state == 'FAILURE':
            response.error = str(task_result.info)
            response.message = "Task failed"

        return response

    except Exception as e:
        logger.error(f"Error fetching task status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/tasks/{task_id}/result", tags=["Tasks"])
async def get_task_result(task_id: str):
    """
    Get the final result of a completed task.
    Returns 404 if task is not complete or doesn't exist.
    """
    try:
        task_result = celery_app.AsyncResult(task_id)

        if task_result.state == 'SUCCESS':
            result = task_result.result

            # Cache the result in Redis
            if 'driver' in result:
                # Single driver sculpture
                driver = result['driver']['abbreviation']
                # Note: We'd need year/round/session from task args to cache properly
                # For now, just return the result
                pass

            return {
                "task_id": task_id,
                "status": "SUCCESS",
                "result": result
            }

        elif task_result.state == 'FAILURE':
            raise HTTPException(status_code=500, detail=str(task_result.info))

        else:
            raise HTTPException(
                status_code=404,
                detail=f"Task not complete. Current state: {task_result.state}"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching task result: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/tasks/{task_id}", tags=["Tasks"])
async def cancel_task(task_id: str):
    """Cancel a running task."""
    try:
        celery_app.control.revoke(task_id, terminate=True)
        logger.info(f"Task {task_id} cancelled")

        return {"task_id": task_id, "status": "cancelled"}

    except Exception as e:
        logger.error(f"Error cancelling task: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# WebSocket Endpoint for Real-time Updates
# ============================================================================

@app.websocket("/ws/tasks/{task_id}")
async def websocket_task_updates(websocket: WebSocket, task_id: str):
    """
    WebSocket endpoint for real-time task progress updates.
    Connects to a specific task and receives updates as they happen.
    """
    await ws_manager.connect(websocket, task_id)

    try:
        # Send initial connection confirmation
        await websocket.send_json({
            "type": "connected",
            "task_id": task_id,
            "message": "WebSocket connected successfully"
        })

        # Poll task status and send updates
        task_result = celery_app.AsyncResult(task_id)

        while True:
            if task_result.state == 'SUCCESS':
                await ws_manager.broadcast_success(task_id, task_result.result)
                break

            elif task_result.state == 'FAILURE':
                await ws_manager.broadcast_error(task_id, str(task_result.info))
                break

            elif task_result.state == 'PROGRESS':
                if task_result.info:
                    # Extract metadata for full session details display
                    metadata = {
                        'year': task_result.info.get('year'),
                        'event_name': task_result.info.get('event_name'),
                        'session_name': task_result.info.get('session_name'),
                        'session_date': task_result.info.get('session_date'),
                        'driver': task_result.info.get('driver')
                    }

                    await ws_manager.send_message(task_id, {
                        'type': 'progress',
                        'task_id': task_id,
                        'stage': task_result.info.get('stage', 'processing'),
                        'progress': task_result.info.get('progress', 0),
                        'message': task_result.info.get('message', 'Processing...'),
                        'metadata': metadata
                    })

            # Wait before next poll (poll every 500ms for smooth updates)
            await asyncio.sleep(0.5)

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for task {task_id}")

    except Exception as e:
        logger.error(f"WebSocket error: {e}")

    finally:
        await ws_manager.disconnect(websocket, task_id)


# ============================================================================
# Cache Management Endpoints (Admin/Debug)
# ============================================================================

@app.get("/api/cache/stats", tags=["Cache"])
async def get_cache_stats():
    """Get Redis cache statistics."""
    try:
        stats = await cache_service.get_cache_stats()
        return stats
    except Exception as e:
        logger.error(f"Error getting cache stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/cache/sculptures", tags=["Cache"])
async def clear_sculpture_cache():
    """Clear all cached sculptures (admin operation)."""
    try:
        await cache_service.clear_all_sculptures()
        return {"message": "Sculpture cache cleared"}
    except Exception as e:
        logger.error(f"Error clearing sculpture cache: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/cache/warm/recent", tags=["Cache"])
async def trigger_cache_warming():
    """
    Manually trigger cache warming for recent popular races.

    Pre-loads:
    - Latest 3 completed races
    - Qualifying + Race sessions only
    - Top 15 drivers by popularity

    Returns task ID to track progress.
    """
    try:
        logger.info("Manual cache warming triggered")
        task = warm_cache_for_recent_races.apply_async()

        return {
            "message": "Cache warming started",
            "task_id": task.id,
            "status": "Check task status at /api/tasks/{task_id}"
        }
    except Exception as e:
        logger.error(f"Error starting cache warming: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/cache/warm/race", tags=["Cache"])
async def warm_specific_race(
    year: int,
    round: int,
    sessions: List[str] = None,
    drivers: List[str] = None
):
    """
    Warm cache for a specific race.

    Args:
        year: F1 season year
        round: Race round number
        sessions: Optional list of sessions (default: ['Q', 'R'])
        drivers: Optional list of driver codes (default: all drivers)

    Returns task ID to track progress.
    """
    try:
        logger.info(f"Manual cache warming for {year} R{round}")
        task = warm_cache_specific_race.apply_async(
            args=[year, round, sessions, drivers]
        )

        return {
            "message": f"Cache warming started for {year} Round {round}",
            "task_id": task.id,
            "status": "Check task status at /api/tasks/{task_id}"
        }
    except Exception as e:
        logger.error(f"Error starting specific race warming: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Deprecated Endpoints (Backward Compatibility)
# ============================================================================

@app.get("/api/drivers/{year}/{round}/{session}", tags=["Deprecated"])
async def get_drivers_deprecated(year: int, round: int, session: str):
    """
    DEPRECATED: Get drivers in a session.
    This is now a fast operation that doesn't require background tasks.

    Use the new async workflow for sculpture generation.
    """
    try:
        f1_service = FastF1Service()
        session_obj = f1_service.load_session(year, round, session)
        drivers = f1_service.get_drivers_in_session(session_obj)

        return JSONResponse(
            content={"drivers": drivers},
            headers={"X-Deprecated": "This endpoint loads session synchronously. Consider caching results."}
        )

    except Exception as e:
        logger.error(f"Error fetching drivers: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host=settings.api_host,
        port=settings.api_port,
        log_level=settings.log_level.lower()
    )
