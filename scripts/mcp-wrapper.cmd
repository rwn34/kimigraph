@echo off
echo [WRAPPER] Started at %date% %time% >> C:\Users\rwn34\mcp-debug.log
echo [WRAPPER] Args: %* >> C:\Users\rwn34\mcp-debug.log
echo [WRAPPER] CWD: %cd% >> C:\Users\rwn34\mcp-debug.log
node "C:\Users\rwn34\AppData\Roaming\npm\node_modules\rwn-kimigraph\dist\bin\kimigraph.js" %* 2>> C:\Users\rwn34\mcp-debug.log
echo [WRAPPER] Exit code: %errorlevel% at %date% %time% >> C:\Users\rwn34\mcp-debug.log
