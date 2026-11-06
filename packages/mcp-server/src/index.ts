#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadEnvFiles, log } from '@omnigtm/core';
import {
  build3dPreview,
  createContext,
  dispatchOutreach,
  draftOutreachTool,
  renderSocialReel,
  searchOpportunities,
  type ToolContext,
  type ToolOutcome,
} from './tools.js';

loadEnvFiles();

export function buildServer(ctx: ToolContext): McpServer {
  const server = new McpServer({ name: 'signhify-omnigtm', version: '1.0.0' });

  const respond = (outcome: ToolOutcome) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(outcome.data, null, 2) }],
    ...(outcome.requiresConfirmation ? { isError: false } : {}),
  });

  const guarded = async (fn: () => Promise<ToolOutcome>) => {
    try {
      return respond(await fn());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.warn('mcp tool failed', { message: message.slice(0, 200) });
      return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
    }
  };

  server.registerTool(
    'search_opportunities',
    {
      title: 'Search opportunities',
      description:
        'Read the GTM pipeline: remote jobs and B2B sprint leads scored for a TypeScript/agents/MCP/3D-web profile. Filter by track, stage, minimum fit score or free-text company/role.',
      inputSchema: {
        track: z.enum(['B2B_SPRINT', 'REMOTE_JOB']).optional(),
        stage: z.string().optional().describe('DISCOVERED | ENRICHED | PREVIEW_BUILT | DRAFT_READY | SENT | REPLIED | BOOKED | CLOSED_WON'),
        minScore: z.number().min(0).max(100).optional(),
        q: z.string().optional().describe('Free-text match on company name or role title'),
        limit: z.number().int().min(1).max(100).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => guarded(() => searchOpportunities(ctx, args))
  );

  server.registerTool(
    'build_3d_preview',
    {
      title: 'Build 60 FPS 3D scroll preview',
      description:
        'Slice an 8-second MP4 into progressive WebP frames (60 FPS, no WebGL bundle) and register the preview so /preview/<slug> can scroll-scrub it. With no inputPath it builds a synthetic demo preview, so it always works on a fresh install.',
      inputSchema: {
        slug: z.string().min(1).max(64).optional(),
        inputPath: z.string().optional().describe('Absolute path to a local MP4 on the server'),
        fps: z.number().int().min(24).max(60).optional(),
        width: z.number().int().min(480).max(1920).optional(),
        sourceUrl: z.string().url().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => guarded(() => build3dPreview(ctx, args))
  );

  server.registerTool(
    'render_social_reel',
    {
      title: 'Render social reel',
      description:
        'Write a 45s vertical script with the grounded LLM chain, enforce the virality + CTA gate, then render an MP4 with FFmpeg. Publishing is never implicit.',
      inputSchema: {
        topic: z.string().min(4).max(200),
        pillar: z.string().optional(),
        preset: z.enum(['full', 'fast']).optional().describe('full = 1080x1920@60fps/45s, fast = 720x1280@30fps/15s'),
        ctaKeyword: z.string().optional(),
        publishTo: z.enum(['instagram', 'linkedin', 'youtube']).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) => guarded(() => renderSocialReel(ctx, args))
  );

  server.registerTool(
    'draft_outreach',
    {
      title: 'Draft outreach email',
      description: 'Generate a voice-card-compliant cold email for one opportunity and move it to DRAFT_READY. Does not send.',
      inputSchema: { opportunityId: z.string().min(1) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) => guarded(() => draftOutreachTool(ctx, args))
  );

  server.registerTool(
    'dispatch_outreach',
    {
      title: 'Dispatch outreach email',
      description:
        'Irreversible send. Without confirm:true it only returns the exact draft for review. With confirm:true it sends through the configured mailbox relay (dryRun defaults to true). A second real send to the same opportunity is refused unless allowResend:true is passed.',
      inputSchema: {
        opportunityId: z.string().min(1),
        subject: z.string().max(140).optional(),
        body: z.string().max(4000).optional(),
        confirm: z.boolean().optional(),
        dryRun: z.boolean().optional(),
        allowResend: z.boolean().optional().describe('Permit a deliberate follow-up after a real send'),
        mailboxEmail: z.string().email().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (args) => guarded(() => dispatchOutreach(ctx, args))
  );

  return server;
}

async function main(): Promise<void> {
  const ctx = await createContext();
  const server = buildServer(ctx);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info('omnigtm mcp server ready', { transport: 'stdio', tools: 5 });
}

const isMain = process.argv[1] ? /mcp-server[\\/]src[\\/]index\.ts$|omnigtm-mcp$/.test(process.argv[1]) : false;
if (isMain) {
  main().catch((error) => {
    log.error('mcp server failed to start', { error: error instanceof Error ? error.message : String(error) });
    process.exit(1);
  });
}
