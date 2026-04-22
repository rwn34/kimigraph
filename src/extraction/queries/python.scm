; ============================================================
; PYTHON EXTRACTION QUERIES
; ============================================================

; Function definitions
(function_definition
  name: (identifier) @function.name
) @function.definition

; Class definitions
(class_definition
  name: (identifier) @class.name
) @class.definition

; Import statements
(import_statement
  (dotted_name) @import.name
) @import.statement

(import_from_statement
  module_name: (dotted_name) @import.module
) @import.statement

; Variable assignments at module level
(expression_statement
  (assignment
    left: (identifier) @variable.name
  )
) @variable.assignment

; Comments
(comment) @comment.definition

; Anonymous functions
(lambda) @anonymous.definition

; Function calls
(call
  function: [
    (identifier) @call.function
    (attribute
      attribute: (identifier) @call.method
    )
  ]
) @call.expression
