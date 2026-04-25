;; Ruby Tree-sitter queries for KimiGraph
;; Extracts methods, classes, modules, calls, and imports

; ============================================================================
; TOP-LEVEL METHOD DEFINITIONS (treated as functions)
; ============================================================================

(method
  name: (identifier) @function.name
) @function.definition

(singleton_method
  name: (identifier) @function.name
) @function.definition

; ============================================================================
; METHODS INSIDE CLASSES / MODULES
; ============================================================================

(class
  body: (body_statement
    (method
      name: (identifier) @method.name
    ) @method.definition
  )
)

(module
  body: (body_statement
    (method
      name: (identifier) @method.name
    ) @method.definition
  )
)

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
