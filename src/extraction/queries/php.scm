;; PHP Tree-sitter queries for KimiGraph
;; Extracts functions, classes, methods, interfaces, and calls

; ============================================================================
; FUNCTION DEFINITIONS
; ============================================================================

(function_definition
  name: (name) @function.name
) @function.definition

; ============================================================================
; CLASS DEFINITIONS
; ============================================================================

(class_declaration
  name: (name) @class.name
) @class.definition

; ============================================================================
; INTERFACE DEFINITIONS
; ============================================================================

(interface_declaration
  name: (name) @interface.name
) @interface.definition

; ============================================================================
; METHOD DEFINITIONS
; ============================================================================

(method_declaration
  name: (name) @method.name
) @method.definition

; ============================================================================
; FUNCTION CALLS
; ============================================================================

(function_call_expression
  function: [
    (name) @call.function
  ]
) @call.expression

(member_call_expression
  name: (name) @call.method
) @call.expression

; ============================================================================
; COMMENTS
; ============================================================================

(comment) @comment.definition
