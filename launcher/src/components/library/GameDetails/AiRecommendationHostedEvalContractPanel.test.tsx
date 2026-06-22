import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createVerifyAiRecommendationHostedEvalContract } from "../../../lib/ai-recommendation-hosted-eval-contract";
import { AiRecommendationHostedEvalContractPanel } from "./AiRecommendationHostedEvalContractPanel";

const falseHostedEvalClaim =
  /\b(?:model|llm|inference)\s+(?:called|sent|served|connected|ready|enabled|active|live|passed)\b|\bhosted\s+(?:model|inference|eval)\s+(?:ready|enabled|connected|active|live|passed)\b|\bcloud\s+(?:profile|personalization)\s+(?:read|replayed|synced|trained|active|live)\b|\bprovider\s+telemetry\s+(?:fetched|synced|verified|live)\b|\b(?:rollout|ab test|a\/b)\s+(?:enabled|live|running)\b/i;

describe("AiRecommendationHostedEvalContractPanel", () => {
  it("renders hosted eval fixtures without model or rollout claims", () => {
    render(
      <AiRecommendationHostedEvalContractPanel
        contract={createVerifyAiRecommendationHostedEvalContract()}
      />,
    );

    const panel = screen.getByRole("region", {
      name: /ai recommendation hosted eval contract/i,
    });

    expect(within(panel).getByText("AI Hosted Eval Contract")).toBeInTheDocument();
    expect(within(panel).getByText("Local eval contract")).toBeInTheDocument();
    expect(within(panel).getByText("Deterministic Baseline Fixture")).toBeInTheDocument();
    expect(within(panel).getByText("Prompt Regression Suite")).toBeInTheDocument();
    expect(within(panel).getByText("Quality Threshold Review")).toBeInTheDocument();
    expect(within(panel).getByText("Safety/Abuse Fixtures")).toBeInTheDocument();
    expect(within(panel).getByText("Consent Sample Review")).toBeInTheDocument();
    expect(within(panel).getByText("Hosted Runner Handshake")).toBeInTheDocument();
    expect(within(panel).getByText("Cloud Profile Replay")).toBeInTheDocument();
    expect(within(panel).getByText("Provider Telemetry Replay")).toBeInTheDocument();
    expect(within(panel).getByText("Rollout/Rollback Gate")).toBeInTheDocument();
    expect(within(panel).getByText("No-Write Gateway / Eval Ledger")).toBeInTheDocument();
    expect(within(panel).getByText("Hash Pinned")).toBeInTheDocument();
    expect(within(panel).getAllByText(/fnv1a32:/i).length).toBeGreaterThanOrEqual(2);
    expect(within(panel).getByText("Model Invocation")).toBeInTheDocument();
    expect(within(panel).getByText("Prompt Upload")).toBeInTheDocument();
    expect(within(panel).getByText("Rollout Traffic")).toBeInTheDocument();
    expect(within(panel).getByText("No model invocation")).toBeInTheDocument();
    expect(within(panel).getByText("No hosted inference")).toBeInTheDocument();
    expect(within(panel).getByText("No prompt upload")).toBeInTheDocument();
    expect(within(panel).getByText("No cloud profile replay")).toBeInTheDocument();
    expect(within(panel).getByText("No provider telemetry fetch")).toBeInTheDocument();
    expect(within(panel).getByText("No live A/B rollout")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(falseHostedEvalClaim);
  });
});
