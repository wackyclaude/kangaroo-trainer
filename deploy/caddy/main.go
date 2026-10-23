// The Caddy program with the standard modules, exactly as the official build includes them.
// Built in deploy/caddy/Dockerfile with a patched Go toolchain and libraries.
package main

import (
	caddycmd "github.com/caddyserver/caddy/v2/cmd"

	_ "github.com/caddyserver/caddy/v2/modules/standard"
)

func main() {
	caddycmd.Main()
}
