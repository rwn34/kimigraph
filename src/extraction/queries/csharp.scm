; C# language captures for KimiGraph

; Methods
(method_declaration
  (identifier) @method.name) @method.definition

; Constructors
(constructor_declaration
  (identifier) @method.name) @method.definition

; Classes
(class_declaration
  (identifier) @class.name) @class.definition

; Interfaces
(interface_declaration
  (identifier) @interface.name) @interface.definition

; Structs (mapped to class)
(struct_declaration
  (identifier) @class.name) @class.definition

; Enums (mapped to class)
(enum_declaration
  (identifier) @class.name) @class.definition

; Method invocations
(invocation_expression
  function: (identifier) @call.function) @call.expression

(invocation_expression
  function: (member_access_expression
    name: (identifier) @call.method)) @call.expression

; Using directives
(using_directive
  (identifier) @import.source) @import.statement

(using_directive
  (qualified_name) @import.source) @import.statement
