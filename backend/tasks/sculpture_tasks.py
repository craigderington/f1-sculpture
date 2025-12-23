"""
Celery tasks for generating F1 sculptures in the background with progress updates.
"""

from celery import Task
from backend.tasks.celery_app import celery_app
from backend.services.fastf1_service import FastF1Service
from backend.services.telemetry_processor import TelemetryProcessor
from backend.config import setup_fastf1_cache, settings
import logging
from typing import Dict, Any, List
import redis
import json

logger = logging.getLogger(__name__)

# Initialize FastF1 cache on worker startup
setup_fastf1_cache()

# Initialize Redis client for caching (synchronous)
redis_client = redis.from_url(settings.redis_url, decode_responses=True)


def cache_sculpture(year: int, round: int, session: str, driver: str, sculpture_data: Dict[str, Any]):
    """
    Cache a sculpture in Redis with TTL.
    Uses synchronous Redis client since Celery tasks are synchronous.
    """
    try:
        cache_key = f"f1:sculpture:{year}:{round}:{session}:{driver}"
        redis_client.setex(
            cache_key,
            settings.sculpture_cache_ttl,
            json.dumps(sculpture_data)
        )
        logger.info(f"Cached sculpture: {cache_key}")
    except Exception as e:
        logger.error(f"Failed to cache sculpture: {e}")
        # Don't raise - caching failure shouldn't fail the task


class CallbackTask(Task):
    """Base task with callbacks for progress updates."""

    def on_success(self, retval, task_id, args, kwargs):
        """Called when task succeeds."""
        logger.info(f"Task {task_id} completed successfully")

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Called when task fails."""
        logger.error(f"Task {task_id} failed: {exc}")

    def on_retry(self, exc, task_id, args, kwargs, einfo):
        """Called when task is retried."""
        logger.warning(f"Task {task_id} retrying: {exc}")


@celery_app.task(bind=True, base=CallbackTask, name='generate_sculpture')
def generate_sculpture_task(
    self,
    year: int,
    round: int,
    session: str,
    driver: str
) -> Dict[str, Any]:
    """
    Generate a 3D sculpture for a single driver with detailed progress updates.

    Args:
        year: F1 season year
        round: Race round number
        session: Session identifier (FP1, FP2, FP3, Q, R, etc.)
        driver: Driver abbreviation (e.g., 'VER', 'HAM')

    Returns:
        Complete sculpture data dictionary

    Progress stages with granular updates:
        - loading_session (5% - 35%): Loading F1 session data from servers
        - extracting_telemetry (40% - 65%): Finding driver and extracting fastest lap
        - processing_sculpture (70% - 95%): Processing G-force calculations and building sculpture
        - Complete (100%): Final sculpture data ready
    """
    try:
        logger.info(f"Starting sculpture generation: {year} R{round} {session} - {driver}")

        # Map session codes to friendly display names EARLY (before any progress updates)
        session_display_names = {
            'FP1': 'Free Practice 1',
            'FP2': 'Free Practice 2',
            'FP3': 'Free Practice 3',
            'Q': 'Qualifying',
            'S': 'Sprint',
            'SS': 'Sprint Shootout',
            'SQ': 'Sprint Qualifying',
            'R': 'Race'
        }
        session_friendly_name = session_display_names.get(session, session)

        # Stage 1: Loading session (5% - 35%)
        self.update_state(
            state='PROGRESS',
            meta={
                'stage': 'loading_session',
                'progress': 5,
                'message': f'Initializing {session_friendly_name} session for Round {round}...',
                'year': year,
                'session_name': session_friendly_name
            }
        )

        f1_service = FastF1Service()

        # Update progress before loading (session loading can take 30-60s)
        self.update_state(
            state='PROGRESS',
            meta={
                'stage': 'loading_session',
                'progress': 10,
                'message': f'Downloading {session_friendly_name} session data from F1 servers...',
                'year': year,
                'session_name': session_friendly_name
            }
        )

        session_obj = f1_service.load_session(year, round, session)

        # Get full session details for better UI display
        event_name = session_obj.event['EventName']
        session_date = str(session_obj.date.date()) if hasattr(session_obj.date, 'date') else str(session_obj.date)

        logger.info(f"Session loaded: {event_name} {session_friendly_name}")

        # Update with full details
        self.update_state(
            state='PROGRESS',
            meta={
                'stage': 'loading_session',
                'progress': 35,
                'message': f'Session loaded: {event_name} - {session_friendly_name}',
                'event_name': event_name,
                'session_name': session_friendly_name,
                'session_date': session_date,
                'year': year
            }
        )

        # Stage 2: Extracting telemetry (40% - 65%)
        self.update_state(
            state='PROGRESS',
            meta={
                'stage': 'extracting_telemetry',
                'progress': 40,
                'message': f'Finding {driver} in {event_name}...',
                'event_name': event_name,
                'session_name': session_friendly_name,
                'session_date': session_date,
                'year': year,
                'driver': driver
            }
        )

        # Extract telemetry
        telemetry, lap_info = f1_service.get_driver_fastest_lap_telemetry(session_obj, driver)

        logger.info(f"Telemetry extracted: {len(telemetry)} data points")

        self.update_state(
            state='PROGRESS',
            meta={
                'stage': 'extracting_telemetry',
                'progress': 65,
                'message': f'Telemetry extracted: {len(telemetry)} data points from {driver}',
                'event_name': event_name,
                'session_name': session_friendly_name,
                'session_date': session_date,
                'year': year,
                'driver': driver
            }
        )

        # Stage 3: Processing sculpture (70% - 95%)
        self.update_state(
            state='PROGRESS',
            meta={
                'stage': 'processing_sculpture',
                'progress': 70,
                'message': f'Calculating G-forces for {driver}...',
                'event_name': event_name,
                'session_name': session_friendly_name,
                'session_date': session_date,
                'year': year,
                'driver': driver
            }
        )

        processor = TelemetryProcessor()
        sculpture_data = processor.process_telemetry_to_sculpture(telemetry)

        # Update after processing
        self.update_state(
            state='PROGRESS',
            meta={
                'stage': 'processing_sculpture',
                'progress': 95,
                'message': f'Finalizing sculpture for {driver}...',
                'event_name': event_name,
                'session_name': session_friendly_name,
                'session_date': session_date,
                'year': year,
                'driver': driver
            }
        )

        # Add driver info
        sculpture_data['driver'] = lap_info

        logger.info(f"Sculpture generated successfully for {driver}")

        # Cache the sculpture in Redis for future requests
        cache_sculpture(year, round, session, driver, sculpture_data)

        return sculpture_data

    except ValueError as e:
        # Driver or telemetry not found
        logger.error(f"Sculpture generation failed: {e}")
        raise

    except Exception as e:
        # Unexpected error
        logger.error(f"Unexpected error in sculpture generation: {e}", exc_info=True)
        raise


@celery_app.task(bind=True, base=CallbackTask, name='compare_drivers')
def compare_drivers_task(
    self,
    year: int,
    round: int,
    session: str,
    drivers: List[str]
) -> Dict[str, Any]:
    """
    Generate sculptures for multiple drivers with optimized session sharing.
    Loads session once and reuses it for all drivers.

    Args:
        year: F1 season year
        round: Race round number
        session: Session identifier
        drivers: List of driver abbreviations

    Returns:
        Dictionary with list of sculptures
    """
    try:
        logger.info(f"Starting multi-driver comparison: {year} R{round} {session} - {drivers}")

        if len(drivers) > 5:
            raise ValueError("Maximum 5 drivers allowed for comparison")

        # Map session codes to friendly display names
        session_display_names = {
            'FP1': 'Free Practice 1',
            'FP2': 'Free Practice 2',
            'FP3': 'Free Practice 3',
            'Q': 'Qualifying',
            'S': 'Sprint',
            'SS': 'Sprint Shootout',
            'SQ': 'Sprint Qualifying',
            'R': 'Race'
        }
        session_friendly_name = session_display_names.get(session, session)

        # Stage 1: Loading session (15%)
        self.update_state(
            state='PROGRESS',
            meta={
                'stage': 'loading_session',
                'progress': 15,
                'message': f'Loading {session_friendly_name} session for Round {round}...',
                'year': year,
                'session_name': session_friendly_name
            }
        )

        f1_service = FastF1Service()
        session_obj = f1_service.load_session(year, round, session)

        # Get full session details for better UI display
        event_name = session_obj.event['EventName']
        session_date = str(session_obj.date.date()) if hasattr(session_obj.date, 'date') else str(session_obj.date)

        logger.info(f"Session loaded for {len(drivers)} drivers: {event_name} - {session_friendly_name}")

        # Process each driver
        sculptures = []
        processor = TelemetryProcessor()

        for idx, driver in enumerate(drivers):
            # Update progress (20% -> 95%, divided by number of drivers)
            driver_progress = 20 + int((idx / len(drivers)) * 75)

            self.update_state(
                state='PROGRESS',
                meta={
                    'stage': 'extracting_telemetry',
                    'progress': driver_progress,
                    'message': f'Processing driver {idx + 1}/{len(drivers)}: {driver}...',
                    'event_name': event_name,
                    'session_name': session_friendly_name,
                    'session_date': session_date,
                    'year': year
                }
            )

            try:
                # Extract telemetry (uses cached session)
                telemetry, lap_info = f1_service.get_driver_fastest_lap_telemetry(session_obj, driver)

                # Process sculpture
                sculpture_data = processor.process_telemetry_to_sculpture(telemetry)
                sculpture_data['driver'] = lap_info
                sculpture_data['driverCode'] = driver

                # Cache individual driver sculpture
                cache_sculpture(year, round, session, driver, sculpture_data)

                sculptures.append(sculpture_data)

                logger.info(f"Processed {driver}: {idx + 1}/{len(drivers)}")

            except Exception as e:
                logger.error(f"Failed to process driver {driver}: {e}")
                # Continue with other drivers
                continue

        if not sculptures:
            raise ValueError("No sculptures could be generated for the requested drivers")

        logger.info(f"Comparison complete: {len(sculptures)}/{len(drivers)} sculptures generated")

        return {
            'sculptures': sculptures,
            'total_requested': len(drivers),
            'total_generated': len(sculptures)
        }

    except Exception as e:
        logger.error(f"Error in driver comparison: {e}", exc_info=True)
        raise


@celery_app.task(bind=True, base=CallbackTask, name='load_session_metadata')
def load_session_metadata_task(
    self,
    year: int,
    round: int,
    session: str
) -> Dict[str, Any]:
    """
    Pre-load and cache session metadata without generating sculptures.
    Useful for warming the cache.

    Args:
        year: F1 season year
        round: Race round number
        session: Session identifier

    Returns:
        Session metadata and driver list
    """
    try:
        logger.info(f"Loading session metadata: {year} R{round} {session}")

        # Map session codes to friendly display names
        session_display_names = {
            'FP1': 'Free Practice 1',
            'FP2': 'Free Practice 2',
            'FP3': 'Free Practice 3',
            'Q': 'Qualifying',
            'S': 'Sprint',
            'SS': 'Sprint Shootout',
            'SQ': 'Sprint Qualifying',
            'R': 'Race'
        }
        session_friendly_name = session_display_names.get(session, session)

        self.update_state(
            state='PROGRESS',
            meta={
                'stage': 'loading_session',
                'progress': 50,
                'message': f'Loading {session_friendly_name} session metadata...',
                'year': year,
                'session_name': session_friendly_name
            }
        )

        f1_service = FastF1Service()
        session_obj = f1_service.load_session(year, round, session)
        drivers = f1_service.get_drivers_in_session(session_obj)

        event_name = session_obj.event['EventName']
        session_date = str(session_obj.date.date()) if hasattr(session_obj.date, 'date') else str(session_obj.date)

        metadata = {
            'event_name': event_name,
            'session_name': session_friendly_name,
            'session_date': session_date,
            'drivers': drivers,
            'total_drivers': len(drivers)
        }

        logger.info(f"Session metadata loaded: {metadata['event_name']}, {len(drivers)} drivers")

        return metadata

    except Exception as e:
        logger.error(f"Error loading session metadata: {e}", exc_info=True)
        raise


# Additional utility tasks
@celery_app.task(name='health_check')
def health_check_task() -> Dict[str, str]:
    """
    Simple health check task to verify Celery worker is responding.

    Returns:
        Status dictionary
    """
    logger.info("Health check task executed")
    return {'status': 'healthy', 'worker': 'responding'}
