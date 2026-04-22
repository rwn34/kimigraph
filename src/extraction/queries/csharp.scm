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

; Enums
(enum_declaration
  (identifier) @enum.name) @enum.definition

(enum_member_declaration
  (identifier) @enum_member.name
) @enum_member.definition

; Method invocations
(invocation_expression
  function: (identifier) @call.function) @call.expression

(invocation_expression
  function: (member_access_expression
    name: (identifier) @call.method)) @call.expression

; Comments
(comment) @comment.definition

; Anonymous functions
(lambda_expression) @anonymous.definition
(anonymous_method_expression) @anonymous.definition

; Inheritance
(class_declaration
  (base_list
    (_) @extends.name
  )
) @extends.definition

(interface_declaration
  (base_list
    (_) @extends.name
  )
) @extends.definition

; Properties
(property_declaration
  name: (identifier) @property.name
) @property.definition

(field_declaration
  (variable_declaration
    (variable_declarator
      (identifier) @property.name
    )
  )
) @property.definition

; Using directives
(using_directive
  (identifier) @import.source) @import.statement

(using_directive
  (qualified_name) @import.source) @import.statement
