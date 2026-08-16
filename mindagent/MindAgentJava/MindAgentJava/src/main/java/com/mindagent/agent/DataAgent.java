package com.mindagent.agent;

import com.mindagent.llm.LlmGateway;

import java.time.Duration;
import java.time.Instant;

public class DataAgent extends BaseAgent {

    private final DataAgentClient dataAgentClient;

    public DataAgent(LlmGateway llmGateway, DataAgentClient dataAgentClient) {
        super(llmGateway);
        this.dataAgentClient = dataAgentClient;
    }

    @Override
    public AgentType type() {
        return AgentType.DATA;
    }

    @Override
    protected String systemPrompt() {
        return "你是企业数据分析助手。";
    }

    @Override
    public AgentResponse handle(AgentRequest request) {
        Instant start = Instant.now();
        try {
            String content = dataAgentClient.query(request.message());
            long latency = Duration.between(start, Instant.now()).toMillis();
            stats().record(true, latency);
            return new AgentResponse(type(), content, true, 1.0, latency, false);
        } catch (Exception ex) {
            long latency = Duration.between(start, Instant.now()).toMillis();
            stats().record(false, latency);
            return new AgentResponse(type(), "DataAgent 数据查询服务暂时不可用。", false, 0.0, latency, false);
        }
    }
}
