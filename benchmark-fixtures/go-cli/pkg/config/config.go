package config

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type Config struct {
	ProjectName string   `json:"projectName"`
	OutputDir   string   `json:"outputDir"`
	Targets     []string `json:"targets"`
	LogLevel    string   `json:"logLevel"`
}

func Load() (*Config, error) {
	defaults := &Config{
		ProjectName: "my-project",
		OutputDir:   "./dist",
		Targets:     []string{"linux/amd64"},
		LogLevel:    "info",
	}

	configPath := filepath.Join(".", "go-cli.json")
	data, err := os.ReadFile(configPath)
	if err != nil {
		return defaults, nil
	}

	var override Config
	if err := json.Unmarshal(data, &override); err != nil {
		return nil, err
	}

	if override.ProjectName != "" {
		defaults.ProjectName = override.ProjectName
	}
	if override.OutputDir != "" {
		defaults.OutputDir = override.OutputDir
	}
	if len(override.Targets) > 0 {
		defaults.Targets = override.Targets
	}
	if override.LogLevel != "" {
		defaults.LogLevel = override.LogLevel
	}

	return defaults, nil
}

func (c *Config) Validate() error {
	if c.ProjectName == "" {
		return os.ErrInvalid
	}
	return nil
}
