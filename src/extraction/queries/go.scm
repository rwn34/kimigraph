;; Go Tree-sitter queries for KimiGraph
;; Extracts functions, methods, types, calls, and imports

; ============================================================================
; FUNCTION DEFINITIONS
; ============================================================================

(function_declaration
  name: (identifier) @function.name
) @function.definition

; ============================================================================
; METHOD DEFINITIONS
; ============================================================================

(method_declaration
  name: (field_identifier) @method.name
) @method.definition

; ============================================================================
; TYPE DEFINITIONS
; ============================================================================

(type_declaration
  (type_spec
    name: (type_identifier) @class.name
    type: (struct_type)
  )
) @class.definition

(type_declaration
  (type_spec
    name: (type_identifier) @interface.name
    type: (interface_type)
  )
) @interface.definition

; ============================================================================
; FUNCTION CALLS
; ============================================================================

(call_expression
  function: [
    (identifier) @call.function
    (selector_expression
      field: (field_identifier) @call.method
    )
  ]
) @call.expression

; ============================================================================
; COMMENTS
; ============================================================================

(comment) @comment.definition

; ============================================================================
; ANONYMOUS FUNCTIONS
; ============================================================================

(func_literal) @anonymous.definition

; ============================================================================
; INTERFACE EMBEDDING
; ============================================================================

(interface_type
  (constraint_elem
    (_) @implements.name
  )
) @implements.definition

; ============================================================================
; VARIABLES AND CONSTANTS
; ============================================================================

(var_declaration
  (var_spec
    name: (identifier) @variable.name
  )
) @variable.declaration

(const_declaration
  (const_spec
    name: (identifier) @constant.name
  )
) @constant.definition

; ============================================================================
; IMPORTS
; ============================================================================

; Note: Go import_spec field names vary by tree-sitter version.
; Using child-node matching without field names for compatibility.

(import_declaration
  (import_spec
    (interpreted_string_literal) @import.source
  )
) @import.statement

(import_declaration
  (import_spec_list
    (import_spec
      (interpreted_string_literal) @import.source
    )
  )
) @import.statement
