import OpenAI from 'openai';
import { z } from 'zod';
import { config } from '../config';

/** A service offered by the agency, used to help the model pick a best-fit. */
export interface ServiceInfo {
  title: string;
  description: string;
  benefit: string;
}

/** What we know about a prospect channel/lead. */
export interface LeadInfo {
  channelName: string;
  channelUrl?: string | null;
  subscriberCount?: string | null;
  country?: string | null;
  /** Optional richer context (channel description, recent video titles) for deep analysis. */
  extraContext?: string | null;
}

export interface OutreachDraft {
  recommendedService: string;
  reason: string;
  confidence: number; // 0-100
  subject: string;
  body: string;
}

function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!config.openai.apiKey) {
    throw httpError(400, 'OPENAI_API_KEY is not configured on the API.');
  }
  if (!client) client = new OpenAI({ apiKey: config.openai.apiKey });
  return client;
}

const draftSchema = z.object({
  recommendedService: z.string(),
  reason: z.string(),
  confidence: z.number().min(0).max(100),
  subject: z.string(),
  body: z.string(),
});

const AGENCY_CONTEXT = `You write cold outreach for "Braddox", a YouTube-focused agency that sells
YouTube automation / "cash cow" channel services (faceless channels, scripting, editing,
thumbnails, channel management, monetization growth) primarily to US-based clients.`;

function buildSystemPrompt(services: ServiceInfo[]): string {
  const catalog = services
    .map((s, i) => `${i + 1}. ${s.title} — ${s.description} (${s.benefit})`)
    .join('\n');
  return `${AGENCY_CONTEXT}

You are an expert B2B cold-email copywriter and sales strategist. Given a prospect YouTube channel
and Braddox's service catalog, do two things:
1) Pick the SINGLE best-fit service for this specific channel from the catalog below.
2) Write a short, highly personalized cold email that would actually get a reply.

SERVICE CATALOG:
${catalog}

RULES:
- recommendedService MUST be one of the exact service titles above.
- Personalize the first line to the channel (reference its niche/name/size naturally). No generic "I love your content".
- Keep the body under ~120 words. Plain text (no markdown). Warm, direct, confident, not salesy.
- One clear soft CTA (e.g. a quick reply or a short call). No fake claims or made-up metrics.
- Subject under 55 chars, lowercase-ish, curiosity-driven, no spammy words or ALL CAPS.
- Do NOT include a signature, greeting placeholders like [Name], or an unsubscribe line — those are added later.
- Respond ONLY as compact JSON: {"recommendedService","reason","confidence","subject","body"}.
  "reason" = one sentence on why this service fits. "confidence" = integer 0-100.`;
}

function buildUserPrompt(lead: LeadInfo): string {
  const lines = [
    `Channel name: ${lead.channelName}`,
    lead.subscriberCount ? `Subscribers: ${lead.subscriberCount}` : null,
    lead.country ? `Country: ${lead.country}` : null,
    lead.channelUrl ? `URL: ${lead.channelUrl}` : null,
    lead.extraContext ? `\nAdditional context:\n${lead.extraContext}` : null,
  ].filter(Boolean);
  return lines.join('\n');
}

/** Generate one personalized outreach draft + best-fit service for a single lead. */
export async function draftOutreach(
  lead: LeadInfo,
  services: ServiceInfo[],
  opts?: { deep?: boolean }
): Promise<OutreachDraft> {
  if (services.length === 0) {
    throw httpError(400, 'No services configured to match against. Add services first.');
  }
  const openai = getClient();
  const model = opts?.deep ? config.openai.deepModel : config.openai.model;

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.6,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: buildSystemPrompt(services) },
      { role: 'user', content: buildUserPrompt(lead) },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw httpError(502, 'AI returned an unparseable response.');
  }
  const result = draftSchema.safeParse(parsed);
  if (!result.success) {
    throw httpError(502, 'AI response did not match the expected format.');
  }

  // Snap the recommended service to a real catalog title (case-insensitive) when possible.
  const match = services.find(
    (s) => s.title.toLowerCase() === result.data.recommendedService.trim().toLowerCase()
  );
  return {
    ...result.data,
    confidence: Math.round(result.data.confidence),
    recommendedService: match?.title ?? result.data.recommendedService,
  };
}

/**
 * Draft outreach for many leads in parallel (bounded concurrency). Returns a result per lead in the
 * same order; failed drafts are returned as { error } so one bad lead never fails the whole batch.
 */
export async function draftOutreachBulk(
  leads: LeadInfo[],
  services: ServiceInfo[],
  concurrency = 5
): Promise<Array<{ draft?: OutreachDraft; error?: string }>> {
  const results: Array<{ draft?: OutreachDraft; error?: string }> = new Array(leads.length);
  let cursor = 0;
  async function worker() {
    while (cursor < leads.length) {
      const index = cursor++;
      try {
        results[index] = { draft: await draftOutreach(leads[index]!, services) };
      } catch (err) {
        results[index] = { error: err instanceof Error ? err.message : 'draft failed' };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, leads.length) }, worker));
  return results;
}

export function isOpenAiConfigured(): boolean {
  return Boolean(config.openai.apiKey);
}
