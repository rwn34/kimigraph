pub mod error;
pub mod parser;
pub mod serializer;
pub mod transform;
pub mod validator;

use parser::Parser;
use transform::Transformer;
use validator::Validator;
use serializer::Serializer;
use error::LibError;

pub struct Pipeline {
    parser: Parser,
    transformer: Transformer,
    validator: Validator,
    serializer: Serializer,
}

impl Pipeline {
    pub fn new() -> Self {
        Self {
            parser: Parser::new(),
            transformer: Transformer::new(),
            validator: Validator::new(),
            serializer: Serializer::new(),
        }
    }

    pub fn process(&self, input: &str) -> Result<String, LibError> {
        let parsed = self.parser.parse(input)?;
        let transformed = self.transformer.transform(parsed)?;
        self.validator.validate(&transformed)?;
        let output = self.serializer.serialize(transformed)?;
        Ok(output)
    }
}

impl Default for Pipeline {
    fn default() -> Self {
        Self::new()
    }
}

pub fn run_pipeline(input: &str) -> Result<String, LibError> {
    let pipeline = Pipeline::new();
    pipeline.process(input)
}
