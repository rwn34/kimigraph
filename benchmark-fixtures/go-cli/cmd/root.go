package cmd

import (
	"os"

	"go-cli/pkg/builder"
	"go-cli/pkg/config"
	"go-cli/pkg/deployer"
	"go-cli/pkg/logger"
)

type RootCommand struct {
	config   *config.Config
	logger   *logger.Logger
	builder  *builder.Builder
	deployer *deployer.Deployer
}

func NewRootCommand(cfg *config.Config, log *logger.Logger) *RootCommand {
	return &RootCommand{
		config:   cfg,
		logger:   log,
		builder:  builder.New(cfg),
		deployer: deployer.New(cfg),
	}
}

func (r *RootCommand) Execute() error {
	r.logger.Info("Executing root command")

	if len(os.Args) < 2 {
		return r.printHelp()
	}

	switch os.Args[1] {
	case "build":
		return r.runBuild()
	case "deploy":
		return r.runDeploy()
	default:
		return r.printHelp()
	}
}

func (r *RootCommand) printHelp() error {
	println("Usage: go-cli <build|deploy>")
	return nil
}

func (r *RootCommand) runBuild() error {
	return r.builder.Build()
}

func (r *RootCommand) runDeploy() error {
	return r.deployer.Deploy()
}
