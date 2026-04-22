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
  name: (identifier) @enum.name
) @enum.definition

(enum_declaration
  body: (enum_body
    (enum_constant
      name: (identifier) @enum_member.name
    ) @enum_member.definition
  )
)

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
; INHERITANCE
; ============================================================================

(class_declaration
  (superclass
    (_) @extends.name
  )
) @extends.definition

(class_declaration
  (super_interfaces
    (type_list
      (type_identifier) @implements.name
    )
  )
) @implements.definition

(interface_declaration
  (extends_interfaces
    (type_list
      (type_identifier) @extends.name
    )
  )
) @extends.definition

; ============================================================================
; FIELDS
; ============================================================================

(field_declaration
  declarator: (variable_declarator
    name: (identifier) @property.name
  )
) @property.definition

; ============================================================================
; IMPORTS
; ============================================================================

(import_declaration
  (identifier) @import.source
) @import.statement
