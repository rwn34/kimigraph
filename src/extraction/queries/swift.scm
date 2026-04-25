;; Swift Tree-sitter queries for KimiGraph
;; Extracts functions, classes, protocols, and calls

; ============================================================================
; FUNCTION DEFINITIONS
; ============================================================================

(function_declaration
  name: (simple_identifier) @function.name
) @function.definition

; ============================================================================
; CLASS DEFINITIONS
; ============================================================================

(class_declaration
  name: (type_identifier) @class.name
) @class.definition

; ============================================================================
; PROTOCOL DEFINITIONS
; ============================================================================

(protocol_declaration
  name: (type_identifier) @interface.name
) @interface.definition

; ============================================================================
; FUNCTION CALLS
; ============================================================================

(call_expression
  (simple_identifier) @call.function
) @call.expression

(navigation_expression
  (navigation_suffix) @call.method
) @call.expression

; ============================================================================
; COMMENTS
; ============================================================================

(comment) @comment.definition
