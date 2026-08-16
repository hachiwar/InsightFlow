package com.mindagent.agent;

import com.mindagent.intent.IntentCategory;

public record OrchestratorResult(
        String requestId,
        String response,
        AgentType agentType,
        IntentCategory intent,
        boolean escalated,
        long latencyMs
) {
}
