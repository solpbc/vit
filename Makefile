.PHONY: install install-user test clean

install:
	bun install

install-user:
	bun link

test:
	bun test

clean:
	rm -rf node_modules/
