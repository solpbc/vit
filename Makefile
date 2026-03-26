.PHONY: install link test test-node clean

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

publish:
	npm publish
