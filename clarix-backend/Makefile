.PHONY: install run run-stdlib test check
install:
	python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
run:
	python3 -m clarix
run-stdlib:   # dependency-free development fallback
	python3 -m clarix --server stdlib
check:        # prints config, host air-gap posture and Ollama reachability
	python3 -m clarix --check
test:
	python3 -m unittest discover -s tests -t . -v
