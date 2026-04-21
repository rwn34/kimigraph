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
  name: (identifier) @class.name
) @class.definition

; ============================================================================
; METHOD CALLS
; ============================================================================

(method_invocation
  name: (identifier) @call.method
) @call.expression

; ============================================================================
; IMPORTS
; ============================================================================

(import_declaration
  (identifier) @import.source
) @import.statement
