.PHONY: install test ci format clean

install:
	uv sync

test:
	pytest

ci:
	ruff format .
	ruff check --fix .

format:
	ruff format .
	ruff check --fix .

clean:
	rm -rf build/ dist/ *.egg-info/ .pytest_cache/ .ruff_cache/
	find . -type d -name __pycache__ -exec rm -rf {} +
