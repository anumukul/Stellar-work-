export interface JobCategory {
  id: string;
  label: string;
  tags: string[];
}

export const JOB_CATEGORIES: JobCategory[] = [
  {
    id: "development",
    label: "Development",
    tags: ["smart-contracts", "frontend", "backend", "mobile", "devops", "web3", "rust", "typescript"],
  },
  {
    id: "design",
    label: "Design",
    tags: ["ui", "ux", "branding", "logo", "illustration", "figma", "motion"],
  },
  {
    id: "writing",
    label: "Writing & Content",
    tags: ["copywriting", "technical-writing", "documentation", "whitepaper", "blog"],
  },
  {
    id: "marketing",
    label: "Marketing",
    tags: ["seo", "social-media", "community", "growth", "ads", "email"],
  },
  {
    id: "data",
    label: "Data & Analytics",
    tags: ["data-science", "machine-learning", "analytics", "visualization", "scraping"],
  },
  {
    id: "consulting",
    label: "Consulting",
    tags: ["strategy", "tokenomics", "audit", "legal", "finance"],
  },
  {
    id: "other",
    label: "Other",
    tags: [],
  },
];

export const CATEGORY_IDS = JOB_CATEGORIES.map((c) => c.id);

export function getCategoryById(id: string): JobCategory | undefined {
  return JOB_CATEGORIES.find((c) => c.id === id);
}

export function getTagsForCategory(id: string): string[] {
  return getCategoryById(id)?.tags ?? [];
}
