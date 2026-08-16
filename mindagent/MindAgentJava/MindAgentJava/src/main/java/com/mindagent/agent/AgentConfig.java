package com.mindagent.agent;

import com.mindagent.llm.LlmGateway;
import com.mindagent.config.MindAgentProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;
import java.util.Map;

@Configuration
public class AgentConfig {

    @Bean
    Map<AgentType, List<BaseAgent>> agentPool(LlmGateway llmGateway, MindAgentProperties properties, ObjectMapper objectMapper) {
        var dataAgent = new DataAgentClient(
                properties.getDataAgent().getBaseUrl(),
                java.time.Duration.ofMillis(properties.getDataAgent().getTimeoutMs()),
                properties.getDataAgent().getApiKey(),
                objectMapper
        );
        return Map.of(
                AgentType.GENERAL, List.of(new GeneralAgent(llmGateway)),
                AgentType.TECHNICAL, List.of(new TechnicalAgent(llmGateway)),
                AgentType.BILLING, List.of(new BillingAgent(llmGateway)),
                AgentType.DATA, List.of(new DataAgent(llmGateway, dataAgent))
        );
    }
}
