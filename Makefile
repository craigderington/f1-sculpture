.PHONY: help build up down restart logs clean test

# Default target
help:
	@echo "F1 G-Force Sculpture Gallery - Docker Commands"
	@echo ""
	@echo "Available commands:"
	@echo "  make build          - Build all Docker images"
	@echo "  make up             - Start all services"
	@echo "  make up-dev         - Start all services in development mode"
	@echo "  make down           - Stop all services"
	@echo "  make restart        - Restart all services"
	@echo "  make logs           - View logs from all services"
	@echo "  make logs-api       - View API logs"
	@echo "  make logs-worker    - View Celery worker logs"
	@echo "  make logs-beat      - View Celery Beat scheduler logs"
	@echo "  make shell-api      - Open shell in API container"
	@echo "  make shell-worker   - Open shell in worker container"
	@echo "  make redis-cli      - Connect to Redis CLI"
	@echo "  make clean          - Stop services and remove volumes"
	@echo "  make clean-cache    - Clear FastF1 cache"
	@echo "  make test           - Run tests"
	@echo "  make flower         - Open Flower monitoring (http://localhost:5555)"
	@echo "  make health         - Check API health status"
	@echo "  make warm-cache     - Manually trigger cache warming for recent races"
	@echo ""

# Build Docker images
build:
	docker-compose build

# Start services
up:
	docker-compose up -d
	@echo "Services started!"
	@echo "API: http://localhost:8000"
	@echo "Frontend: http://localhost:3000"
	@echo "Flower: http://localhost:5555"
	@echo "Docs: http://localhost:8000/docs"

# Start services in development mode
up-dev:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
	@echo "Development mode with hot reload enabled"

# Stop services
down:
	docker-compose down

# Restart services
restart:
	docker-compose restart

# View all logs
logs:
	docker-compose logs -f

# View API logs only
logs-api:
	docker-compose logs -f api

# View Celery worker logs
logs-worker:
	docker-compose logs -f celery_worker

# View Celery Beat scheduler logs
logs-beat:
	docker-compose logs -f celery_beat

# View Redis logs
logs-redis:
	docker-compose logs -f redis

# Shell access to API container
shell-api:
	docker-compose exec api /bin/bash

# Shell access to worker container
shell-worker:
	docker-compose exec celery_worker /bin/bash

# Redis CLI access
redis-cli:
	docker-compose exec redis redis-cli

# Clean everything (including volumes)
clean:
	docker-compose down -v
	@echo "All services stopped and volumes removed"

# Clean FastF1 cache only
clean-cache:
	docker volume rm f1-sculpture_fastf1_cache || true
	@echo "FastF1 cache cleared"

# Run tests
test:
	docker-compose exec api pytest

# Health check
health:
	@echo "Checking API health..."
	@curl -s http://localhost:8000/health | python3 -m json.tool || echo "API not responding"

# Manually trigger cache warming
warm-cache:
	@echo "Triggering cache warming for recent races..."
	@curl -X POST http://localhost:8000/api/cache/warm/recent | python3 -m json.tool || echo "Failed to trigger cache warming"
	@echo ""
	@echo "Check progress in Flower or with 'make logs-worker'"

# Open Flower monitoring
flower:
	@echo "Opening Flower at http://localhost:5555"
	@open http://localhost:5555 || xdg-open http://localhost:5555 || echo "Please open http://localhost:5555 in your browser"

# Quick development workflow
dev: build up-dev

# Production deployment
prod: build up
	@echo "Production deployment complete"
	@make health

# Install local dependencies (for development without Docker)
install:
	pip install -r backend/requirements.txt

# Format code
format:
	docker-compose exec api black backend/
	docker-compose exec api flake8 backend/

# Show service status
status:
	docker-compose ps

# Show Docker volumes
volumes:
	docker volume ls | grep f1-sculpture
