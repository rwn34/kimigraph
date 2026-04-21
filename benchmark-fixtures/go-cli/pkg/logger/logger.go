package logger

import (
	"fmt"
	"os"
	"time"
)

type Logger struct {
	level string
}

func New(level string) *Logger {
	return &Logger{level: level}
}

func (l *Logger) Info(msg string) {
	if l.shouldLog("info") {
		fmt.Printf("[INFO] %s %s\n", time.Now().Format(time.RFC3339), msg)
	}
}

func (l *Logger) Warn(msg string) {
	if l.shouldLog("warn") {
		fmt.Printf("[WARN] %s %s\n", time.Now().Format(time.RFC3339), msg)
	}
}

func (l *Logger) Error(msg string) {
	if l.shouldLog("error") {
		fmt.Fprintf(os.Stderr, "[ERROR] %s %s\n", time.Now().Format(time.RFC3339), msg)
	}
}

func (l *Logger) shouldLog(level string) bool {
	levels := map[string]int{
		"debug": 0,
		"info":  1,
		"warn":  2,
		"error": 3,
	}
	return levels[level] >= levels[l.level]
}
