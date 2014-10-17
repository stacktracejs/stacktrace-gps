BROWSERS=Firefox,ChromeCanary,Opera,Safari,PhantomJS

test:
	@$(MAKE) lint
	@NODE_ENV=test ./node_modules/karma/bin/karma start --single-run --browsers $(BROWSERS)

lint:
	./node_modules/.bin/jshint ./spec/stacktrace-gps-spec.js ./stacktrace-gps.js

test-ci:
	$(MAKE) lint
	@echo TRAVIS_JOB_ID $(TRAVIS_JOB_ID)
	@NODE_ENV=test ./node_modules/karma/bin/karma start karma.conf.ci.js --single-run && \
		cat ./coverage/Chrome*/lcov.info | ./node_modules/coveralls/bin/coveralls.js --verbose

build: components
	@component build --dev

components: component.json
	@component install --dev

clean:
	rm -fr build coverage components template.js *.log

.PHONY: clean test
