.PHONY: test lint build check

test:
	pytest

lint:
	ruff check .

build:
	python -m build

check: lint test
