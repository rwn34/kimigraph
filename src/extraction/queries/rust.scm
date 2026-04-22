;; Rust Tree-sitter queries for KimiGraph
;; Extracts functions, structs, traits, enums, impls, calls, and imports

; ============================================================================
; FUNCTION DEFINITIONS
; ============================================================================

(function_item
  name: (identifier) @function.name
) @function.definition

; ============================================================================
; STRUCT DEFINITIONS
; ============================================================================

(struct_item
  name: (type_identifier) @class.name
) @class.definition

; ============================================================================
; TRAIT DEFINITIONS
; ============================================================================

(trait_item
  name: (type_identifier) @interface.name
) @interface.definition

; ============================================================================
; ENUM DEFINITIONS
; ============================================================================

(enum_item
  name: (type_identifier) @class.name
) @class.definition

; ============================================================================
; IMPL BLOCKS (treated as class definitions for the type)
; ============================================================================

(impl_item
  type: (type_identifier) @class.name
) @class.definition

; ============================================================================
; FUNCTION CALLS
; ============================================================================

(call_expression
  function: [
    (identifier) @call.function
    (scoped_identifier
      name: (identifier) @call.function
    )
    (field_expression
      field: (field_identifier) @call.method
    )
  ]
) @call.expression

; ============================================================================
; COMMENTS
; ============================================================================

(line_comment) @comment.definition
(block_comment) @comment.definition

; ============================================================================
; ANONYMOUS FUNCTIONS
; ============================================================================

(closure_expression) @anonymous.definition

; ============================================================================
; IMPORTS
; ============================================================================

(use_declaration
  argument: (_) @import.source
) @import.statement
