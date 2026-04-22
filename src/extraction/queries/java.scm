;; Java Tree-sitter queries for KimiGraph
;; Extracts methods, classes, interfaces, enums, calls, and imports

; ============================================================================
; METHOD DEFINITIONS
; ============================================================================

(method_declaration
  name: (identifier) @method.name
) @method.definition

; ============================================================================
; CLASS DEFINITIONS
; ============================================================================

(class_declaration
  name: (identifier) @class.name
) @class.definition

; ============================================================================
; INTERFACE DEFINITIONS
; ============================================================================

(interface_declaration
  name: (identifier) @interface.name
) @interface.definition

; ============================================================================
; ENUM DEFINITIONS
; ============================================================================

(enum_declaration
  name: (identifier) @class.name
) @class.definition

; ============================================================================
; METHOD CALLS
; ============================================================================

(method_invocation
  name: (identifier) @call.method
) @call.expression

; ============================================================================
; COMMENTS
; ============================================================================

(line_comment) @comment.definition
(block_comment) @comment.definition

; ============================================================================
; ANONYMOUS FUNCTIONS
; ============================================================================

(lambda_expression) @anonymous.definition

; ============================================================================
; IMPORTS
; ============================================================================

(import_declaration
  (identifier) @import.source
) @import.statement
