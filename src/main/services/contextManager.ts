import { estimateTokens, truncateToTokens } from './tokenCounter';
import { readMaterialContent } from './fileService';
import type { Material, ChatMessage, SmartContext } from '../../types';

const MAX_CONTEXT_TOKENS = 180_000; // Leave headroom for response

// Token budget per tier
const TIER_BUDGETS = {
  1: 1.0,   // 100% — never compress
  2: 0.70,  // 70%+ preserve
  3: 0.20,  // 20% compress aggressively
};

interface BuildContextOptions {
  userMessage: string;
  chatHistory: ChatMessage[];
  uploadedMaterials: Material[];
  generatedContent?: {
    studyGuide?: string;
    cheatsheet?: string;
    teachingNotes?: string[];
  };
}

export async function buildSmartContext(opts: BuildContextOptions): Promise<SmartContext> {
  const { userMessage, chatHistory, uploadedMaterials, generatedContent } = opts;

  // -- TIER 1: Never compress --
  const tier1Parts: string[] = [];

  if (generatedContent?.studyGuide) {
    tier1Parts.push(`=== STUDY GUIDE (ALWAYS PRESERVE) ===\n${generatedContent.studyGuide}`);
  }
  if (generatedContent?.cheatsheet) {
    tier1Parts.push(`=== CHEATSHEET (ALWAYS PRESERVE) ===\n${generatedContent.cheatsheet}`);
  }
  if (generatedContent?.teachingNotes?.length) {
    tier1Parts.push(`=== TEACHING NOTES ===\n${generatedContent.teachingNotes.join('\n\n')}`);
  }

  // Tier 1 materials (guides)
  const tier1Materials = uploadedMaterials.filter((m) => m.tier === 1);
  for (const mat of tier1Materials) {
    if (mat.content) {
      tier1Parts.push(`=== ${mat.name.toUpperCase()} [TIER 1 - NEVER COMPRESS] ===\n${mat.content}`);
    }
  }

  const tier1Text = tier1Parts.join('\n\n');
  const tier1Tokens = estimateTokens(tier1Text);

  // -- TIER 2: Preserve if space --
  const tier2Materials = uploadedMaterials.filter((m) => m.tier === 2);
  const tier2Parts: string[] = [];
  const budgetAfterTier1 = MAX_CONTEXT_TOKENS - tier1Tokens;
  const tier2Budget = Math.floor(budgetAfterTier1 * TIER_BUDGETS[2]);

  for (const mat of tier2Materials) {
    if (mat.content) {
      tier2Parts.push(`=== ${mat.name.toUpperCase()} [TIER 2] ===\n${mat.content}`);
    }
  }

  const tier2Raw = tier2Parts.join('\n\n');
  const tier2Text = truncateToTokens(tier2Raw, tier2Budget);
  const tier2Tokens = estimateTokens(tier2Text);

  // -- TIER 3: Compress aggressively --
  const tier3Materials = uploadedMaterials.filter((m) => m.tier === 3);
  const tier3Parts: string[] = [];
  const budgetAfterTier2 = budgetAfterTier1 - tier2Tokens;
  const tier3Budget = Math.floor(budgetAfterTier2 * TIER_BUDGETS[3]);

  for (const mat of tier3Materials) {
    if (mat.content) {
      // Only first 500 tokens per tier-3 material
      const compressed = truncateToTokens(mat.content, 500);
      tier3Parts.push(`=== ${mat.name.toUpperCase()} [TIER 3 - SUMMARY ONLY] ===\n${compressed}`);
    }
  }

  const tier3Raw = tier3Parts.join('\n\n');
  const tier3Text = truncateToTokens(tier3Raw, tier3Budget);
  const tier3Tokens = estimateTokens(tier3Text);

  console.log('[SmartContext] Stats:', {
    tier1Tokens,
    tier2Tokens,
    tier3Tokens,
    totalTokens: tier1Tokens + tier2Tokens + tier3Tokens,
  });

  return {
    tier1: tier1Text,
    tier2: tier2Text,
    tier3: tier3Text,
    chatHistory,
    userMessage,
    stats: {
      tier1Tokens,
      tier2Tokens,
      tier3Tokens,
      totalTokens: tier1Tokens + tier2Tokens + tier3Tokens,
    },
  };
}

export async function loadMaterialContents(materials: Material[]): Promise<Material[]> {
  return Promise.all(
    materials.map(async (mat) => {
      if (!mat.content) {
        const content = await readMaterialContent(mat.path);
        return { ...mat, content };
      }
      return mat;
    })
  );
}
