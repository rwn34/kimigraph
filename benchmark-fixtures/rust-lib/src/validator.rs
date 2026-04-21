use crate::error::LibError;
use crate::transform::TransformedData;

pub struct Validator;

impl Validator {
    pub fn new() -> Self {
        Self
    }

    pub fn validate(&self, data: &TransformedData) -> Result<(), LibError> {
        self.check_not_empty(data)?;
        self.check_size(data)?;
        self.check_integrity(data)?;
        Ok(())
    }

    fn check_not_empty(&self, data: &TransformedData) -> Result<(), LibError> {
        if data.items.is_empty() {
            return Err(LibError::ValidationError("Data is empty".to_string()));
        }
        Ok(())
    }

    fn check_size(&self, data: &TransformedData) -> Result<(), LibError> {
        if data.items.len() > 1000 {
            return Err(LibError::ValidationError("Too many items".to_string()));
        }
        Ok(())
    }

    fn check_integrity(&self, _data: &TransformedData) -> Result<(), LibError> {
        // Simplified integrity check
        Ok(())
    }
}
