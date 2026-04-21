package main

import (
	"fmt"
	"os"

	"go-cli/cmd"
	"go-cli/pkg/config"
	"go-cli/pkg/logger"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to load config: %v\n", err)
		os.Exit(1)
	}

	log := logger.New(cfg.LogLevel)
	log.Info("Starting go-cli")

	root := cmd.NewRootCommand(cfg, log)
	if err := root.Execute(); err != nil {
		log.Error(err.Error())
		os.Exit(1)
	}
}
