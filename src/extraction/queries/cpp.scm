; C++ language captures for KimiGraph

; Functions
(function_definition
  declarator: (function_declarator
    declarator: (identifier) @function.name)) @function.definition

; Methods (inside class/struct)
(function_definition
  declarator: (function_declarator
    declarator: (field_identifier) @method.name)) @method.definition

; Classes (without inheritance)
(class_specifier
  (type_identifier) @class.name) @class.definition

; Classes with inheritance
(class_specifier
  (type_identifier) @class.name
  (base_class_clause
    (type_identifier) @extends.name)) @extends.definition

; Structs (mapped to class)
(struct_specifier
  (type_identifier) @class.name) @class.definition

; Namespaces (mapped to class for navigation)
(namespace_definition
  (namespace_identifier) @class.name) @class.definition

; Enum members
(enumerator
  name: (identifier) @enum_member.name) @enum_member.definition

; Class/struct fields
(field_declaration
  declarator: (field_identifier) @property.name) @property.definition

(field_declaration
  declarator: (pointer_declarator
    declarator: (field_identifier) @property.name)) @property.definition

; Function calls
(call_expression
  function: (identifier) @call.function) @call.expression

(call_expression
  function: (field_expression
    field: (field_identifier) @call.method)) @call.expression

; Method calls via qualified identifier
(call_expression
  function: (qualified_identifier
    name: (identifier) @call.function)) @call.expression

; Comments
(comment) @comment.definition

; Anonymous functions
(lambda_expression) @anonymous.definition

; Includes
(preproc_include
  path: (string_literal) @import.source) @import.statement

(preproc_include
  path: (system_lib_string) @import.source) @import.statement
