import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createVerifyAiRecommendationReadiness } from "../../../lib/ai-recommendation-readiness";
import { AiRecommendationReadinessPanel } from "./AiRecommendationReadinessPanel";

describe("AiRecommendationReadinessPanel", () => {
  it("renders local recommendation gates without model or cloud claims", () => {
    render(<AiRecommendationReadinessPanel readiness={createVerifyAiRecommendationReadiness()} />);

    const panel = screen.getByRole("region", { name: /ai recommendation readiness/i });

    expect(within(panel).getByText("AI Recommendation Readiness")).toBeInTheDocument();
    expect(within(panel).getByText("Local Scorer")).toBeInTheDocument();
    expect(within(panel).getByText("Data Minimization")).toBeInTheDocument();
    expect(within(panel).getByText("Explanation Review")).toBeInTheDocument();
    expect(within(panel).getByText("Hosted Model Config")).toBeInTheDocument();
    expect(within(panel).getByText("Cloud Profile Storage/RLS")).toBeInTheDocument();
    expect(within(panel).getByText("Provider Telemetry Contract")).toBeInTheDocument();
    expect(within(panel).getByText("Learned Profile Ranking")).toBeInTheDocument();
    expect(within(panel).getAllByText("Consent Boundary").length).toBeGreaterThan(0);
    expect(within(panel).getByText("Evaluation/Audit/Rollback")).toBeInTheDocument();
    expect(within(panel).getByText("Local scoring only")).toBeInTheDocument();
    expect(within(panel).getByText("Local explanation packet")).toBeInTheDocument();
    expect(within(panel).getByText("Local consent/audit packet")).toBeInTheDocument();
    expect(within(panel).getByText("Browser-local learning only")).toBeInTheDocument();
    expect(within(panel).getByText("No real model call")).toBeInTheDocument();
    expect(within(panel).getByText("No hosted inference")).toBeInTheDocument();
    expect(within(panel).getByText("No cloud personalization")).toBeInTheDocument();
    expect(within(panel).getByText("No provider telemetry fetch")).toBeInTheDocument();
    expect(within(panel).getByText("No hosted learned profile")).toBeInTheDocument();
    expect(within(panel).getByText("No provider ranking sync")).toBeInTheDocument();
    expect(within(panel).getByText("Consent Audit Packet")).toBeInTheDocument();
    expect(within(panel).getByText("Local Review Only")).toBeInTheDocument();
    expect(within(panel).getByText("ai-consent-local-2026-06-16")).toBeInTheDocument();
    expect(within(panel).getByText("audit-local-ai-rec-001")).toBeInTheDocument();
    expect(within(panel).getByText(/writes: none/i)).toBeInTheDocument();
    expect(within(panel).getByText("No model prompt sent")).toBeInTheDocument();
    expect(within(panel).getByText("No hosted inference write")).toBeInTheDocument();
    expect(within(panel).getByText("Prompt Redaction")).toBeInTheDocument();
    expect(within(panel).getByText("Retention/Delete/Export")).toBeInTheDocument();
    expect(within(panel).getByText(/redacted-profile-placeholder/i)).toBeInTheDocument();
    expect(within(panel).getByText("Local No-Write Evidence")).toBeInTheDocument();
    expect(within(panel).getByText("Sample Hash")).toBeInTheDocument();
    expect(within(panel).getAllByText(/fnv1a32:/i).length).toBeGreaterThan(0);
    expect(within(panel).getByText("Model Gateway")).toBeInTheDocument();
    expect(within(panel).getByText("Provider Telemetry")).toBeInTheDocument();
    expect(within(panel).getByText("Rollout")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /\b(?:model|llm|inference)\s+(?:connected|ready|enabled|active|served|trained|succeeded|sent)\b|\bhosted\s+(?:ai|model|inference)\s+(?:ready|enabled|connected|active|live)\b|\bcloud\s+(?:profile|personalization)\s+(?:ready|enabled|synced|active|live)\b|\blearned\s+user[- ]profile\s+(?:ready|synced|trained)\b|\bprovider\s+(?:telemetry|ranking)\s+(?:live|ready|enabled|synced|verified|connected)\b|\b(?:recommendation|ranking)\s+(?:model|service)\s+(?:ready|enabled|connected|active|live)\b/i,
    );
  });
});
