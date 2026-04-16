export type AppStatus = "Applied" | "Interviewing" | "Rejected";

export interface Application {
  id: number;
  company: string;
  role: string;
  status: AppStatus;
  date: string;
  followUp: boolean;
  logo: string;
  logoColor: string;
  recruiterEmail: string[];
}

export interface AnalysisResult {
  company: string;
  role: string;
  recruiterEmail: string;
  matchScore: number;
  matched: string[];
  missing: string[];
  suggestedBullet: string;
  email: string;
}

export const MOCK_APPLICATIONS: Application[] = [
  { id: 1, company: "Stripe", role: "Frontend Engineer", status: "Interviewing", date: "Apr 1, 2026", followUp: false, logo: "S", logoColor: "#635bff", recruiterEmail: "recruiting@stripe.com" },
  { id: 2, company: "Linear", role: "Full-Stack Developer", status: "Applied", date: "Apr 3, 2026", followUp: true, logo: "L", logoColor: "#5e6ad2", recruiterEmail: "jobs@linear.app" },
  { id: 3, company: "Vercel", role: "SWE, Frontend", status: "Applied", date: "Apr 5, 2026", followUp: false, logo: "V", logoColor: "#171717", recruiterEmail: "recruiting@vercel.com" },
  { id: 4, company: "Cohere", role: "ML Engineer", status: "Interviewing", date: "Mar 28, 2026", followUp: true, logo: "C", logoColor: "#39c5cf", recruiterEmail: "careers@cohere.ai" },
  { id: 5, company: "PlanetScale", role: "Backend Engineer", status: "Rejected", date: "Mar 20, 2026", followUp: false, logo: "P", logoColor: "#1ec3b0", recruiterEmail: "hr@planetscale.com" },
  { id: 6, company: "Anthropic", role: "SWE Intern", status: "Applied", date: "Apr 6, 2026", followUp: false, logo: "A", logoColor: "#cc785c", recruiterEmail: "hiring@anthropic.com" },
];

export const MOCK_ANALYSIS: AnalysisResult = {
  company: "Vercel",
  role: "Software Engineer, Frontend",
  recruiterEmail: "recruiting@vercel.com",
  matchScore: 85,
  matched: ["React", "TypeScript", "Next.js", "REST APIs", "Git", "Node.js", "CI/CD", "AWS"],
  missing: ["GraphQL", "Docker", "Kubernetes", "Redis", "gRPC"],
  suggestedBullet:
    "Engineered a Python-based 3D segmentation pipeline (U-Net, PyTorch) for tooth and pulp isolation from CBCT scans, achieving 0.89 mean Dice — demonstrating end-to-end ownership of a data-intensive ML system analogous to Vercel's edge compute infrastructure.",
  email: `Subject: Application for Software Engineer, Frontend — Arjun Kumar

Hi Priya,

I'm writing to express my strong interest in the Software Engineer, Frontend role at Vercel. As a final-year CS student with hands-on experience in Next.js, TypeScript, and Node.js, I'm genuinely excited by Vercel's mission to make the web faster for developers everywhere.

One project I'm particularly proud of is a Python-based 3D segmentation system for isolating tooth and pulp structures from CBCT dental scans. Building it required designing high-throughput data pipelines, iterating rapidly on PyTorch model architectures, and owning the full stack from preprocessing to evaluation — a mindset I'd bring directly to your team.

I'd love the opportunity to discuss how my background aligns with what you're building at Vercel. I've attached my resume and portfolio for reference.

Warm regards,
Arjun Kumar
arjun.kumar@example.com | arjunkumar.dev | github.com/arjunkumar`,
};
