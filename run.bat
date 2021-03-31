setlocal
set bdir=%~dp0
del "%bdir%logs\fvr.log"
forever start -l "%bdir%logs\fvr.log" -o logs\out.log -e logs\err.log build\app.js --color