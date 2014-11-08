BROWSERS=Firefox,ChromeCanary,Opera,Safari

test:
	$(MAKE) lint
	$(MAKE) build-source-map
	@NODE_ENV=test ./node_modules/karma/bin/karma start --single-run --browsers $(BROWSERS)

lint:
	./node_modules/.bin/jshint ./spec/stacktrace-gps-spec.js ./stacktrace-gps.js

test-ci:
	$(MAKE) lint
	$(MAKE) build-source-map
	@echo TRAVIS_JOB_ID $(TRAVIS_JOB_ID)
	@NODE_ENV=test ./node_modules/karma/bin/karma start karma.conf.ci.js --single-run && \
		cat ./coverage/Chrome*/lcov.info | ./node_modules/coveralls/bin/coveralls.js --verbose

build-source-map:
	./node_modules/.bin/webpack node_modules/source-map/lib/source-map/source-map-consumer.js \
	 	--output-library SourceMap --optimize-minimize build/source-map-consumer.min.js

build: components
	@component build --dev

components: component.json
	@component install --dev

clean:
	rm -fr build coverage components template.js *.log

.PHONY: clean test
