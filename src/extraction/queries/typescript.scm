; ============================================================
; TYPESCRIPT / JAVASCRIPT EXTRACTION QUERIES
; ============================================================

; Function declarations
(function_declaration
  name: (identifier) @function.name
) @function.definition

; Arrow functions assigned to variables
(lexical_declaration
  (variable_declarator
    name: (identifier) @function.name
    value: (arrow_function)
  )
) @function.definition

; Class declarations
(class_declaration
  name: (type_identifier) @class.name
) @class.definition

; Method definitions
(method_definition
  name: (property_identifier) @method.name
) @method.definition

; Interface declarations
(interface_declaration
  name: (type_identifier) @interface.name
) @interface.definition

; Type alias declarations
(type_alias_declaration
  name: (type_identifier) @type.name
) @type.definition

; Variable declarations (const/let/var)
(lexical_declaration
  (variable_declarator
    name: (identifier) @variable.name
  )
) @variable.declaration

(variable_declaration
  (variable_declarator
    name: (identifier) @variable.name
  )
) @variable.declaration

; Import statements
(import_statement
  source: (string) @import.source
) @import.statement

; Export statements
(export_statement) @export.statement

; Function calls
(call_expression
  function: [
    (identifier) @call.function
    (member_expression
      property: (property_identifier) @call.method
    )
  ]
) @call.expression
