use crate::error::LibError;
use crate::transform::TransformedData;

pub struct Serializer;

impl Serializer {
    pub fn new() -> Self {
        Self
    }

    pub fn serialize(&self, data: TransformedData) -> Result<String, LibError> {
        let mut output = String::new();
        for item in &data.items {
            output.push_str(&self.serialize_node(item));
            output.push('\n');
        }
        Ok(output)
    }

    fn serialize_node(&self, node: &crate::parser::AstNode) -> String {
        if node.children.is_empty() {
            return "leaf".to_string();
        }
        let children: Vec<String> = node
            .children
            .iter()
            .map(|c| self.serialize_node(c))
            .collect();
        format!("[{}]", children.join(", "))
    }
}
