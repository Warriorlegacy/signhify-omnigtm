import { clampScore, type RawJob } from './sources/types.js';

interface Signal {
  re: RegExp;
  weight: number;
  label: string;
}

const STACK_SIGNALS: Signal[] = [
  { re: /\btypescript\b/i, weight: 7, label: 'TypeScript' },
  { re: /\b(next\.?js|react)\b/i, weight: 6, label: 'React/Next.js' },
  { re: /\b(node\.?js|node)\b/i, weight: 4, label: 'Node.js' },
  { re: /\bpython\b/i, weight: 4, label: 'Python' },
  { re: /\bfull[- ]?stack\b/i, weight: 5, label: 'Full-stack ownership' },
];

const AI_SIGNALS: Signal[] = [
  { re: /\b(ai|llm|genai|agentic)\b/i, weight: 7, label: 'AI / LLM work' },
  { re: /\b(mcp|model context protocol)\b/i, weight: 9, label: 'MCP' },
  { re: /\brag\b|retrieval[- ]augmented/i, weight: 7, label: 'RAG' },
  { re: /\b(embedding|vector (db|database)|pgvector)\b/i, weight: 5, label: 'Vector search' },
  { re: /\b(evals?|evaluation harness)\b/i, weight: 5, label: 'LLM evals' },
  { re: /\b(postgres|supabase|neon)\b/i, weight: 4, label: 'Postgres' },
  { re: /\b(webgl|three\.?js|3d|ffmpeg|remotion)\b/i, weight: 6, label: '3D / media pipeline' },
];

const NEGATIVE_SIGNALS: Signal[] = [
  { re: /security clearance|ts\/sci|top secret/i, weight: -25, label: 'Security clearance required' },
  { re: /\b(on[- ]?site only|must be located in|hybrid in)\b/i, weight: -12, label: 'Location-restricted' },
  { re: /\b(us citizens? only|must be a us person)\b/i, weight: -20, label: 'US-only restriction' },
  { re: /\b(php|ruby on rails|\.net|cobol)\b/i, weight: -10, label: 'Off-profile stack' },
  { re: /\b(sales|account executive|recruiter)\b/i, weight: -30, label: 'Non-engineering role' },
  { re: /\b(10\+|12\+|15\+) years\b/i, weight: -12, label: 'Very senior tenure requirement' },
];

export interface HeuristicScore {
  score: number;
  reasons: string[];
}

/** Deterministic, offline, zero-token pre-score. LLM re-scoring runs only on the shortlist. */
export function heuristicScore(job: Pick<RawJob, 'title' | 'descriptionText' | 'location' | 'remote' | 'salary'>): HeuristicScore {
  const haystack = `${job.title}\n${job.descriptionText.slice(0, 4000)}`;
  const reasons: string[] = [];
  let score = 30;

  let stackPoints = 0;
  for (const signal of STACK_SIGNALS) {
    if (signal.re.test(haystack) && stackPoints < 22) {
      stackPoints += signal.weight;
      reasons.push(signal.label);
    }
  }
  score += stackPoints;

  let aiPoints = 0;
  for (const signal of AI_SIGNALS) {
    if (signal.re.test(haystack) && aiPoints < 24) {
      aiPoints += signal.weight;
      reasons.push(signal.label);
    }
  }
  score += aiPoints;

  if (/\b(senior|staff|founding|lead|principal)\b/i.test(job.title)) {
    score += 8;
    reasons.push('Seniority match');
  }
  if (job.remote || /\b(remote|anywhere|distributed)\b/i.test(`${job.location ?? ''} ${haystack.slice(0, 500)}`)) {
    score += 14;
    reasons.push('Remote');
  }
  if (/\b(india|asia|apac|anywhere|worldwide|global)\b/i.test(`${job.location ?? ''} ${haystack.slice(0, 400)}`)) {
    score += 6;
    reasons.push('Hires from India/APAC');
  }
  if (job.salary) {
    score += 3;
    reasons.push('Salary disclosed');
  }
  for (const signal of NEGATIVE_SIGNALS) {
    if (signal.re.test(haystack)) {
      score += signal.weight;
      reasons.push(`- ${signal.label}`);
    }
  }

  return { score: clampScore(score), reasons: [...new Set(reasons)].slice(0, 8) };
}
