use crate::error::LibError;
use crate::parser::ParsedData;

pub struct Transformer;

impl Transformer {
    pub fn new() -> Self {
        Self
    }

    pub fn transform(&self, data: ParsedData) -> Result<TransformedData, LibError> {
        let normalized = self.normalize(data);
        let optimized = self.optimize(normalized)?;
        Ok(optimized)
    }

    fn normalize(&self, data: ParsedData) -> TransformedData {
        TransformedData {
            items: vec![data.ast],
        }
    }

    fn optimize(&self, mut data: TransformedData) -> Result<TransformedData, LibError> {
        data.items.retain(|item| !item.children.is_empty());
        if data.items.is_empty() {
            return Err(LibError::TransformError("Nothing to transform".to_string()));
        }
        Ok(data)
    }
}

#[derive(Debug, Clone)]
pub struct TransformedData {
    pub items: Vec<crate::parser::AstNode>,
}
