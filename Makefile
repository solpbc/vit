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
	npm version $(BUMP)
	git push
	git push --tags

publish:
	npm publish

ship: release publish
