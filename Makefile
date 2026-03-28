BUMP ?= patch

.PHONY: install link test test-node clean release publish ship

install:
	bun install

link:
	bun install && node bin/vit.js link

test: test-node
	bun test

test-node:
	node bin/vit.js --help > /dev/null
	node bin/vit.js --version > /dev/null

clean:
	rm -rf node_modules/

release: test
	npm version $(BUMP) --no-git-tag-version
	@v=$$(node -p "require('./package.json').version") && \
		git add package.json package-lock.json && \
		git commit -m "v$$v" && \
		git tag "v$$v" && \
		git push && \
		git push --tags

publish:
ifdef OTP
	npm publish --otp=$(OTP)
else
	npm publish
endif

ship: release publish
