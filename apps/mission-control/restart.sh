#!/bin/bash
kill $(pgrep -f "next dev") 2>/dev/null
sleep 2
cd /home/clawdbot/mission-control
nohup pnpm dev --hostname 0.0.0.0 --port 3000 >> /tmp/mc.log 2>&1 &
MC_PID=$!
echo "MC started. PID: $MC_PID"
sleep 10
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000)
echo "HTTP: $STATUS"
