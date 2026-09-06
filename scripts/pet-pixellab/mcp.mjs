// Uses the existing project MCP configuration; credentials never enter argv or logs.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
export async function pixelTool(name, args = {}) {
  const config = JSON.parse(readFileSync(join(homedir(), '.claude.json'), 'utf8'));
  const cwd = process.cwd().replaceAll('\\', '/').toLowerCase();
  const match = Object.entries(config.projects ?? {}).filter(([path, project]) => project.mcpServers?.pixellab && (cwd === path.toLowerCase() || cwd.startsWith(`${path.toLowerCase()}/`))).sort(([a], [b]) => b.length - a.length)[0];
  if (!match) throw new Error('No PixelLab MCP configured for this project in ~/.claude.json');
  const server = match[1].mcpServers.pixellab;
  const response = await fetch(server.url, {method:'POST', headers:{...server.headers, Accept:'application/json, text/event-stream', 'Content-Type':'application/json'}, body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
  if (!response.ok) throw new Error(`PixelLab HTTP ${response.status}`);
  const body = await response.text();
  const message = JSON.parse(body.startsWith('event:') ? body.split('\n').find(line=>line.startsWith('data:')).slice(5).trim() : body);
  if (message.error || message.result?.isError) throw new Error(JSON.stringify(message.error ?? message.result));
  return message.result;
}
if (process.argv[1]?.endsWith('mcp.mjs')) {
  const result = await pixelTool(process.argv[2], JSON.parse(process.argv[3] ?? '{}'));
  console.log(JSON.stringify({...result,content:result.content?.filter(item=>item.type==='text')}));
}
