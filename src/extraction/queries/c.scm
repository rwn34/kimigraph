; C language captures for KimiGraph

; Functions
(function_declarator
  declarator: (identifier) @function.name) @function.definition

; Function definitions
(function_definition
  declarator: (function_declarator
    declarator: (identifier) @function.name)) @function.definition

; Structs (mapped to class)
(struct_specifier
  name: (type_identifier) @class.name) @class.definition

; Unions (mapped to class)
(union_specifier
  name: (type_identifier) @class.name) @class.definition

; Typedef structs
(type_definition
  type: (struct_specifier
    name: (type_identifier)? @class.name)
  declarator: (type_identifier) @class.name) @class.definition

; Function calls
(call_expression
  function: (identifier) @call.function) @call.expression

(call_expression
  function: (field_expression
    field: (field_identifier) @call.method)) @call.expression

; Includes
(preproc_include
  path: (string_literal) @import.source) @import.statement

(preproc_include
  path: (system_lib_string) @import.source) @import.statement
