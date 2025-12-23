"""
Cache warming tasks for pre-loading popular F1 data.
Reduces first-load wait times by pre-fetching sessions and sculptures.
"""

from backend.tasks.celery_app import celery_app
from backend.tasks.sculpture_tasks import generate_sculpture_task
from backend.services.fastf1_service import FastF1Service
import logging
from typing import List, Dict, Any
from datetime import datetime

logger = logging.getLogger(__name__)


def get_cache_warming_strategy() -> Dict[str, Any]:
    """
    Define what data to pre-fetch for optimal cache warming.

    Strategy:
    - Current season's latest 2-3 races
    - Qualifying + Race sessions only (skip practice)
    - Top 15 drivers by popularity/championship position

    Returns:
        Dictionary with warming strategy configuration
    """
    current_year = datetime.now().year

    # Popular drivers to pre-cache (adjust based on current season)
    # These typically get ~80% of requests
    popular_drivers = [
        'VER', 'PER',  # Red Bull
        'HAM', 'RUS',  # Mercedes
        'LEC', 'SAI',  # Ferrari
        'NOR', 'PIA',  # McLaren
        'ALO', 'STR',  # Aston Martin
        'GAS', 'OCO',  # Alpine
        'ALB', 'SAR',  # Williams
        'TSU'          # RB
    ]

    # Sessions to warm (skip practice to save resources)
    priority_sessions = ['Q', 'R']  # Qualifying and Race

    return {
        'year': current_year,
        'recent_rounds': 3,  # Latest 3 races
        'sessions': priority_sessions,
        'drivers': popular_drivers,
        'max_concurrent': 5  # Process 5 sculptures in parallel
    }


@celery_app.task(name='warm_cache_for_recent_races')
def warm_cache_for_recent_races() -> Dict[str, Any]:
    """
    Periodic task to warm cache for recent popular races.

    Loads sessions and generates sculptures for top drivers in recent races.
    This runs overnight or weekly to ensure popular data is always cached.

    Returns:
        Summary of cache warming results
    """
    try:
        logger.info("Starting cache warming for recent races")

        strategy = get_cache_warming_strategy()
        year = strategy['year']
        sessions = strategy['sessions']
        drivers = strategy['drivers']

        f1_service = FastF1Service()

        # Get event schedule to find recent rounds
        schedule = f1_service.get_event_schedule(year)

        # Find completed events (past date)
        completed_events = [
            event for event in schedule
            if datetime.fromisoformat(event['date']) < datetime.now()
        ]

        if not completed_events:
            logger.warning(f"No completed events found for {year}")
            return {'status': 'no_events', 'year': year}

        # Get latest N rounds
        recent_rounds = sorted(
            completed_events,
            key=lambda x: x['round'],
            reverse=True
        )[:strategy['recent_rounds']]

        logger.info(f"Warming cache for {len(recent_rounds)} recent rounds")

        warmed_count = 0
        skipped_count = 0
        failed_count = 0

        # Process each round
        for event in recent_rounds:
            round_num = event['round']
            event_name = event['name']

            logger.info(f"Processing Round {round_num}: {event_name}")

            # Process each session type
            for session in sessions:
                try:
                    # Load session metadata first (this caches the session itself)
                    session_obj = f1_service.load_session(year, round_num, session)
                    session_drivers = f1_service.get_drivers_in_session(session_obj)

                    logger.info(f"  {session}: Found {len(session_drivers)} drivers")

                    # Generate sculptures for popular drivers
                    for driver_info in session_drivers:
                        driver_code = driver_info['abbreviation']

                        # Only pre-cache popular drivers
                        if driver_code not in drivers:
                            skipped_count += 1
                            continue

                        try:
                            # Submit sculpture generation task
                            # This will cache the result in Redis
                            result = generate_sculpture_task.apply_async(
                                args=[year, round_num, session, driver_code],
                                expires=600  # Task expires in 10 minutes
                            )

                            # Wait for completion (with timeout)
                            result.get(timeout=120)  # 2 minute timeout

                            warmed_count += 1
                            logger.info(f"    ✓ Cached: {driver_code}")

                        except Exception as e:
                            failed_count += 1
                            logger.error(f"    ✗ Failed {driver_code}: {e}")
                            continue

                except Exception as e:
                    logger.error(f"  Failed to process {session} for Round {round_num}: {e}")
                    continue

        summary = {
            'status': 'completed',
            'year': year,
            'rounds_processed': len(recent_rounds),
            'sculptures_warmed': warmed_count,
            'sculptures_skipped': skipped_count,
            'sculptures_failed': failed_count,
            'timestamp': datetime.now().isoformat()
        }

        logger.info(f"Cache warming complete: {summary}")
        return summary

    except Exception as e:
        logger.error(f"Cache warming failed: {e}", exc_info=True)
        return {
            'status': 'failed',
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }


@celery_app.task(name='warm_cache_specific_race')
def warm_cache_specific_race(
    year: int,
    round: int,
    sessions: List[str] = None,
    drivers: List[str] = None
) -> Dict[str, Any]:
    """
    Warm cache for a specific race with custom parameters.
    Useful for manual cache warming before expected high traffic.

    Args:
        year: F1 season year
        round: Race round number
        sessions: List of sessions to warm (default: ['Q', 'R'])
        drivers: List of driver codes to warm (default: all drivers)

    Returns:
        Summary of warming results
    """
    try:
        logger.info(f"Warming cache for specific race: {year} Round {round}")

        if sessions is None:
            sessions = ['Q', 'R']

        f1_service = FastF1Service()
        warmed_count = 0
        failed_count = 0

        for session in sessions:
            try:
                # Load session
                session_obj = f1_service.load_session(year, round, session)
                session_drivers = f1_service.get_drivers_in_session(session_obj)

                # Filter drivers if specified
                if drivers:
                    session_drivers = [
                        d for d in session_drivers
                        if d['abbreviation'] in drivers
                    ]

                logger.info(f"Processing {session}: {len(session_drivers)} drivers")

                # Generate sculptures
                for driver_info in session_drivers:
                    driver_code = driver_info['abbreviation']

                    try:
                        result = generate_sculpture_task.apply_async(
                            args=[year, round, session, driver_code],
                            expires=600
                        )
                        result.get(timeout=120)
                        warmed_count += 1
                        logger.info(f"  ✓ Cached: {driver_code}")

                    except Exception as e:
                        failed_count += 1
                        logger.error(f"  ✗ Failed {driver_code}: {e}")
                        continue

            except Exception as e:
                logger.error(f"Failed to process {session}: {e}")
                continue

        summary = {
            'status': 'completed',
            'year': year,
            'round': round,
            'sessions': sessions,
            'sculptures_warmed': warmed_count,
            'sculptures_failed': failed_count,
            'timestamp': datetime.now().isoformat()
        }

        logger.info(f"Specific race warming complete: {summary}")
        return summary

    except Exception as e:
        logger.error(f"Specific race warming failed: {e}", exc_info=True)
        return {
            'status': 'failed',
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }
