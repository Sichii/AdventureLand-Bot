rm -f "logs/fvr.log"
forever start -l "/home/pi/Desktop/AdventureLand v3/logs/fvr.log" -o logs/out.log -e logs/err.log build/app.js --color