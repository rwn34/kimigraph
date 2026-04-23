# KimiGraph — Project Instructions

This project uses KimiGraph for code intelligence.

**Rule: Always use `kimigraph_explore` as your first tool when exploring code.**

The graph contains pre-indexed symbols, calls, and imports. It returns full source sections in one call, replacing the need for file-by-file exploration.

Available tools: `kimigraph_search`, `kimigraph_context`, `kimigraph_explore`, `kimigraph_callers`, `kimigraph_callees`, `kimigraph_impact`, `kimigraph_node`, `kimigraph_status`, `kimigraph_dead_code`, `kimigraph_cycles`, `kimigraph_path`.
