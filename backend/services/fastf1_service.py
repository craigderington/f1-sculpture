"""
FastF1 service - handles loading and accessing F1 session data.
"""

import fastf1
import logging
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)


class FastF1Service:
    """Service for loading and accessing F1 data via the FastF1 library."""

    def __init__(self):
        """Initialize the FastF1 service."""
        pass

    def get_event_schedule(self, year: int) -> List[Dict[str, Any]]:
        """
        Get all F1 events for a given year.

        Args:
            year: F1 season year

        Returns:
            List of event dictionaries
        """
        logger.info(f"Fetching event schedule for {year}")
        schedule = fastf1.get_event_schedule(year)
        events = []

        for idx, event in schedule.iterrows():
            events.append({
                'round': int(event['RoundNumber']),
                'name': event['EventName'],
                'location': event['Location'],
                'country': event['Country'],
                'date': event['EventDate'].isoformat() if hasattr(event['EventDate'], 'isoformat') else str(event['EventDate'])
            })

        logger.info(f"Found {len(events)} events for {year}")
        return events

    def get_sessions_for_event(self, year: int, round: int) -> Dict[str, Any]:
        """
        Get available sessions for a specific event.

        Args:
            year: F1 season year
            round: Race round number

        Returns:
            Dictionary with event name and sessions list
        """
        logger.info(f"Fetching sessions for {year} Round {round}")
        event = fastf1.get_event(year, round)

        # Map session codes to display names
        session_display_names = {
            'FP1': 'Practice 1',
            'FP2': 'Practice 2',
            'FP3': 'Practice 3',
            'Q': 'Qualifying',
            'S': 'Sprint Race',
            'SS': 'Sprint Shootout',
            'SQ': 'Sprint Qualifying',
            'R': 'Race'
        }

        sessions = []
        for session_name in ['FP1', 'FP2', 'FP3', 'Q', 'S', 'SS', 'SQ', 'R']:
            try:
                session = fastf1.get_session(year, round, session_name)
                sessions.append({
                    'name': session_name,
                    'fullName': session_display_names.get(session_name, session.name),
                    'date': session.date.isoformat() if hasattr(session.date, 'isoformat') else str(session.date)
                })
            except Exception as e:
                logger.debug(f"Session {session_name} not available: {e}")
                continue

        logger.info(f"Found {len(sessions)} sessions for {event['EventName']}")
        return {
            'eventName': event['EventName'],
            'sessions': sessions
        }

    def load_session(self, year: int, round: int, session_name: str):
        """
        Load a complete F1 session with all data.
        This is the main blocking operation (30-60s first load, 2-3s cached).

        Args:
            year: F1 season year
            round: Race round number
            session_name: Session identifier (FP1, FP2, FP3, Q, R, etc.)

        Returns:
            Loaded FastF1 session object
        """
        logger.info(f"Loading session: {year} Round {round} {session_name}")
        session = fastf1.get_session(year, round, session_name)
        session.load()
        logger.info(f"Session loaded successfully: {session.event['EventName']} {session.name}")
        return session

    def get_drivers_in_session(self, session) -> List[Dict[str, Any]]:
        """
        Get all drivers who participated in a session.

        Args:
            session: Loaded FastF1 session object

        Returns:
            List of driver dictionaries
        """
        logger.info(f"Extracting drivers from session")
        drivers = []

        for driver in session.drivers:
            driver_info = session.get_driver(driver)
            drivers.append({
                'abbreviation': driver_info['Abbreviation'],
                'number': str(driver_info['DriverNumber']),
                'fullName': driver_info['FullName'],
                'teamName': driver_info['TeamName'],
                'teamColor': driver_info['TeamColor']
            })

        logger.info(f"Found {len(drivers)} drivers")
        return drivers

    def get_driver_fastest_lap_telemetry(self, session, driver_code: str):
        """
        Get the telemetry for a driver's fastest lap in the session.

        Args:
            session: Loaded FastF1 session object
            driver_code: Driver abbreviation (e.g., 'VER', 'HAM')

        Returns:
            Tuple of (telemetry DataFrame, fastest_lap info)

        Raises:
            ValueError: If no laps or telemetry found for driver
        """
        logger.info(f"Extracting fastest lap telemetry for {driver_code}")

        # Get driver's laps
        driver_laps = session.laps.pick_driver(driver_code)

        if driver_laps.empty:
            raise ValueError(f"No laps found for driver {driver_code}")

        # Get fastest lap
        fastest_lap = driver_laps.pick_fastest()

        # Get telemetry
        telemetry = fastest_lap.get_telemetry()

        if telemetry.empty:
            raise ValueError(f"No telemetry data available for {driver_code}")

        logger.info(f"Telemetry extracted: {len(telemetry)} data points, lap time={fastest_lap['LapTime']}")

        # Get driver info for team name
        driver_info = session.get_driver(driver_code)

        lap_info = {
            'abbreviation': driver_code,
            'lapTime': str(fastest_lap['LapTime']),
            'compound': fastest_lap['Compound'],
            'teamName': driver_info['TeamName']
        }

        return telemetry, lap_info
