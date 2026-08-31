import { 
  Code2, 
  Paintbrush, 
  PenTool, 
  Megaphone, 
  BarChart3, 
  Briefcase, 
  MoreHorizontal,
  type LucideIcon
} from "lucide-react";

export interface JobCategory {
  id: string;
  label: string;
  tags: string[];
  icon: LucideIcon;
  colorClass: string;
}

export const JOB_CATEGORIES: JobCategory[] = [
  {
    id: "development",
    label: "Development",
    tags: ["smart-contracts", "frontend", "backend", "mobile", "devops", "web3", "rust", "typescript"],
    icon: Code2,
    colorClass: "bg-blue-100 text-blue-700",
  },
  {
    id: "design",
    label: "Design",
    tags: ["ui", "ux", "branding", "logo", "illustration", "figma", "motion"],
    icon: Paintbrush,
    colorClass: "bg-pink-100 text-pink-700",
  },
  {
    id: "writing",
    label: "Writing & Content",
    tags: ["copywriting", "technical-writing", "documentation", "whitepaper", "blog"],
    icon: PenTool,
    colorClass: "bg-emerald-100 text-emerald-700",
  },
  {
    id: "marketing",
    label: "Marketing",
    tags: ["seo", "social-media", "community", "growth", "ads", "email"],
    icon: Megaphone,
    colorClass: "bg-orange-100 text-orange-700",
  },
  {
    id: "data",
    label: "Data & Analytics",
    tags: ["data-science", "machine-learning", "analytics", "visualization", "scraping"],
    icon: BarChart3,
    colorClass: "bg-purple-100 text-purple-700",
  },
  {
    id: "consulting",
    label: "Consulting",
    tags: ["strategy", "tokenomics", "audit", "legal", "finance"],
    icon: Briefcase,
    colorClass: "bg-indigo-100 text-indigo-700",
  },
  {
    id: "other",
    label: "Other",
    tags: [],
    icon: MoreHorizontal,
    colorClass: "bg-slate-100 text-slate-700",
  },
];

export const CATEGORY_IDS = JOB_CATEGORIES.map((c) => c.id);

export function getCategoryById(id: string): JobCategory | undefined {
  return JOB_CATEGORIES.find((c) => c.id === id);
}

export function getTagsForCategory(id: string): string[] {
  return getCategoryById(id)?.tags ?? [];
}
