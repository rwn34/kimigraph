use std::fmt;

#[derive(Debug, Clone)]
pub enum LibError {
    ParseError(String),
    TransformError(String),
    ValidationError(String),
    SerializeError(String),
}

impl fmt::Display for LibError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LibError::ParseError(msg) => write!(f, "Parse error: {}", msg),
            LibError::TransformError(msg) => write!(f, "Transform error: {}", msg),
            LibError::ValidationError(msg) => write!(f, "Validation error: {}", msg),
            LibError::SerializeError(msg) => write!(f, "Serialize error: {}", msg),
        }
    }
}

impl std::error::Error for LibError {}
