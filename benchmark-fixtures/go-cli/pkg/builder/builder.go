package builder

import (
	"fmt"
	"os"
	"path/filepath"

	"go-cli/pkg/config"
	"go-cli/pkg/logger"
)

type Builder struct {
	config *config.Config
}

func New(cfg *config.Config) *Builder {
	return &Builder{config: cfg}
}

func (b *Builder) Build() error {
	log := logger.New(b.config.LogLevel)
	log.Info(fmt.Sprintf("Building %s...", b.config.ProjectName))

	if err := os.MkdirAll(b.config.OutputDir, 0755); err != nil {
		return fmt.Errorf("failed to create output dir: %w", err)
	}

	for _, target := range b.config.Targets {
		if err := b.buildTarget(target); err != nil {
			return fmt.Errorf("build failed for %s: %w", target, err)
		}
	}

	log.Info("Build completed successfully")
	return nil
}

func (b *Builder) buildTarget(target string) error {
	outputPath := filepath.Join(b.config.OutputDir, target, b.config.ProjectName)
	// Simplified — real impl would compile Go code
	return os.WriteFile(outputPath, []byte("binary"), 0755)
}

func (b *Builder) Clean() error {
	return os.RemoveAll(b.config.OutputDir)
}
