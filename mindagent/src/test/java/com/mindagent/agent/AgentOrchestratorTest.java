package com.mindagent.agent;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mindagent.intent.IntentCategory;
import com.mindagent.intent.IntentRecognizer;
import com.mindagent.intent.UrgencyLevel;
import com.mindagent.llm.LlmGateway;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

class AgentOrchestratorTest {

    @Test
    void keepsDataAgentFailureExplicitInsteadOfCallingGeneralLlm() {
        LlmGateway unusedGateway = (systemPrompt, userPrompt, temperature, maxTokens) -> "unused";
        IntentRecognizer recognizer = new IntentRecognizer(unusedGateway, new ObjectMapper());
        AtomicInteger generalCalls = new AtomicInteger();

        BaseAgent dataAgent = new StubAgent(
                AgentType.DATA,
                new AgentResponse(AgentType.DATA, "DataAgent 数据查询服务暂时不可用。", false, 0.0, 10, false),
                new AtomicInteger()
        );
        BaseAgent generalAgent = new StubAgent(
                AgentType.GENERAL,
                new AgentResponse(AgentType.GENERAL, "模型推测的数据答案", true, 1.0, 5, false),
                generalCalls
        );
        AgentOrchestrator orchestrator = new AgentOrchestrator(
                recognizer,
                Map.of(AgentType.DATA, List.of(dataAgent), AgentType.GENERAL, List.of(generalAgent))
        );
        AgentRequest request = new AgentRequest(
                "查询上月交易总额",
                "u1",
                "c1",
                "",
                List.of(),
                IntentCategory.DATA_QUERY,
                UrgencyLevel.LOW,
                "req1"
        );

        OrchestratorResult result = orchestrator.run(request);

        assertEquals(AgentType.DATA, result.agentType());
        assertEquals("DataAgent 数据查询服务暂时不可用。", result.response());
        assertFalse(result.response().contains("推测"));
        assertEquals(0, generalCalls.get());
    }

    private static final class StubAgent extends BaseAgent {
        private final AgentType type;
        private final AgentResponse response;
        private final AtomicInteger calls;

        private StubAgent(AgentType type, AgentResponse response, AtomicInteger calls) {
            super((systemPrompt, userPrompt, temperature, maxTokens) -> "unused");
            this.type = type;
            this.response = response;
            this.calls = calls;
        }

        @Override
        public AgentType type() {
            return type;
        }

        @Override
        protected String systemPrompt() {
            return "";
        }

        @Override
        public AgentResponse handle(AgentRequest request) {
            calls.incrementAndGet();
            return response;
        }
    }
}
