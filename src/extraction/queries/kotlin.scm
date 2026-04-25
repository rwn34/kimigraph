;; Kotlin Tree-sitter queries for KimiGraph
;; Extracts functions, classes, objects, calls, and imports

; ============================================================================
; FUNCTION DEFINITIONS (top-level and methods — extractor distinguishes)
; ============================================================================

(function_declaration
  (simple_identifier) @function.name
) @function.definition

; ============================================================================
; CLASS DEFINITIONS
; ============================================================================

(class_declaration
  (type_identifier) @class.name
) @class.definition

; ============================================================================
; OBJECT DEFINITIONS
; ============================================================================

(object_declaration
  (type_identifier) @class.name
) @class.definition

; ============================================================================
; FUNCTION CALLS
; ============================================================================

(call_expression
  (simple_identifier) @call.function
) @call.expression

(navigation_expression
  (simple_identifier) @call.function
) @call.expression

; ============================================================================
; COMMENTS
; ============================================================================

; Kotlin grammar does not expose comment nodes in the AST
; (line_comment) @comment.definition
