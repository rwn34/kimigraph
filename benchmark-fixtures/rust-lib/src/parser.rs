use crate::error::LibError;

pub struct Parser;

impl Parser {
    pub fn new() -> Self {
        Self
    }

    pub fn parse(&self, input: &str) -> Result<ParsedData, LibError> {
        if input.is_empty() {
            return Err(LibError::ParseError("Input is empty".to_string()));
        }

        let tokens = self.tokenize(input);
        let ast = self.build_ast(tokens)?;
        Ok(ParsedData { ast })
    }

    fn tokenize(&self, input: &str) -> Vec<Token> {
        input
            .split_whitespace()
            .map(|s| Token {
                value: s.to_string(),
            })
            .collect()
    }

    fn build_ast(&self, tokens: Vec<Token>) -> Result<AstNode, LibError> {
        if tokens.is_empty() {
            return Err(LibError::ParseError("No tokens".to_string()));
        }
        Ok(AstNode {
            children: tokens.into_iter().map(|t| AstNode::leaf(t.value)).collect(),
        })
    }
}

#[derive(Debug, Clone)]
pub struct ParsedData {
    pub ast: AstNode,
}

#[derive(Debug, Clone)]
pub struct Token {
    pub value: String,
}

#[derive(Debug, Clone)]
pub struct AstNode {
    pub children: Vec<AstNode>,
}

impl AstNode {
    pub fn leaf(value: String) -> Self {
        Self {
            children: vec![],
        }
    }
}
