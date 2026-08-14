package com.echomind.agent;

import com.echomind.llm.LlmGateway;
import com.echomind.config.EchoMindProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;
import java.util.Map;

@Configuration
public class AgentConfig {

    @Bean
    Map<AgentType, List<BaseAgent>> agentPool(LlmGateway llmGateway, EchoMindProperties properties, ObjectMapper objectMapper) {
        var askData = new AskDataClient(
                properties.getAskData().getBaseUrl(),
                java.time.Duration.ofMillis(properties.getAskData().getTimeoutMs()),
                properties.getAskData().getApiKey(),
                objectMapper
        );
        return Map.of(
                AgentType.GENERAL, List.of(new GeneralAgent(llmGateway)),
                AgentType.TECHNICAL, List.of(new TechnicalAgent(llmGateway)),
                AgentType.BILLING, List.of(new BillingAgent(llmGateway)),
                AgentType.DATA, List.of(new DataAgent(llmGateway, askData))
        );
    }
}
