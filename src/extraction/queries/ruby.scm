;; Ruby Tree-sitter queries for KimiGraph
;; Extracts methods, classes, modules, calls, and imports

; ============================================================================
; METHOD DEFINITIONS
; ============================================================================

(method
  name: (identifier) @function.name
) @function.definition

(singleton_method
  name: (identifier) @function.name
) @function.definition

; ============================================================================
; CLASS DEFINITIONS
; ============================================================================

(class
  name: (constant) @class.name
) @class.definition

; ============================================================================
; MODULE DEFINITIONS
; ============================================================================

(module
  name: (constant) @class.name
) @class.definition

; ============================================================================
; FUNCTION CALLS
; ============================================================================

(call
  method: [
    (identifier) @call.function
    (constant) @call.function
  ]
) @call.expression

; ============================================================================
; COMMENTS
; ============================================================================

(comment) @comment.definition

; ============================================================================
; IMPORTS (require / require_relative / include / extend)
; ============================================================================

(call
  method: (identifier) @import.method
  (#match? @import.method "^(require|require_relative|include|extend|autoload)$")
  arguments: (argument_list
    [(string) (constant) (identifier)] @import.source
  )
) @import.statement
