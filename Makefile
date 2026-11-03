# Local use of the demos. The pages in docs/ load data with fetch and ES modules, so they need a web server.
PORT ?= 8070

.PHONY: serve stop check

serve:  ## start a local server on $(PORT) unless one runs there, then open the index
	@curl -s -o /dev/null http://localhost:$(PORT)/ || (python3 -m http.server $(PORT) --bind 127.0.0.1 --directory docs >/dev/null 2>&1 &)
	@until curl -s -o /dev/null http://localhost:$(PORT)/; do sleep 0.2; done
	open http://localhost:$(PORT)/

stop:  ## stop the server started by make serve
	-pkill -f "http.server $(PORT)"

check: node_modules  ## load every demo and preset in headless Chromium, fail on console errors
	node scripts/check.mjs

node_modules: package.json
	npm install
	npx playwright install chromium
