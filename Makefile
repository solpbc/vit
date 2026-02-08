.PHONY: install test clean

install:
	bun install

test:
	bun test

clean:
	rm -rf node_modules/
