import { NextResponse } from 'next/server';

// TODO: Implement actual gateway cron list call
// import { invokeGateway } from '@/lib/gateway';
// const crons = await invokeGateway('cron', { action: 'list' });

const hardcodedCrons = [
  { agent: "Frigg", task: "Morning Brief", time: "07:03", days: [1,2,3,4,5], squad: "clop_cabinet" },
  { agent: "Frigg", task: "EOD Summary", time: "17:47", days: [1,2,3,4,5], squad: "clop_cabinet" },
  { agent: "Mimir", task: "Research Digest", time: "18:13", days: [0,1,2,3,4,5,6], squad: "clop_cabinet" },
  { agent: "Loki", task: "Weekly Brief", time: "09:17", days: [5], squad: "clop_cabinet" },
  { agent: "Claw", task: "Memory Maintenance", time: "23:43", days: [0,1,2,3,4,5,6], squad: "platform" },
];

export async function GET() {
  return NextResponse.json({
    crons: hardcodedCrons,
    source: 'hardcoded', // Change to 'gateway' when implemented
  });
}
